import nodemailer from 'nodemailer';
import { getSetting } from '../db/index.js';

function getConfig() {
  return {
    host: getSetting('smtp_host') || process.env.SMTP_HOST || '',
    port: parseInt(getSetting('smtp_port') || process.env.SMTP_PORT || '587', 10),
    user: getSetting('smtp_user') || process.env.SMTP_USER || '',
    pass: getSetting('smtp_pass') || process.env.SMTP_PASS || '',
    from: getSetting('smtp_from') || process.env.SMTP_FROM || '',
    to: getSetting('escalation_notify_email') || process.env.ESCALATION_NOTIFY_EMAIL || '',
  };
}

export function isEmailConfigured(): boolean {
  const c = getConfig();
  return !!(c.host && c.user && c.pass && c.from && c.to);
}

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let cachedKey = '';

function getTransporter(config: ReturnType<typeof getConfig>) {
  const key = `${config.host}:${config.port}:${config.user}`;
  if (cachedTransporter && cachedKey === key) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
  cachedKey = key;
  return cachedTransporter;
}

export async function sendEscalationEmail(leadName: string, reason: string, conversationId: string): Promise<{ success: boolean; demo?: boolean; error?: string }> {
  const config = getConfig();
  const subject = `Escalation: ${leadName} needs a human`;
  const text = `${leadName}'s conversation was escalated and needs attention.\n\nReason: ${reason}\n\nConversation ID: ${conversationId}`;

  if (!isEmailConfigured()) {
    console.log(`[DEMO EMAIL] To: (not configured) | Subject: ${subject} | ${text}`);
    return { success: true, demo: true };
  }

  try {
    const transporter = getTransporter(config);
    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject,
      text,
    });
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown email error';
    console.error('Escalation email send error:', msg);
    return { success: false, error: msg };
  }
}
