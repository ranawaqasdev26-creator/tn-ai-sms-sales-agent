import { db } from '../db/index.js';

export type DemoStateSnapshot = {
  version: 1;
  savedAt: string;
  leads: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  analytics_events: Record<string, unknown>[];
};

export function exportDemoState(): DemoStateSnapshot {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    leads: db.prepare('SELECT * FROM leads').all() as Record<string, unknown>[],
    conversations: db.prepare('SELECT * FROM conversations').all() as Record<string, unknown>[],
    messages: db.prepare('SELECT * FROM messages').all() as Record<string, unknown>[],
    notifications: db.prepare('SELECT * FROM notifications').all() as Record<string, unknown>[],
    analytics_events: db.prepare('SELECT * FROM analytics_events').all() as Record<string, unknown>[],
  };
}

export function importDemoState(snapshot: DemoStateSnapshot): { ok: true; counts: Record<string, number> } {
  if (!snapshot || snapshot.version !== 1) {
    throw new Error('Invalid demo state snapshot');
  }

  const leads = Array.isArray(snapshot.leads) ? snapshot.leads : [];
  const conversations = Array.isArray(snapshot.conversations) ? snapshot.conversations : [];
  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  const notifications = Array.isArray(snapshot.notifications) ? snapshot.notifications : [];
  const events = Array.isArray(snapshot.analytics_events) ? snapshot.analytics_events : [];

  db.exec('BEGIN');
  try {
    db.exec(`
      DELETE FROM messages;
      DELETE FROM notifications;
      DELETE FROM analytics_events;
      DELETE FROM conversations;
      DELETE FROM leads;
    `);

    const insertLead = db.prepare(`
      INSERT INTO leads (id, name, phone, email, company, zoho_id, deal_stage, source, created_at, updated_at)
      VALUES (@id, @name, @phone, @email, @company, @zoho_id, @deal_stage, @source, @created_at, @updated_at)
    `);
    for (const row of leads) {
      insertLead.run({
        id: String(row.id),
        name: String(row.name ?? 'Lead'),
        phone: String(row.phone),
        email: row.email == null ? null : String(row.email),
        company: row.company == null ? null : String(row.company),
        zoho_id: row.zoho_id == null ? null : String(row.zoho_id),
        deal_stage: String(row.deal_stage ?? 'new'),
        source: String(row.source ?? 'demo'),
        created_at: String(row.created_at ?? new Date().toISOString()),
        updated_at: String(row.updated_at ?? new Date().toISOString()),
      });
    }

    const insertConv = db.prepare(`
      INSERT INTO conversations (
        id, lead_id, status, ai_enabled, assigned_agent, sentiment, escalation_reason,
        deal_stage, last_message_at, created_at, closed_at
      ) VALUES (
        @id, @lead_id, @status, @ai_enabled, @assigned_agent, @sentiment, @escalation_reason,
        @deal_stage, @last_message_at, @created_at, @closed_at
      )
    `);
    for (const row of conversations) {
      insertConv.run({
        id: String(row.id),
        lead_id: String(row.lead_id),
        status: String(row.status ?? 'active'),
        ai_enabled: Number(row.ai_enabled ?? 1),
        assigned_agent: row.assigned_agent == null ? null : String(row.assigned_agent),
        sentiment: String(row.sentiment ?? 'neutral'),
        escalation_reason: row.escalation_reason == null ? null : String(row.escalation_reason),
        deal_stage: String(row.deal_stage ?? 'qualifying'),
        last_message_at: String(row.last_message_at ?? new Date().toISOString()),
        created_at: String(row.created_at ?? new Date().toISOString()),
        closed_at: row.closed_at == null ? null : String(row.closed_at),
      });
    }

    const insertMsg = db.prepare(`
      INSERT INTO messages (id, conversation_id, direction, sender, body, sentiment, created_at)
      VALUES (@id, @conversation_id, @direction, @sender, @body, @sentiment, @created_at)
    `);
    for (const row of messages) {
      insertMsg.run({
        id: String(row.id),
        conversation_id: String(row.conversation_id),
        direction: String(row.direction),
        sender: String(row.sender),
        body: String(row.body ?? ''),
        sentiment: row.sentiment == null ? null : String(row.sentiment),
        created_at: String(row.created_at ?? new Date().toISOString()),
      });
    }

    const insertNotif = db.prepare(`
      INSERT INTO notifications (id, type, title, body, conversation_id, lead_id, read, created_at)
      VALUES (@id, @type, @title, @body, @conversation_id, @lead_id, @read, @created_at)
    `);
    for (const row of notifications) {
      insertNotif.run({
        id: String(row.id),
        type: String(row.type ?? 'info'),
        title: String(row.title ?? ''),
        body: String(row.body ?? ''),
        conversation_id: row.conversation_id == null ? null : String(row.conversation_id),
        lead_id: row.lead_id == null ? null : String(row.lead_id),
        read: Number(row.read ?? 0),
        created_at: String(row.created_at ?? new Date().toISOString()),
      });
    }

    const insertEvent = db.prepare(`
      INSERT INTO analytics_events (id, event_type, conversation_id, lead_id, metadata, created_at)
      VALUES (@id, @event_type, @conversation_id, @lead_id, @metadata, @created_at)
    `);
    for (const row of events) {
      insertEvent.run({
        id: String(row.id),
        event_type: String(row.event_type ?? 'unknown'),
        conversation_id: row.conversation_id == null ? null : String(row.conversation_id),
        lead_id: row.lead_id == null ? null : String(row.lead_id),
        metadata: row.metadata == null ? null : String(row.metadata),
        created_at: String(row.created_at ?? new Date().toISOString()),
      });
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    ok: true,
    counts: {
      leads: leads.length,
      conversations: conversations.length,
      messages: messages.length,
      notifications: notifications.length,
      analytics_events: events.length,
    },
  };
}
