import { sendSMS, isTwilioConfigured } from '../twilio.js';
import type { MessagingChannel } from './types.js';

export const twilioChannel: MessagingChannel = {
  name: 'twilio',
  isConfigured: isTwilioConfigured,
  send: sendSMS,
};
