import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';

export interface Agent {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const JWT_EXPIRES = '7d';

export function getAgentByEmail(email: string): (Agent & { password_hash: string }) | undefined {
  return db.prepare('SELECT * FROM agents WHERE email = ?').get(email.toLowerCase()) as
    | (Agent & { password_hash: string })
    | undefined;
}

export function getAgentById(id: string): Agent | undefined {
  const row = db.prepare('SELECT id, email, name, role, created_at FROM agents WHERE id = ?').get(id);
  return row as Agent | undefined;
}

export function getAllAgents(): Agent[] {
  return db.prepare('SELECT id, email, name, role, created_at FROM agents ORDER BY name').all() as Agent[];
}

export async function createAgent(email: string, name: string, password: string, role = 'agent'): Promise<Agent> {
  const id = uuid();
  const hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO agents (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(
    id, email.toLowerCase(), name, hash, role
  );
  return getAgentById(id)!;
}

export async function updateAgent(
  id: string,
  updates: { name?: string; email?: string; role?: string; password?: string }
): Promise<Agent | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.email) { fields.push('email = ?'); values.push(updates.email.toLowerCase()); }
  if (updates.role) { fields.push('role = ?'); values.push(updates.role); }
  if (updates.password) {
    const hash = await bcrypt.hash(updates.password, 10);
    fields.push('password_hash = ?');
    values.push(hash);
  }

  if (fields.length === 0) return getAgentById(id) ?? null;
  values.push(id);
  db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getAgentById(id) ?? null;
}

export function countAdmins(): number {
  const row = db.prepare("SELECT COUNT(*) as c FROM agents WHERE role = 'admin'").get() as { c: number };
  return row.c;
}

export function deleteAgent(id: string) {
  // Unclaim anything this agent owned so it's still visible/pickable by the team.
  db.prepare('UPDATE conversations SET assigned_agent_id = NULL, assigned_agent = NULL WHERE assigned_agent_id = ?').run(id);
  db.prepare('DELETE FROM agents WHERE id = ?').run(id);
}

export async function verifyPassword(email: string, password: string): Promise<Agent | null> {
  const agent = getAgentByEmail(email);
  if (!agent) return null;
  const valid = await bcrypt.compare(password, agent.password_hash);
  if (!valid) return null;
  const { password_hash: _, ...safe } = agent;
  return safe;
}

export function signToken(agent: Agent): string {
  return jwt.sign({ sub: agent.id, email: agent.email, name: agent.name, role: agent.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
  });
}

export function verifyToken(token: string): Agent | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return getAgentById(payload.sub) ?? null;
  } catch {
    return null;
  }
}

export async function seedDefaultAgent() {
  const count = db.prepare('SELECT COUNT(*) as c FROM agents').get() as { c: number };
  if (count.c > 0) return;
  await createAgent('admin@example.com', 'Admin', 'changeme123', 'admin');
  console.log('Default admin agent seeded (see README for first-login credentials).');
}
