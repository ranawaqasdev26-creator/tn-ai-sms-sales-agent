const API_BASE = '/api';
const DEMO_STORAGE_KEY = 'nationwide_sms_demo_state_v1';

export interface DemoStateSnapshot {
  version: 1;
  savedAt: string;
  leads: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  analytics_events: Record<string, unknown>[];
}

function getToken(): string | null {
  return localStorage.getItem('sales_agent_token');
}

function readDemoSnapshot(): DemoStateSnapshot | null {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoStateSnapshot;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function snapshotScore(snapshot: DemoStateSnapshot): number {
  return (
    (snapshot.messages?.length || 0) * 10_000 +
    (snapshot.conversations?.length || 0) * 100 +
    (snapshot.leads?.length || 0)
  );
}

/** Never let a stale/poorer snapshot wipe newer demo data (multi-tab / polling race). */
function writeDemoSnapshotSafe(snapshot: DemoStateSnapshot, { force = false }: { force?: boolean } = {}) {
  const current = readDemoSnapshot();
  if (!force && current && snapshotScore(snapshot) < snapshotScore(current)) {
    console.warn('[demo-persist] ignored stale snapshot overwrite', {
      incoming: snapshotScore(snapshot),
      kept: snapshotScore(current),
    });
    return;
  }
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(snapshot));
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  });
  if (res.status === 401) {
    const hadToken = !!localStorage.getItem('sales_agent_token');
    localStorage.removeItem('sales_agent_token');
    if (hadToken) {
      window.dispatchEvent(new Event('sales-agent-auth-expired'));
    }
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

const READ_ACTIONS = new Set([
  'get-leads',
  'get-conversations',
  'get-conversation',
  'get-analytics',
  'get-notifications',
  'export',
]);

let demoRunChain: Promise<unknown> = Promise.resolve();

/** Atomic import → action → export so Vercel multi-instance SQLite cannot drop demo data. */
async function demoRun<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const run = async (): Promise<T> => {
    const existing = readDemoSnapshot();
    const data = await request<{ result: T; snapshot: DemoStateSnapshot }>('/demo/run', {
      method: 'POST',
      body: JSON.stringify({
        snapshot: existing,
        action,
        payload: payload || {},
      }),
    });

    if (data.snapshot) {
      const isRead = READ_ACTIONS.has(action);
      // Reads only bootstrap localStorage when empty — never clobber richer state.
      // Mutations always try to save, but still reject poorer/stale snapshots.
      if (!isRead || !existing) {
        writeDemoSnapshotSafe(data.snapshot, { force: !isRead && !existing });
      } else if (snapshotScore(data.snapshot) > snapshotScore(existing)) {
        writeDemoSnapshotSafe(data.snapshot);
      }
    }

    return data.result;
  };

  const next = demoRunChain.then(run, run);
  demoRunChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

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
  status: string;
}

export interface Conversation {
  id: string;
  lead_id: string;
  status: string;
  ai_enabled: number;
  assigned_agent: string | null;
  assigned_agent_id: string | null;
  sentiment: string;
  escalation_reason: string | null;
  deal_stage: string;
  last_message_at: string;
  created_at: string;
  closed_at: string | null;
  lead_name: string;
  lead_phone: string;
  lead_company: string | null;
  last_message: string | null;
  message_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: string;
  sender: string;
  body: string;
  sentiment: string | null;
  created_at: string;
}

export interface Analytics {
  totalConversations: number;
  activeConversations: number;
  escalatedConversations: number;
  wonDeals: number;
  lostDeals: number;
  totalMessages: number;
  aiMessages: number;
  successRate: number;
  escalationRate: number;
  avgResponseMinutes: number;
  recentEvents: { event_type: string; count: number }[];
  dailyConversations: { date: string; count: number }[];
}

export interface Settings {
  settings: Record<string, string>;
  integrations: {
    openai: boolean;
    twilio?: boolean;
    iblusend?: boolean;
    zoho: boolean;
    email: boolean;
    demoMode: boolean;
    aiPlatform?: string;
    aiModel?: string;
    messaging?: string;
  };
}

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

export interface Agent {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const api = {
  getLeads: () => demoRun<Lead[]>('get-leads'),
  createLead: (data: { name: string; phone: string; email?: string; company?: string }) =>
    request<Lead>('/leads', { method: 'POST', body: JSON.stringify(data) }),
  getConversations: () => demoRun<Conversation[]>('get-conversations'),
  getConversation: (id: string) => demoRun<Conversation & { messages: Message[] }>('get-conversation', { id }),
  reply: (id: string, body: string) => demoRun<Message>('reply', { id, body }),
  pauseAI: (id: string) => demoRun('pause-ai', { id }),
  resumeAI: (id: string) => demoRun('resume-ai', { id }),
  closeConversation: (id: string, outcome?: 'won' | 'lost' | 'closed') =>
    demoRun('close', { id, outcome }),
  reopenConversation: (id: string) => demoRun('reopen', { id }),
  updateStatus: (id: string, status: string) => demoRun('update-status', { id, status }),
  assignConversation: (id: string, agentId: string | null) =>
    request(`/conversations/${id}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),
  getAnalytics: () => demoRun<Analytics>('get-analytics'),
  getSettings: () => request<Settings>('/settings'),
  updateSettings: (settings: Record<string, string>) =>
    request('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  getNotifications: () =>
    demoRun<{ notifications: AppNotification[]; unreadCount: number }>('get-notifications'),
  markNotificationRead: (id: string) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),
  getAgents: () => request<Agent[]>('/agents'),
  createAgent: (data: { email: string; name: string; password: string; role?: string }) =>
    request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id: string, data: { name?: string; email?: string; password?: string; role?: string }) =>
    request<Agent>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgent: (id: string) => request(`/agents/${id}`, { method: 'DELETE' }),
  demoInboundSMS: (phone: string, body: string, leadName?: string) =>
    demoRun('inbound-sms', { phone, body, leadName }),
  demoNewLead: (name: string, phone: string, email?: string, company?: string) =>
    demoRun('new-lead', { name, phone, email, company }),
  demoSimulate: (data?: { name?: string; phone?: string; company?: string }) =>
    demoRun('simulate', data || {}),
  demoLiveConversation: (name: string, phone: string, company?: string) =>
    request<{ lead: Lead; conversation: Conversation }>('/demo/live-conversation', {
      method: 'POST',
      body: JSON.stringify({ name, phone, company }),
    }),
  exportDemoState: () => demoRun<DemoStateSnapshot>('export'),
  importDemoState: (snapshot: DemoStateSnapshot) =>
    request<{ ok: true; counts: Record<string, number> }>('/demo/state', {
      method: 'POST',
      body: JSON.stringify(snapshot),
    }),
};
