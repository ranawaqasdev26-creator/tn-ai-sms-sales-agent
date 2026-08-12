import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  conversation_id: string | null;
  lead_id: string | null;
  read: number;
  created_at: string;
}

export function createNotification(data: {
  type: string;
  title: string;
  body: string;
  conversationId?: string;
  leadId?: string;
}): AppNotification {
  const id = uuid();
  db.prepare(`
    INSERT INTO notifications (id, type, title, body, conversation_id, lead_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.type, data.title, data.body, data.conversationId ?? null, data.leadId ?? null);
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as unknown as AppNotification;
}

export function getUnreadNotifications(): AppNotification[] {
  return db.prepare('SELECT * FROM notifications WHERE read = 0 ORDER BY created_at DESC LIMIT 50').all() as unknown as AppNotification[];
}

export function getAllNotifications(limit = 50): AppNotification[] {
  return db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?').all(limit) as unknown as AppNotification[];
}

export function markNotificationRead(id: string) {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
}

export function markAllNotificationsRead() {
  db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
}

export function getUnreadCount(): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE read = 0').get() as { c: number };
  return row.c;
}
