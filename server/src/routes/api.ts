import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getAllConversations,
  getConversationById,
  getMessages,
  getAnalytics,
  createLead,
  createConversation,
  addMessage,
  logEvent,
  updateConversation,
  getAllLeads,
  canAccessConversation,
} from '../models/repository.js';
import {
  handleInboundSMS,
  sendHumanReply,
  pauseAI,
  resumeAI,
  closeConversation,
  triggerNewLeadOutreach,
  reopenConversation,
  updateConversationStatus,
  assignConversationToAgent,
  runLiveDemoConversation,
} from '../services/conversation.js';
import { getSetting, setSetting } from '../db/index.js';
import { isTwilioConfigured, validateTwilioSignature } from '../services/twilio.js';
import { isZohoConfigured } from '../services/zoho.js';
import {
  extractInboundFromWebhook,
  isIbluSendConfigured,
  verifyIbluSendSignature,
} from '../services/iblusend.js';
import { isEmailConfigured } from '../services/email.js';
import {
  verifyPassword, signToken, getAllAgents, updateAgent, deleteAgent, getAgentById, countAdmins,
} from '../services/auth.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  getAllNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notifications.js';
import { getSystemPrompt, getDefaultSystemPrompt, DEFAULT_OUTREACH_TEMPLATE } from '../services/ai.js';
import { getLastEscalationEmail } from '../services/email.js';


const processedWebhookEvents = new Set<string>();

function parseZohoLeadPayload(body: Record<string, unknown>) {
  const nested = Array.isArray(body.data) ? (body.data[0] as Record<string, unknown> | undefined) : undefined;
  const lead = (nested || (body.Lead as Record<string, unknown> | undefined) || body) as Record<string, unknown>;

  const first = typeof lead.First_Name === 'string' ? lead.First_Name : '';
  const last = typeof lead.Last_Name === 'string' ? lead.Last_Name : '';
  const full =
    (typeof lead.Full_Name === 'string' && lead.Full_Name) ||
    (typeof lead.name === 'string' && lead.name) ||
    [first, last].filter(Boolean).join(' ').trim();

  const phone =
    (typeof lead.Phone === 'string' && lead.Phone) ||
    (typeof lead.Mobile === 'string' && lead.Mobile) ||
    (typeof lead.phone === 'string' && lead.phone) ||
    '';

  const email =
    (typeof lead.Email === 'string' && lead.Email) ||
    (typeof lead.email === 'string' && lead.email) ||
    undefined;

  const company =
    (typeof lead.Company === 'string' && lead.Company) ||
    (typeof lead.company === 'string' && lead.company) ||
    undefined;

  const zohoId =
    (typeof lead.id === 'string' && lead.id) ||
    (typeof lead.zoho_id === 'string' && lead.zoho_id) ||
    (typeof body.zoho_id === 'string' && body.zoho_id) ||
    undefined;

  return { name: full, phone, email, company, zoho_id: zohoId };
}


const router = Router();

// Tighter limits for the routes most worth protecting: login (brute-force)
// and public webhooks (anyone on the internet can hit these).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
});

// ── Public routes ──────────────────────────────────────────

