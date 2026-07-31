import { Router } from 'express';
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
import { isTwilioConfigured } from '../services/twilio.js';
import { isZohoConfigured } from '../services/zoho.js';
import {
  verifyPassword, signToken, getAllAgents, createAgent, updateAgent, deleteAgent, getAgentById, countAdmins,
} from '../services/auth.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  getAllNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notifications.js';
import { getSystemPrompt } from '../services/ai.js';

const router = Router();

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

router.post('/auth/login', async (req, res) => {
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

// Twilio webhook (public — Twilio calls this)
router.post('/webhooks/twilio/sms', async (req, res) => {
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

// Zoho webhook (public — Zoho calls this)
router.post('/webhooks/zoho/lead', async (req, res) => {
  try {
    const { name, phone, email, company, zoho_id } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
    const result = await triggerNewLeadOutreach(name, phone, email, company, zoho_id);
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
    const { outcome } = req.body;
    if (!['won', 'lost'].includes(outcome)) {
      return res.status(400).json({ error: 'Outcome must be won or lost' });
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

router.post('/agents', async (req: AuthRequest, res) => {
  if (req.agent?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { email, name, password, role } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: 'email, name, password required' });
  try {
    const agent = await createAgent(email, name, password, role || 'agent');
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
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
    'twilio_phone_number', 'zoho_client_id', 'zoho_client_secret', 'zoho_refresh_token',
    'demo_mode', 'bot_system_prompt', 'bot_products_catalog', 'bot_company_name',
    'bot_outreach_template', 'zoho_notify_on_conversation', 'zoho_notify_on_escalation',
  ];
  const settings: Record<string, string> = {};
  for (const key of keys) {
    const val = getSetting(key);
    if (val) {
      const sensitive = ['openai_api_key', 'twilio_auth_token', 'zoho_client_secret', 'zoho_refresh_token'];
      settings[key] = sensitive.includes(key)
        ? '••••••••' + val.slice(-4)
        : val;
    }
  }
  if (!settings.bot_system_prompt) {
    settings.bot_system_prompt = getSystemPrompt();
  }
  res.json({
    settings,
    integrations: {
      openai: !!(getSetting('openai_api_key') || process.env.OPENAI_API_KEY),
      twilio: isTwilioConfigured(),
      zoho: isZohoConfigured(),
      demoMode: getSetting('demo_mode') !== 'false' && process.env.DEMO_MODE !== 'false',
      aiPlatform: 'OpenAI',
      aiModel: getSetting('openai_model') || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
  });
});

router.put('/settings', (req, res) => {
  const allowed = [
    'openai_api_key', 'openai_model', 'twilio_account_sid', 'twilio_auth_token',
    'twilio_phone_number', 'zoho_client_id', 'zoho_client_secret', 'zoho_refresh_token',
    'zoho_api_domain', 'demo_mode', 'bot_system_prompt', 'bot_products_catalog',
    'bot_company_name', 'bot_outreach_template', 'zoho_notify_on_conversation', 'zoho_notify_on_escalation',
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
      { sender: 'ai' as const, body: `Hi ${lead.name.split(' ')[0]}! I'm your AI sales assistant. What challenges are you looking to solve?` },
      { sender: 'lead' as const, body: "Hi! We're looking to automate our sales process." },
      { sender: 'ai' as const, body: "That's our specialty! Our Starter Plan helps teams save time on manual tasks. What's your team size?" },
      { sender: 'lead' as const, body: "About 25 people. What's the pricing?" },
      { sender: 'ai' as const, body: "For a team your size, our plan runs $299/mo with full CRM integration. Want a free 14-day trial?" },
      { sender: 'lead' as const, body: "Sounds interesting. Can I speak to someone about a custom plan?" },
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
