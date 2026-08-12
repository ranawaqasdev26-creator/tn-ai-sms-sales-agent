const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('sales_agent_token');
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
    // Clear session once — do not hard-reload (that caused a login loop on Vercel
    // when ephemeral SQLite briefly rejected a still-valid JWT across instances).
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
  getLeads: () => request<Lead[]>('/leads'),
  createLead: (data: { name: string; phone: string; email?: string; company?: string }) =>
    request<Lead>('/leads', { method: 'POST', body: JSON.stringify(data) }),
  getConversations: () => request<Conversation[]>('/conversations'),
  getConversation: (id: string) => request<Conversation & { messages: Message[] }>(`/conversations/${id}`),
  reply: (id: string, body: string) =>
    request<Message>(`/conversations/${id}/reply`, { method: 'POST', body: JSON.stringify({ body }) }),
  pauseAI: (id: string) =>
    request(`/conversations/${id}/pause`, { method: 'POST', body: JSON.stringify({}) }),
  resumeAI: (id: string) => request(`/conversations/${id}/resume`, { method: 'POST' }),
  closeConversation: (id: string, outcome?: 'won' | 'lost' | 'closed') =>
    request(`/conversations/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome }) }),
  reopenConversation: (id: string) =>
    request(`/conversations/${id}/reopen`, { method: 'POST' }),
  updateStatus: (id: string, status: string) =>
    request(`/conversations/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  assignConversation: (id: string, agentId: string | null) =>
    request(`/conversations/${id}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),
  getAnalytics: () => request<Analytics>('/analytics'),
  getSettings: () => request<Settings>('/settings'),
  updateSettings: (settings: Record<string, string>) =>
    request('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  getNotifications: () => request<{ notifications: AppNotification[]; unreadCount: number }>('/notifications'),
  markNotificationRead: (id: string) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),
  getAgents: () => request<Agent[]>('/agents'),
  createAgent: (data: { email: string; name: string; password: string; role?: string }) =>
    request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id: string, data: { name?: string; email?: string; password?: string; role?: string }) =>
    request<Agent>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgent: (id: string) => request(`/agents/${id}`, { method: 'DELETE' }),
  demoInboundSMS: (phone: string, body: string, leadName?: string) =>
    request('/demo/inbound-sms', { method: 'POST', body: JSON.stringify({ phone, body, leadName }) }),
  demoNewLead: (name: string, phone: string, email?: string, company?: string) =>
    request('/demo/new-lead', { method: 'POST', body: JSON.stringify({ name, phone, email, company }) }),
  demoSimulate: (data?: { name?: string; phone?: string; company?: string }) =>
    request('/demo/simulate-conversation', { method: 'POST', body: JSON.stringify(data || {}) }),
  demoLiveConversation: (name: string, phone: string, company?: string) =>
    request<{ lead: Lead; conversation: Conversation }>('/demo/live-conversation', {
      method: 'POST',
      body: JSON.stringify({ name, phone, company }),
    }),
};