router.get('/', (_req, res) => {
  res.json({
    name: 'SMS Sales Agent API',
    status: 'running',
    dashboard: 'http://localhost:5173',
    aiPlatform: 'OpenAI (GPT-4o-mini default)',
    docs: {
      health: 'GET /api/health',
      login: 'POST /api/auth/login',
      conversations: 'GET /api/conversations',
      analytics: 'GET /api/analytics',
      settings: 'GET /api/settings',
      notifications: 'GET /api/notifications',
    },
  });
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.post('/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const agent = await verifyPassword(email, password);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(agent);
  res.json({ token, agent: { id: agent.id, email: agent.email, name: agent.name, role: agent.role } });
});

router.get('/auth/me', authMiddleware, (req: AuthRequest, res) => {
  res.json({ agent: req.agent });
});

// iBluSend outbound webhooks (public — iBluSend POSTs events here; this is the real production channel)
router.post('/webhooks/iblusend', webhookLimiter, async (req, res) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody || Buffer.from(JSON.stringify(req.body));
    const signature = req.header('X-iBluSend-Signature') || req.header('x-iblusend-signature');
    if (!verifyIbluSendSignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const eventHeader = req.header('X-iBluSend-Event') || req.header('x-iblusend-event');
    const inbound = extractInboundFromWebhook(req.body || {});
    const event = eventHeader || inbound.event || '';

    if (inbound.eventId) {
      if (processedWebhookEvents.has(inbound.eventId)) {
        return res.json({ ok: true, deduped: true });
      }
      processedWebhookEvents.add(inbound.eventId);
      if (processedWebhookEvents.size > 5000) {
        const first = processedWebhookEvents.values().next().value;
        if (first) processedWebhookEvents.delete(first);
      }
    }

    if (event === 'message.received' || (!event && inbound.phone && inbound.body)) {
      if (!inbound.phone || !inbound.body) {
        return res.status(400).json({ error: 'Missing phone_number or content' });
      }
      // Acknowledge fast; process AI reply without blocking webhook retries too long
      void handleInboundSMS(inbound.phone, inbound.body, inbound.leadName).catch((err) => {
        console.error('iBluSend inbound processing error:', err);
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('iBluSend webhook error:', error);
    res.status(500).json({ error: 'Error' });
  }
});

// Legacy Twilio webhook — not the production channel, kept for local testing.
// Still verified when Twilio happens to be configured, so it's never a silent hole.
router.post('/webhooks/twilio/sms', webhookLimiter, async (req, res) => {
  if (isTwilioConfigured()) {
    const signature = req.header('X-Twilio-Signature') || '';
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (!validateTwilioSignature(signature, url, req.body)) {
      return res.status(403).send('Invalid signature');
    }
  }

  const { From: phone, Body: body } = req.body;
  if (!phone || !body) return res.status(400).send('Missing From or Body');
  try {
    await handleInboundSMS(phone, body);
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('Twilio webhook error:', error);
    res.status(500).send('Error');
  }
});

// Zoho webhook (public — Zoho workflow / Deluge / webhook calls this)
router.post('/webhooks/zoho/lead', webhookLimiter, async (req, res) => {
  try {
    const secret = process.env.ZOHO_WEBHOOK_SECRET || getSetting('zoho_webhook_secret');
    if (secret) {
      const provided = req.header('X-Webhook-Secret') || req.query.secret;
      if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = parseZohoLeadPayload(req.body || {});
    if (!parsed.name || !parsed.phone) {
      return res.status(400).json({ error: 'name and phone required', received: Object.keys(req.body || {}) });
    }

    const result = await triggerNewLeadOutreach(
      parsed.name,
      parsed.phone,
      parsed.email,
      parsed.company,
      parsed.zoho_id
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});


// ── Protected routes (require agent login) ─────────────────

router.use(authMiddleware);

router.get('/leads', (req: AuthRequest, res) => {
  res.json(getAllLeads(req.agent!));
});

router.post('/leads', (req, res) => {
  try {
    const { name, phone, email, company } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
    const lead = createLead({ name, phone, email, company, source: 'manual' });
    logEvent('lead_created', undefined, lead.id, { phone, source: 'manual' });
    res.json({ ...lead, status: 'new' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.get('/conversations', (req: AuthRequest, res) => {
  res.json(getAllConversations(req.agent!));
});

router.get('/conversations/:id', (req: AuthRequest, res) => {
  const id = String(req.params.id);
  const conversation = getConversationById(id);
  if (!conversation) return res.status(404).json({ error: 'Not found' });
  if (!canAccessConversation(conversation, req.agent!)) {
    return res.status(403).json({ error: 'This conversation is assigned to another agent' });
  }
  const messages = getMessages(id);
  res.json({ ...conversation, messages });
});

router.post('/conversations/:id/reply', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const { body } = req.body;
    const agentName = req.agent?.name || 'Agent';
    if (!body) return res.status(400).json({ error: 'Message body required' });
    const msg = await sendHumanReply(id, body, agentName, req.agent?.id);
    res.json(msg);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.post('/conversations/:id/pause', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const agentName = req.agent?.name || 'Agent';
    await pauseAI(id, agentName, req.agent?.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.post('/conversations/:id/assign', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const conversation = getConversationById(id);
    if (!conversation) return res.status(404).json({ error: 'Not found' });

    let { agentId } = req.body as { agentId: string | null };

    // Non-admins can only claim for themselves, not assign to/away from others.
    if (req.agent?.role !== 'admin') {
      agentId = req.agent!.id;
    }

    if (agentId === null) {
      await assignConversationToAgent(id, null, null);
    } else {
      const agent = getAllAgents().find((a) => a.id === agentId);
      if (!agent) return res.status(400).json({ error: 'Agent not found' });
      await assignConversationToAgent(id, agent.id, agent.name);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.post('/conversations/:id/resume', async (req, res) => {
  try {
    await resumeAI(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.post('/conversations/:id/close', async (req, res) => {
  try {
    const id = String(req.params.id);
    const outcome = req.body?.outcome || 'closed';
    if (!['won', 'lost', 'closed'].includes(outcome)) {
      return res.status(400).json({ error: 'Outcome must be won, lost, or closed' });
    }
    await closeConversation(id, outcome);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.post('/conversations/:id/reopen', async (req, res) => {
  try {
    await reopenConversation(String(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.post('/conversations/:id/status', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const agentName = req.agent?.name || 'Agent';
    await updateConversationStatus(id, status, agentName);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.get('/analytics', (_req, res) => {
  res.json(getAnalytics());
});

router.get('/notifications', (_req, res) => {
  res.json({ notifications: getAllNotifications(), unreadCount: getUnreadCount() });
});

router.get('/notifications/last-escalation-email', (_req, res) => {
  res.json({ email: getLastEscalationEmail() });
});


router.post('/notifications/:id/read', (req, res) => {
  markNotificationRead(req.params.id);
  res.json({ success: true });
});

router.post('/notifications/read-all', (_req, res) => {
  markAllNotificationsRead();
  res.json({ success: true });
});

router.get('/agents', (_req, res) => {
  res.json(getAllAgents());
});

router.post('/agents', (_req: AuthRequest, res) => {
  // v1 is single-user (Nationwide Tech Admin). Team agent accounts stay disabled until approved.
  return res.status(403).json({
    error: 'Multi-user agents are disabled in v1. Single login only until client approves team access.',
  });
});

router.put('/agents/:id', async (req: AuthRequest, res) => {
  if (req.agent?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const id = String(req.params.id);
  const target = getAgentById(id);
  if (!target) return res.status(404).json({ error: 'Agent not found' });

  const { name, email, password, role } = req.body;

  // Guard against locking everyone out: can't demote the last remaining admin.
  if (role && role !== 'admin' && target.role === 'admin' && countAdmins() <= 1) {
    return res.status(400).json({ error: 'Cannot demote the last remaining admin' });
  }

  try {
    const agent = await updateAgent(id, { name, email, password, role });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.delete('/agents/:id', (req: AuthRequest, res) => {
  if (req.agent?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const id = String(req.params.id);
  const target = getAgentById(id);
  if (!target) return res.status(404).json({ error: 'Agent not found' });

  if (id === req.agent?.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  if (target.role === 'admin' && countAdmins() <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last remaining admin' });
  }

  try {
    deleteAgent(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.get('/settings', (_req, res) => {
  const keys = [
    'openai_api_key', 'openai_model', 'twilio_account_sid', 'twilio_auth_token',
    'twilio_phone_number', 'iblusend_api_key', 'iblusend_webhook_secret', 'iblusend_device_id',
    'zoho_client_id', 'zoho_client_secret', 'zoho_refresh_token', 'zoho_webhook_secret',
    'demo_mode', 'bot_system_prompt', 'bot_products_catalog', 'bot_company_name',
    'bot_outreach_template', 'bot_upload_link', 'zoho_notify_on_conversation',
    'zoho_notify_on_escalation', 'escalation_notify_email',
  ];
  const settings: Record<string, string> = {};
  for (const key of keys) {
    const val = getSetting(key);
    if (val) {
      const sensitive = [
        'openai_api_key', 'twilio_auth_token', 'iblusend_api_key', 'iblusend_webhook_secret',
        'zoho_client_secret', 'zoho_refresh_token', 'zoho_webhook_secret',
      ];
      settings[key] = sensitive.includes(key)
        ? '••••••••' + val.slice(-4)
        : val;
    }
  }
  if (!settings.bot_system_prompt) {
    settings.bot_system_prompt = getDefaultSystemPrompt();
  }
  if (!settings.bot_company_name) {
    settings.bot_company_name = 'Nationwide Advance';
  }
  if (!settings.bot_outreach_template) {
    settings.bot_outreach_template = DEFAULT_OUTREACH_TEMPLATE;
  }
  if (!settings.bot_upload_link) {
    settings.bot_upload_link = '';
  }
  if (!settings.escalation_notify_email) {
    settings.escalation_notify_email =
      process.env.ESCALATION_EMAIL || 'tech@nationwideadvance.com';
  }

  res.json({
    settings,
    integrations: {
      openai: !!(getSetting('openai_api_key') || process.env.OPENAI_API_KEY),
      twilio: isTwilioConfigured(),
      iblusend: isIbluSendConfigured(),
      zoho: isZohoConfigured(),
      email: isEmailConfigured(),
      demoMode: getSetting('demo_mode') !== 'false' && process.env.DEMO_MODE !== 'false',
      aiPlatform: 'OpenAI',
      aiModel: getSetting('openai_model') || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messaging: 'iBluSend',
    },
  });
});

router.put('/settings', (req, res) => {
  const allowed = [
    'openai_api_key', 'openai_model', 'twilio_account_sid', 'twilio_auth_token',
    'twilio_phone_number', 'iblusend_api_key', 'iblusend_webhook_secret', 'iblusend_device_id',
    'zoho_client_id', 'zoho_client_secret', 'zoho_refresh_token', 'zoho_api_domain',
    'zoho_webhook_secret', 'demo_mode', 'bot_system_prompt', 'bot_products_catalog',
    'bot_company_name', 'bot_outreach_template', 'bot_upload_link',
    'zoho_notify_on_conversation', 'zoho_notify_on_escalation', 'escalation_notify_email',
  ];

  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key) && typeof value === 'string' && value.length > 0 && !value.startsWith('••••')) {
      setSetting(key, value);
    }
  }
  res.json({ success: true });
});


// Demo endpoints (protected — agents only)
router.post('/demo/inbound-sms', async (req, res) => {
  try {
    const { phone, body, leadName } = req.body;
    if (!phone || !body) return res.status(400).json({ error: 'phone and body required' });
    const result = await handleInboundSMS(phone, body, leadName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.post('/demo/new-lead', async (req, res) => {
  try {
    const { name, phone, email, company } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
    const result = await triggerNewLeadOutreach(name, phone, email, company);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.post('/demo/live-conversation', async (req, res) => {
  try {
    const { name, phone, company } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
    const result = await runLiveDemoConversation(name, phone, company);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.post('/demo/simulate-conversation', async (req, res) => {
  try {
    const lead = createLead({
      name: req.body.name || 'Demo Lead',
      phone: req.body.phone || `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
      email: req.body.email,
      company: req.body.company || 'Demo Corp',
      source: 'demo',
    });
    const conversation = createConversation(lead.id);

    const script = [
      { sender: 'ai' as const, body: `Hi ${lead.name.split(' ')[0]}! This is Nationwide Advance — are you still looking for business funding?` },
      { sender: 'lead' as const, body: "Yes, we need working capital for inventory." },
      { sender: 'ai' as const, body: "Got it. What type of business do you run, and roughly how much monthly revenue?" },
      { sender: 'lead' as const, body: "Retail store, about $40k a month. Looking for around $25k." },
      { sender: 'ai' as const, body: "Thanks — that helps. How long have you been in business?" },
      { sender: 'lead' as const, body: "Can I speak to someone about approval odds?" },
    ];

    for (const msg of script) {
      addMessage({
        conversationId: conversation.id,
        direction: msg.sender === 'lead' ? 'inbound' : 'outbound',
        sender: msg.sender,
        body: msg.body,
        sentiment: msg.sender === 'lead' ? 'positive' : undefined,
      });
    }

    updateConversation(conversation.id, {
      status: 'escalated',
      ai_enabled: 0,
      escalation_reason: 'Lead requested human agent',
      assigned_agent: 'Pending Assignment',
      sentiment: 'positive',
      deal_stage: 'negotiation',
    });
    logEvent('demo_created', conversation.id, lead.id);

    res.json({ lead, conversationId: conversation.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

export default router;
