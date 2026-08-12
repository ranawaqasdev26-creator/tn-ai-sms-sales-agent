import crypto from 'crypto';
import { getSetting } from '../db/index.js';

const DEFAULT_BASE_URL = 'https://api.iblusend.com/functions/v1';

function getConfig() {
  return {
    apiKey: getSetting('iblusend_api_key') || process.env.IBLUSEND_API_KEY || '',
    webhookSecret: getSetting('iblusend_webhook_secret') || process.env.IBLUSEND_WEBHOOK_SECRET || '',
    deviceId: getSetting('iblusend_device_id') || process.env.IBLUSEND_DEVICE_ID || '',
    baseUrl: (getSetting('iblusend_base_url') || process.env.IBLUSEND_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
  };
}

export function isIbluSendConfigured(): boolean {
  return !!getConfig().apiKey;
}

export function verifyIbluSendSignature(rawBody: Buffer | string, signatureHeader?: string | null): boolean {
  const { webhookSecret } = getConfig();
  if (!webhookSecret) return true; // allow unsigned in local/dev when secret not set
  if (!signatureHeader) return false;

  const provided = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(typeof rawBody === 'string' ? rawBody : rawBody)
    .digest('hex');

  try {
    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type SendMessageResult = {
  success: boolean;
  messageId?: string;
  mode?: string;
  sandbox?: boolean;
  error?: string;
  demo?: boolean;
};

/**
 * Send via iBluSend Agent API.
 * Conversational replies use send_mode=instant.
 */
export async function sendIbluMessage(
  to: string,
  message: string,
  options?: { sendMode?: 'instant' | 'drip'; idempotencyKey?: string }
): Promise<SendMessageResult> {
  const config = getConfig();
  const sendMode = options?.sendMode || 'instant';

  if (!config.apiKey) {
    console.log(`[DEMO iBluSend] To: ${to} | Mode: ${sendMode} | Message: ${message}`);
    return { success: true, messageId: `demo_${Date.now()}`, mode: sendMode, demo: true };
  }

  const body: Record<string, unknown> = {
    to,
    message,
    send_mode: sendMode,
  };
  if (config.deviceId) body.device_id = config.deviceId;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  try {
    const res = await fetch(`${config.baseUrl}/agent-api/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = typeof data.error === 'string' ? data.error : `iBluSend HTTP ${res.status}`;
      console.error('iBluSend send error:', err, data);
      return { success: false, error: err };
    }

    return {
      success: true,
      messageId: typeof data.message_id === 'string' ? data.message_id : undefined,
      mode: typeof data.mode === 'string' ? data.mode : sendMode,
      sandbox: data.sandbox === true,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown iBluSend error';
    console.error('iBluSend send error:', msg);
    return { success: false, error: msg };
  }
}

export function extractInboundFromWebhook(payload: Record<string, unknown>): {
  phone?: string;
  body?: string;
  leadName?: string;
  eventId?: string;
  event?: string;
} {
  const event = typeof payload.event === 'string' ? payload.event : undefined;
  const eventId = typeof payload.event_id === 'string' ? payload.event_id : undefined;
  const data = (payload.data && typeof payload.data === 'object' ? payload.data : payload) as Record<string, unknown>;

  const phone =
    (typeof data.phone_number === 'string' && data.phone_number) ||
    (typeof data.phone === 'string' && data.phone) ||
    (typeof data.from === 'string' && data.from) ||
    undefined;

  const body =
    (typeof data.content === 'string' && data.content) ||
    (typeof data.message === 'string' && data.message) ||
    (typeof data.body === 'string' && data.body) ||
    undefined;

  const leadName =
    (typeof data.contact_name === 'string' && data.contact_name) ||
    (typeof data.name === 'string' && data.name) ||
    undefined;

  return { phone, body, leadName, eventId, event };
}
