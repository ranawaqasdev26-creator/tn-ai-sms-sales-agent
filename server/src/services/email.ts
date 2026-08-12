import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getSetting } from '../db/index.js';

let cachedTransporter: Transporter | null = null;
let etherealReady: Promise<Transporter> | null = null;

function getEscalationEmail(): string {
  return (
    getSetting('escalation_notify_email') ||
    process.env.ESCALATION_EMAIL ||
    'tech@nationwideadvance.com'
  );
}

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'SMS Sales Agent <noreply@nationwideadvance.com>',
  };
}

export function isEmailConfigured(): boolean {
  const smtp = getSmtpConfig();
  return !!(smtp.host && smtp.user && smtp.pass);
}

async function getTransporter(): Promise<{ transporter: Transporter; usingEthereal: boolean }> {
  const smtp = getSmtpConfig();
  if (smtp.host && smtp.user && smtp.pass) {
    if (!cachedTransporter) {
      cachedTransporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      });
    }
    return { transporter: cachedTransporter, usingEthereal: false };
  }

  // Local/dev fallback: Ethereal test inbox so we can preview the email in browser
  if (!etherealReady) {
    etherealReady = (async () => {
      const testAccount = await nodemailer.createTestAccount();
      console.log('[Email] Using Ethereal test SMTP (no real SMTP configured). Messages are preview-only.');
      return nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    })();
  }
  return { transporter: await etherealReady, usingEthereal: true };
}

export type EscalationEmailPayload = {
  leadName: string;
  phone?: string;
  reason?: string;
  message?: string;
  conversationId: string;
};

export type EscalationEmailResult = {
  sent: boolean;
  to: string;
  previewUrl?: string;
  error?: string;
  ethereal?: boolean;
};

/** Last escalation email result (for local demo / debugging). */
let lastEscalationEmail: EscalationEmailResult | null = null;

export function getLastEscalationEmail(): EscalationEmailResult | null {
  return lastEscalationEmail;
}

export async function sendEscalationEmail(payload: EscalationEmailPayload): Promise<EscalationEmailResult> {
  const to = getEscalationEmail();
  const smtp = getSmtpConfig();
  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
  const conversationUrl = `${dashboardUrl}/conversations?id=${payload.conversationId}`;

  const subject = `🚨 Escalation: ${payload.leadName} requested a human agent`;
  const text = [
    'A lead asked to speak with a human. AI paused — please take over.',
    '',
    `Lead: ${payload.leadName}`,
    payload.phone ? `Phone: ${payload.phone}` : null,
    payload.reason ? `Reason: ${payload.reason}` : null,
    payload.message ? `Last message: ${payload.message}` : null,
    '',
    `Open chat: ${conversationUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.5">
      <h2 style="color:#b45309;margin:0 0 12px">Escalation Required</h2>
      <p>A lead asked to speak with a human. The AI is paused — please take over in the dashboard.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Lead</td><td><strong>${escapeHtml(payload.leadName)}</strong></td></tr>
        ${payload.phone ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Phone</td><td>${escapeHtml(payload.phone)}</td></tr>` : ''}
        ${payload.reason ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Reason</td><td>${escapeHtml(payload.reason)}</td></tr>` : ''}
        ${payload.message ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Last message</td><td>${escapeHtml(payload.message)}</td></tr>` : ''}
      </table>
      <p><a href="${conversationUrl}" style="background:#1e3a5f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Open conversation</a></p>
      <p style="color:#888;font-size:12px;margin-top:24px">Sent to ${escapeHtml(to)} · Nationwide Advance SMS Sales Agent</p>
    </div>
  `;

  try {
    const { transporter, usingEthereal } = await getTransporter();
    const info = await transporter.sendMail({
      from: smtp.from,
      to,
      subject,
      text,
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    const result: EscalationEmailResult = {
      sent: true,
      to,
      previewUrl,
      ethereal: usingEthereal,
    };
    lastEscalationEmail = result;

    if (previewUrl) {
      console.log(`[Email] Escalation email preview for ${to}: ${previewUrl}`);
    } else {
      console.log(`[Email] Escalation email sent to ${to}`);
    }
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Email send failed';
    console.error('[Email] Escalation send error:', msg);
    const result: EscalationEmailResult = { sent: false, to, error: msg };
    lastEscalationEmail = result;
    return result;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
