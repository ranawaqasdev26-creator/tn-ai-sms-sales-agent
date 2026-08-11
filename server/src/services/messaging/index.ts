import { getSetting } from '../../db/index.js';
import { twilioChannel } from './twilioChannel.js';
import { ibluesendChannel } from './ibluesendChannel.js';
import type { MessagingChannel, SendResult } from './types.js';

export type { SendResult } from './types.js';

const channels: Record<string, MessagingChannel> = {
  twilio: twilioChannel,
  ibluesend: ibluesendChannel,
};

export function getActiveProviderName(): string {
  return (getSetting('messaging_provider') || process.env.MESSAGING_PROVIDER || 'twilio').toLowerCase();
}

export function getActiveChannel(): MessagingChannel {
  return channels[getActiveProviderName()] ?? twilioChannel;
}

export async function sendMessage(to: string, body: string): Promise<SendResult> {
  return getActiveChannel().send(to, body);
}

export function isMessagingConfigured(): boolean {
  return getActiveChannel().isConfigured();
}
