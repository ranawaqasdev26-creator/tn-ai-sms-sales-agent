import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  zoho_id: string | null;
  deal_stage: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  lead_id: string;
  status: 'active' | 'paused' | 'escalated' | 'closed' | 'won' | 'lost';
  ai_enabled: number;
  assigned_agent: string | null;
  assigned_agent_id: string | null;
  sentiment: string;
  escalation_reason: string | null;
  deal_stage: string;
  last_message_at: string;
  created_at: string;
  closed_at: string | null;
}

export interface RequestingAgent {
  id: string;
  role: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  sender: 'lead' | 'ai' | 'human' | 'system';
  body: string;
  sentiment: string | null;
  created_at: string;
}

export interface ConversationWithLead extends Conversation {
  lead_name: string;
  lead_phone: string;
  lead_company: string | null;
  last_message: string | null;
  message_count: number;
}

export function getAllConversations(requester: RequestingAgent): ConversationWithLead[] {
  const ownershipFilter = requester.role === 'admin'
    ? ''
    : 'WHERE c.assigned_agent_id = ? OR c.assigned_agent_id IS NULL';

  return db.prepare(`
    SELECT c.*, l.name as lead_name, l.phone as lead_phone, l.company as lead_company,
      (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    JOIN leads l ON l.id = c.lead_id
    ${ownershipFilter}
    ORDER BY c.last_message_at DESC
  `).all(...(requester.role === 'admin' ? [] : [requester.id])) as ConversationWithLead[];
}

export function getConversationById(id: string): ConversationWithLead | undefined {
  return db.prepare(`
    SELECT c.*, l.name as lead_name, l.phone as lead_phone, l.company as lead_company,
      (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    JOIN leads l ON l.id = c.lead_id
    WHERE c.id = ?
  `).get(id) as ConversationWithLead | undefined;
}

export function canAccessConversation(conversation: ConversationWithLead, requester: RequestingAgent): boolean {
  if (requester.role === 'admin') return true;
  return conversation.assigned_agent_id === null || conversation.assigned_agent_id === requester.id;
}

export function getMessages(conversationId: string): Message[] {
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as Message[];
}

export function createLead(data: { name: string; phone: string; email?: string; company?: string; zoho_id?: string; source?: string }): Lead {
  const id = uuid();
  db.prepare(`
    INSERT INTO leads (id, name, phone, email, company, zoho_id, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.phone, data.email ?? null, data.company ?? null, data.zoho_id ?? null, data.source ?? 'manual');
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as Lead;
}

export function createConversation(leadId: string): Conversation {
  const id = uuid();
  db.prepare('INSERT INTO conversations (id, lead_id) VALUES (?, ?)').run(id, leadId);
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation;
}

export function addMessage(data: {
  conversationId: string;
  direction: 'inbound' | 'outbound';
  sender: 'lead' | 'ai' | 'human' | 'system';
  body: string;
  sentiment?: string;
}): Message {
  const id = uuid();
  db.prepare(`
    INSERT INTO messages (id, conversation_id, direction, sender, body, sentiment)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.conversationId, data.direction, data.sender, data.body, data.sentiment ?? null);

  db.prepare(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?`).run(data.conversationId);

  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message;
}

export function updateConversation(id: string, updates: Partial<Conversation>) {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function logEvent(eventType: string, conversationId?: string, leadId?: string, metadata?: Record<string, unknown>) {
  db.prepare(`
    INSERT INTO analytics_events (id, event_type, conversation_id, lead_id, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuid(), eventType, conversationId ?? null, leadId ?? null, metadata ? JSON.stringify(metadata) : null);
}

export function getAnalytics() {
  const total = db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };
  const active = db.prepare("SELECT COUNT(*) as count FROM conversations WHERE status = 'active'").get() as { count: number };
  const escalated = db.prepare("SELECT COUNT(*) as count FROM conversations WHERE status = 'escalated'").get() as { count: number };
  const won = db.prepare("SELECT COUNT(*) as count FROM conversations WHERE status = 'won'").get() as { count: number };
  const lost = db.prepare("SELECT COUNT(*) as count FROM conversations WHERE status = 'lost'").get() as { count: number };
  const totalMessages = db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
  const aiMessages = db.prepare("SELECT COUNT(*) as count FROM messages WHERE sender = 'ai'").get() as { count: number };

  const recentEvents = db.prepare(`
    SELECT event_type, COUNT(*) as count FROM analytics_events
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY event_type
  `).all();

  const dailyConversations = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM conversations
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all();

  const avgResponseTime = db.prepare(`
    SELECT AVG(
      (julianday(m2.created_at) - julianday(m1.created_at)) * 24 * 60
    ) as avg_minutes
    FROM messages m1
    JOIN messages m2 ON m2.conversation_id = m1.conversation_id
      AND m2.created_at > m1.created_at
      AND m2.sender IN ('ai', 'human')
    WHERE m1.sender = 'lead'
  `).get() as { avg_minutes: number | null };

  const closedTotal = won.count + lost.count;
  const successRate = closedTotal > 0 ? Math.round((won.count / closedTotal) * 100) : 0;
  const escalationRate = total.count > 0 ? Math.round((escalated.count / total.count) * 100) : 0;

  return {
    totalConversations: total.count,
    activeConversations: active.count,
    escalatedConversations: escalated.count,
    wonDeals: won.count,
    lostDeals: lost.count,
    totalMessages: totalMessages.count,
    aiMessages: aiMessages.count,
    successRate,
    escalationRate,
    avgResponseMinutes: avgResponseTime.avg_minutes ? Math.round(avgResponseTime.avg_minutes * 10) / 10 : 0,
    recentEvents,
    dailyConversations,
  };
}

export interface LeadWithStatus extends Lead {
  status: string;
}

export function getAllLeads(requester: RequestingAgent): LeadWithStatus[] {
  const ownershipFilter = requester.role === 'admin'
    ? ''
    : `WHERE COALESCE(
        (SELECT c.assigned_agent_id FROM conversations c WHERE c.lead_id = l.id ORDER BY c.created_at DESC LIMIT 1),
        NULL
      ) IS NULL
      OR (SELECT c.assigned_agent_id FROM conversations c WHERE c.lead_id = l.id ORDER BY c.created_at DESC LIMIT 1) = ?`;

  return db.prepare(`
    SELECT l.*,
      COALESCE(
        (SELECT c.status FROM conversations c WHERE c.lead_id = l.id ORDER BY c.created_at DESC LIMIT 1),
        'new'
      ) as status
    FROM leads l
    ${ownershipFilter}
    ORDER BY l.created_at DESC
  `).all(...(requester.role === 'admin' ? [] : [requester.id])) as LeadWithStatus[];
}

export function getLeadByPhone(phone: string): Lead | undefined {
  return db.prepare('SELECT * FROM leads WHERE phone = ?').get(phone) as Lead | undefined;
}

export function getLeadById(id: string): Lead | undefined {
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as Lead | undefined;
}

export function updateLead(id: string, updates: Partial<Lead>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function assignConversation(conversationId: string, agentId: string | null, agentName: string | null) {
  db.prepare(`
    UPDATE conversations SET assigned_agent_id = ?, assigned_agent = ? WHERE id = ?
  `).run(agentId, agentName, conversationId);
}

export function getActiveConversationForLead(leadId: string): Conversation | undefined {
  return db.prepare(`
    SELECT * FROM conversations WHERE lead_id = ? AND status IN ('active', 'escalated', 'paused')
    ORDER BY created_at DESC LIMIT 1
  `).get(leadId) as Conversation | undefined;
}
