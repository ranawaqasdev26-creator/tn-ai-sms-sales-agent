import { getSetting } from '../../db/index.js';
import type { MessagingChannel, SendResult } from './types.js';

// iBluSend is the client's real in-house texting hardware/platform (Mac Mini +
// iPhones). This channel is a placeholder until we have their developer docs —
// the request shape below (endpoint, auth header, body fields) is a best guess
// and MUST be confirmed/corrected once real API documentation arrives.

function getConfig() {
  return {
    apiKey: getSetting('ibluesend_api_key') || process.env.IBLUESEND_API_KEY || '',
    apiBase: getSetting('ibluesend_api_base') || process.env.IBLUESEND_API_BASE || '',
  };
}

function isConfigured(): boolean {
  const config = getConfig();
  return !!(config.apiKey && config.apiBase);
}

async function send(to: string, body: string): Promise<SendResult> {
  const config = getConfig();

  if (!isConfigured()) {
    console.log(`[DEMO SMS via iBluSend] To: ${to} | Message: ${body}`);
    return { success: true, id: `demo_${Date.now()}`, demo: true };
  }

  try {
    // TODO: replace this call once iBluSend's real developer docs are available.
    // Assumed for now: POST {apiBase}/messages with a Bearer token, returning
    // an id/messageId field on success.
    const res = await fetch(`${config.apiBase}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ to, body }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, error: `iBluSend send failed (${res.status}): ${text}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
    return { success: true, id: data.id ?? data.messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown iBluSend error';
    console.error('iBluSend send error:', msg);
    return { success: false, error: msg };
  }
}

export const ibluesendChannel: MessagingChannel = {
  name: 'ibluesend',
  isConfigured,
  send,
};
