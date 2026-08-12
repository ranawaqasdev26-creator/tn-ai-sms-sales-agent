import { getSetting } from '../db/index.js';
import { getLeadById } from '../models/repository.js';

interface ZohoLead {
  id: string;
  First_Name: string;
  Last_Name: string;
  Email?: string;
  Phone: string;
  Company?: string;
  Lead_Status?: string;
}

function getZohoConfig() {
  return {
    clientId: getSetting('zoho_client_id') || process.env.ZOHO_CLIENT_ID || '',
    clientSecret: getSetting('zoho_client_secret') || process.env.ZOHO_CLIENT_SECRET || '',
    refreshToken: getSetting('zoho_refresh_token') || process.env.ZOHO_REFRESH_TOKEN || '',
    apiDomain: getSetting('zoho_api_domain') || process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com',
  };
}

export function isZohoConfigured(): boolean {
  const config = getZohoConfig();
  return !!(config.clientId && config.clientSecret && config.refreshToken);
}

function notifyEnabled(key: string): boolean {
  const val = getSetting(key);
  return val !== 'false';
}

async function getAccessToken(): Promise<string | null> {
  const config = getZohoConfig();
  if (!isZohoConfigured()) return null;

  try {
    const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: config.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    const data = await response.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch (error) {
    console.error('Zoho token error:', error);
    return null;
  }
}

async function zohoRequest(method: string, path: string, body?: unknown): Promise<{ success: boolean; demo?: boolean; error?: string }> {
  if (!isZohoConfigured()) {
    console.log(`[DEMO ZOHO] ${method} ${path}`, body);
    return { success: true, demo: true };
  }

  const token = await getAccessToken();
  if (!token) return { success: false, error: 'Failed to get Zoho access token' };

  try {
    const config = getZohoConfig();
    const response = await fetch(`${config.apiDomain}${path}`, {
      method,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: err };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Zoho request failed' };
  }
}

function resolveZohoLeadId(localLeadId: string): string | null {
  const lead = getLeadById(localLeadId);
  return lead?.zoho_id ?? null;
}

export async function syncLeadToZoho(localLeadId: string, updates: Record<string, string>): Promise<{ success: boolean; demo?: boolean; error?: string }> {
  const zohoId = resolveZohoLeadId(localLeadId);
  if (!zohoId) {
    console.log(`[ZOHO] No zoho_id for lead ${localLeadId}, skipping sync:`, updates);
    if (!isZohoConfigured()) return { success: true, demo: true };
    return { success: false, error: 'Lead has no Zoho ID mapped' };
  }
  return zohoRequest('PUT', `/crm/v2/Leads/${zohoId}`, { data: [updates] });
}

export async function addZohoNote(localLeadId: string, title: string, content: string): Promise<{ success: boolean; demo?: boolean }> {
  const zohoId = resolveZohoLeadId(localLeadId);
  if (!zohoId) {
    console.log(`[DEMO ZOHO NOTE] ${title}: ${content}`);
    return { success: true, demo: true };
  }
  const result = await zohoRequest('POST', `/crm/v2/Leads/${zohoId}/Notes`, {
    data: [{ Note_Title: title, Note_Content: content }],
  });
  return result;
}

export async function createZohoTask(localLeadId: string, subject: string, description: string): Promise<{ success: boolean; demo?: boolean }> {
  const zohoId = resolveZohoLeadId(localLeadId);
  if (!zohoId) {
    console.log(`[DEMO ZOHO TASK] ${subject}: ${description}`);
    return { success: true, demo: true };
  }
  const result = await zohoRequest('POST', '/crm/v2/Tasks', {
    data: [{
      Subject: subject,
      Description: description,
      $se_module: 'Leads',
      What_Id: zohoId,
      Status: 'Not Started',
      Priority: 'High',
    }],
  });
  return result;
}

export async function notifyZohoConversationEvent(
  localLeadId: string,
  eventType: 'conversation_started' | 'escalation' | 'human_takeover' | 'deal_won' | 'deal_lost',
  details: { leadName: string; message?: string; agentName?: string; reason?: string }
) {
  const settingKey = eventType === 'escalation' ? 'zoho_notify_on_escalation' : 'zoho_notify_on_conversation';
  if (!notifyEnabled(settingKey) && eventType !== 'deal_won' && eventType !== 'deal_lost') return;

  const titles: Record<string, string> = {
    conversation_started: 'AI Sales Agent — New Conversation',
    escalation: 'AI Sales Agent — Escalation Required',
    human_takeover: 'AI Sales Agent — Human Takeover',
    deal_won: 'AI Sales Agent — Deal Won',
    deal_lost: 'AI Sales Agent — Deal Lost',
  };

  const body = [
    `Lead: ${details.leadName}`,
    details.message && `Last message: ${details.message}`,
    details.reason && `Reason: ${details.reason}`,
    details.agentName && `Agent: ${details.agentName}`,
    `Time: ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');

  await addZohoNote(localLeadId, titles[eventType], body);

  if (eventType === 'escalation') {
    await createZohoTask(localLeadId, `Follow up: ${details.leadName}`, body);
  }
}

export async function fetchNewZohoLeads(): Promise<ZohoLead[]> {
  if (!isZohoConfigured()) return [];

  const token = await getAccessToken();
  if (!token) return [];

  try {
    const config = getZohoConfig();
    const response = await fetch(
      `${config.apiDomain}/crm/v2/Leads?criteria=(Lead_Status:equals:New)`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    );
    const data = await response.json() as { data?: ZohoLead[] };
    return data.data ?? [];
  } catch (error) {
    console.error('Zoho fetch error:', error);
    return [];
  }
}

export function getIntegrationStatus() {
  return {
    zoho: { configured: isZohoConfigured(), status: isZohoConfigured() ? 'connected' : 'demo' },
    iblusend: { configured: !!(getSetting('iblusend_api_key') || process.env.IBLUSEND_API_KEY) },
    openai: { configured: !!(getSetting('openai_api_key') || process.env.OPENAI_API_KEY) },
  };
}

