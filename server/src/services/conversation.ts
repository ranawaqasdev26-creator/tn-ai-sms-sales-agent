import {
  getConversationById,
  getMessages,
  addMessage,
  updateConversation,
  logEvent,
  getLeadByPhone,
  createLead,
  getActiveConversationForLead,
  createConversation,
  updateLead,
  assignConversation,
} from '../models/repository.js';
import { generateAIResponse, analyzeSentiment, getInitialOutreachMessage } from './ai.js';
import { sendMessage } from './messaging/index.js';
import { syncLeadToZoho, notifyZohoConversationEvent } from './zoho.js';
import { createNotification } from './notifications.js';
import { sendEscalationEmail } from './email.js';

type BroadcastFn = (event: string, data: unknown) => void;

let broadcast: BroadcastFn = () => {};

export function setBroadcast(fn: BroadcastFn) {
  broadcast = fn;
}

async function notifyInApp(type: string, title: string, body: string, conversationId?: string, leadId?: string) {
  const notification = createNotification({ type, title, body, conversationId, leadId });
  broadcast('notification', notification);
}

export async function handleInboundSMS(phone: string, body: string, leadName?: string) {
  let lead = getLeadByPhone(phone);
  if (!lead) {
    lead = createLead({
      name: leadName || `Lead ${phone.slice(-4)}`,
      phone,
      source: 'sms',
    });
    logEvent('lead_created', undefined, lead.id, { phone, source: 'sms' });
  }

  let conversation = getActiveConversationForLead(lead.id);
  const isNew = !conversation;
  if (!conversation) {
    conversation = createConversation(lead.id);
    logEvent('conversation_started', conversation.id, lead.id);
    await notifyZohoConversationEvent(lead.id, 'conversation_started', { leadName: lead.name, message: body });
    await notifyInApp('conversation', 'New Conversation', `${lead.name} started a conversation`, conversation.id, lead.id);
  }

  const sentiment = analyzeSentiment(body);
  const inboundMsg = addMessage({
    conversationId: conversation.id,
    direction: 'inbound',
    sender: 'lead',
    body,
    sentiment,
  });

  updateConversation(conversation.id, { sentiment });

  broadcast('message', { conversationId: conversation.id, message: inboundMsg });
  broadcast('conversation_updated', { conversationId: conversation.id });

  if (!conversation.ai_enabled || conversation.status === 'escalated' || conversation.status === 'paused') {
    if (!isNew) {
      await notifyInApp('message', `New message from ${lead.name}`, body.slice(0, 80), conversation.id, lead.id);
    }
    return { conversationId: conversation.id, aiResponded: false };
  }

  const history = getMessages(conversation.id)
    .filter((m) => m.sender === 'lead' || m.sender === 'ai')
    .slice(-10)
    .map((m) => ({
      role: (m.sender === 'lead' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.body,
    }));

  const aiResult = await generateAIResponse(history, body);

  if (aiResult.shouldEscalate) {
    updateConversation(conversation.id, {
      status: 'escalated',
      ai_enabled: 0,
      escalation_reason: aiResult.escalationReason ?? 'Auto-escalation',
      assigned_agent: 'Pending Assignment',
    });
    logEvent('escalation', conversation.id, lead.id, { reason: aiResult.escalationReason });
    broadcast('escalation', { conversationId: conversation.id, reason: aiResult.escalationReason });
    await notifyZohoConversationEvent(lead.id, 'escalation', {
      leadName: lead.name,
      message: body,
      reason: aiResult.escalationReason,
    });
    await notifyInApp('escalation', 'Escalation Required', `${lead.name}: ${aiResult.escalationReason}`, conversation.id, lead.id);
    await sendEscalationEmail(lead.name, aiResult.escalationReason ?? 'Auto-escalation', conversation.id);
  }

  const outboundMsg = addMessage({
    conversationId: conversation.id,
    direction: 'outbound',
    sender: aiResult.shouldEscalate ? 'system' : 'ai',
    body: aiResult.response,
  });

  await sendMessage(phone, aiResult.response);

  broadcast('message', { conversationId: conversation.id, message: outboundMsg });
  broadcast('conversation_updated', { conversationId: conversation.id });

  return { conversationId: conversation.id, aiResponded: true, escalated: aiResult.shouldEscalate };
}

export async function sendHumanReply(conversationId: string, body: string, agentName: string, agentId?: string) {
  const conversation = getConversationById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  const msg = addMessage({
    conversationId,
    direction: 'outbound',
    sender: 'human',
    body,
  });

  updateConversation(conversationId, {
    assigned_agent: agentName,
    assigned_agent_id: agentId ?? conversation.assigned_agent_id,
    last_message_at: new Date().toISOString(),
  });

  await sendMessage(conversation.lead_phone, body);
  logEvent('human_reply', conversationId, conversation.lead_id, { agent: agentName });

  broadcast('message', { conversationId, message: msg });
  broadcast('conversation_updated', { conversationId });

  return msg;
}

export async function pauseAI(conversationId: string, agentName: string, agentId?: string) {
  const conversation = getConversationById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  updateConversation(conversationId, {
    ai_enabled: 0,
    status: 'paused',
    assigned_agent: agentName,
    assigned_agent_id: agentId ?? conversation.assigned_agent_id,
  });
  logEvent('ai_paused', conversationId, conversation.lead_id, { agent: agentName });
  broadcast('conversation_updated', { conversationId });

  await notifyZohoConversationEvent(conversation.lead_id, 'human_takeover', {
    leadName: conversation.lead_name,
    agentName,
  });
  await notifyInApp('takeover', 'Human Takeover', `${agentName} took over ${conversation.lead_name}`, conversationId, conversation.lead_id);
}

export async function assignConversationToAgent(conversationId: string, agentId: string | null, agentName: string | null) {
  const conversation = getConversationById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  assignConversation(conversationId, agentId, agentName);
  logEvent('conversation_assigned', conversationId, conversation.lead_id, { agent: agentName });
  broadcast('conversation_updated', { conversationId });
}

export async function resumeAI(conversationId: string) {
  updateConversation(conversationId, {
    ai_enabled: 1,
    status: 'active',
    assigned_agent: null,
    escalation_reason: null,
  });
  logEvent('ai_resumed', conversationId);
  broadcast('conversation_updated', { conversationId });
}

export async function closeConversation(conversationId: string, outcome: 'won' | 'lost' | 'closed') {
  const conversation = getConversationById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  const dealStage = outcome === 'won' ? 'closed_won' : outcome === 'lost' ? 'closed_lost' : 'closed';

  updateConversation(conversationId, {
    status: outcome,
    ai_enabled: 0,
    closed_at: new Date().toISOString(),
    deal_stage: dealStage,
  });

  if (conversation.lead_id && outcome !== 'closed') {
    await syncLeadToZoho(conversation.lead_id, {
      Lead_Status: outcome === 'won' ? 'Converted' : 'Lost',
      Deal_Stage: outcome === 'won' ? 'Closed Won' : 'Closed Lost',
    });
    await notifyZohoConversationEvent(conversation.lead_id, outcome === 'won' ? 'deal_won' : 'deal_lost', {
      leadName: conversation.lead_name,
    });
  }

  const eventType = outcome === 'won' ? 'deal_won' : outcome === 'lost' ? 'deal_lost' : 'conversation_closed';
  logEvent(eventType, conversationId, conversation.lead_id);
  broadcast('conversation_updated', { conversationId });
}

export async function reopenConversation(conversationId: string) {
  const conversation = getConversationById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  updateConversation(conversationId, {
    status: 'active',
    ai_enabled: 1,
    closed_at: null,
    assigned_agent: null,
    escalation_reason: null,
    deal_stage: 'qualifying',
  });

  logEvent('conversation_reopened', conversationId, conversation.lead_id);
  broadcast('conversation_updated', { conversationId });
}

export async function updateConversationStatus(
  conversationId: string,
  status: string,
  agentName = 'Agent'
) {
  const allowed = ['active', 'escalated', 'paused', 'won', 'lost', 'closed'];
  if (!allowed.includes(status)) throw new Error('Invalid status');

  if (status === 'won' || status === 'lost' || status === 'closed') {
    await closeConversation(conversationId, status);
    return;
  }

  if (status === 'active') {
    await reopenConversation(conversationId);
    return;
  }

  if (status === 'paused') {
    await pauseAI(conversationId, agentName);
    return;
  }

  const conversation = getConversationById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  updateConversation(conversationId, {
    status: 'escalated',
    ai_enabled: 0,
    escalation_reason: conversation.escalation_reason || 'Manually escalated',
    closed_at: null,
  });

  logEvent('escalation', conversationId, conversation.lead_id, { reason: 'Manually escalated' });
  broadcast('conversation_updated', { conversationId });
}

export async function triggerNewLeadOutreach(
  name: string,
  phone: string,
  email?: string,
  company?: string,
  zohoId?: string
) {
  let lead = getLeadByPhone(phone);
  if (!lead) {
    lead = createLead({ name, phone, email, company, source: 'zoho', zoho_id: zohoId });
  } else if (zohoId) {
    updateLead(lead.id, { zoho_id: zohoId });
    lead = getLeadByPhone(phone)!;
  }

  const conversation = createConversation(lead.id);
  const message = getInitialOutreachMessage(name);

  const msg = addMessage({
    conversationId: conversation.id,
    direction: 'outbound',
    sender: 'ai',
    body: message,
  });

  await sendMessage(phone, message);
  logEvent('outreach_sent', conversation.id, lead.id);
  broadcast('message', { conversationId: conversation.id, message: msg });
  broadcast('conversation_updated', { conversationId: conversation.id });

  await notifyZohoConversationEvent(lead.id, 'conversation_started', { leadName: name, message });
  await notifyInApp('outreach', 'Outreach Sent', `AI contacted ${name}`, conversation.id, lead.id);

  return { lead, conversation, message: msg };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A realistic lead reply script for the live demo. Only the lead's side is
// scripted — every AI reply is generated fresh by the real model, so the
// conversation genuinely plays out live rather than replaying canned text.
const LIVE_DEMO_LEAD_TURNS = [
  "Hi, thanks for reaching out! What exactly does your product do?",
  "Interesting. What would that cost for a team our size?",
  "That's reasonable. How long does it usually take to get set up?",
  "Sounds good — can someone walk me through next steps?",
];

export async function runLiveDemoConversation(name: string, phone: string, company?: string) {
  let lead = getLeadByPhone(phone);
  if (!lead) {
    lead = createLead({ name, phone, company, source: 'demo' });
  }
  const conversation = createConversation(lead.id);

  const opener = getInitialOutreachMessage(name);
  const openMsg = addMessage({ conversationId: conversation.id, direction: 'outbound', sender: 'ai', body: opener });
  logEvent('outreach_sent', conversation.id, lead.id);
  broadcast('message', { conversationId: conversation.id, message: openMsg });
  broadcast('conversation_updated', { conversationId: conversation.id });
  await notifyInApp('outreach', 'Live Demo Started', `AI contacted ${name}`, conversation.id, lead.id);

  // Run the back-and-forth in the background so the API responds immediately —
  // the frontend watches it unfold live via the existing WebSocket broadcasts.
  (async () => {
    for (const leadLine of LIVE_DEMO_LEAD_TURNS) {
      await sleep(2200 + Math.random() * 1400);

      const sentiment = analyzeSentiment(leadLine);
      const inMsg = addMessage({ conversationId: conversation.id, direction: 'inbound', sender: 'lead', body: leadLine, sentiment });
      updateConversation(conversation.id, { sentiment });
      broadcast('message', { conversationId: conversation.id, message: inMsg });
      broadcast('conversation_updated', { conversationId: conversation.id });

      await sleep(1200 + Math.random() * 900);

      const history = getMessages(conversation.id)
        .filter((m) => m.sender === 'lead' || m.sender === 'ai')
        .slice(-10)
        .map((m) => ({ role: (m.sender === 'lead' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.body }));

      const aiResult = await generateAIResponse(history, leadLine);

      if (aiResult.shouldEscalate) {
        updateConversation(conversation.id, {
          status: 'escalated',
          ai_enabled: 0,
          escalation_reason: aiResult.escalationReason ?? 'Auto-escalation',
          assigned_agent: 'Pending Assignment',
        });
        const sysMsg = addMessage({ conversationId: conversation.id, direction: 'outbound', sender: 'system', body: aiResult.response });
        logEvent('escalation', conversation.id, lead.id, { reason: aiResult.escalationReason });
        broadcast('message', { conversationId: conversation.id, message: sysMsg });
        broadcast('escalation', { conversationId: conversation.id, reason: aiResult.escalationReason });
        broadcast('conversation_updated', { conversationId: conversation.id });
        await notifyInApp('escalation', 'Escalation Required', `${name}: ${aiResult.escalationReason}`, conversation.id, lead.id);
        return;
      }

      const outMsg = addMessage({ conversationId: conversation.id, direction: 'outbound', sender: 'ai', body: aiResult.response });
      broadcast('message', { conversationId: conversation.id, message: outMsg });
      broadcast('conversation_updated', { conversationId: conversation.id });
    }
  })();

  return { lead, conversation };
}
