import { isIbluSendConfigured, sendIbluMessage, type SendMessageResult } from './iblusend.js';

/**
 * Primary messaging channel is iBluSend (iMessage/SMS via Mac bridge).
 * Without an API key, sends are logged as demo (local testing).
 */
export async function sendOutboundMessage(
  to: string,
  body: string,
  options?: { sendMode?: 'instant' | 'drip'; idempotencyKey?: string }
): Promise<SendMessageResult> {
  if (!isIbluSendConfigured()) {
    console.log(`[DEMO MESSAGE] To: ${to} | Message: ${body}`);
    return { success: true, messageId: `demo_${Date.now()}`, demo: true, mode: options?.sendMode || 'instant' };
  }
  return sendIbluMessage(to, body, {
    sendMode: options?.sendMode || 'instant',
    idempotencyKey: options?.idempotencyKey,
  });
}
