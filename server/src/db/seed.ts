import { v4 as uuid } from 'uuid';
import { db, getSetting, setSetting } from '../db/index.js';
import { addMessage, logEvent } from '../models/repository.js';
import { getDefaultSystemPrompt } from '../services/ai.js';

const SEED_VERSION = '3-nationwide-mca';
/** Bump when shipping a new default bot policy so stored prompts refresh once. */
const PROMPT_VERSION = '4-rare-escalate-knowledgeable';

function refreshPromptIfNeeded() {
  if (getSetting('prompt_version') === PROMPT_VERSION) return;
  setSetting('bot_system_prompt', getDefaultSystemPrompt());
  setSetting('prompt_version', PROMPT_VERSION);
  console.log(`Bot system prompt refreshed to ${PROMPT_VERSION}`);
}

type Script = {
  status: 'active' | 'paused' | 'escalated' | 'won';
  ai_enabled: number;
  deal_stage: string;
  sentiment: string;
  escalation_reason?: string;
  assigned_agent?: string;
  messages: { sender: 'ai' | 'lead' | 'system' | 'human'; body: string }[];
};

const DEMO_DATA: { lead: { name: string; phone: string; email: string; company: string }; script: Script }[] = [
  // ── Active (4) ──────────────────────────────────────────
  {
    lead: { name: 'Alex Morgan', phone: '+15551234001', email: 'alex@example.com', company: 'Acme Retail LLC' },
    script: {
      status: 'active', ai_enabled: 1, deal_stage: 'qualifying', sentiment: 'positive',
      messages: [
        { sender: 'ai', body: "Hi Alex! This is Nationwide Advance — are you still looking for business funding?" },
        { sender: 'lead', body: 'Yes, need capital for inventory before peak season.' },
        { sender: 'ai', body: "Got it. Roughly how much monthly revenue, and how much funding are you looking for?" },
        { sender: 'lead', body: 'About $45k/month. Looking for around $30k.' },
      ],
    },
  },
  {
    lead: { name: 'Taylor Brooks', phone: '+15551234002', email: 'taylor@example.com', company: 'Brooks Trucking' },
    script: {
      status: 'active', ai_enabled: 1, deal_stage: 'proposal', sentiment: 'positive',
      messages: [
        { sender: 'ai', body: "Hello Taylor! Thanks for your interest in working capital. What's your business type?" },
        { sender: 'lead', body: 'Trucking — 4 trucks. Need funds for a down payment on another unit.' },
        { sender: 'ai', body: 'How long have you been operating, and about how much monthly revenue?' },
        { sender: 'lead', body: '6 years. Roughly $80k a month. Need about $50k.' },
      ],
    },
  },
  {
    lead: { name: 'Riley Chen', phone: '+15551234003', email: 'riley@example.com', company: 'Chen Dental Group' },
    script: {
      status: 'active', ai_enabled: 1, deal_stage: 'qualifying', sentiment: 'neutral',
      messages: [
        { sender: 'ai', body: "Hi Riley! Nationwide Advance here — still exploring funding options?" },
        { sender: 'lead', body: 'Just browsing. What do you offer?' },
        { sender: 'ai', body: 'We help businesses get working capital based on revenue. What industry are you in?' },
      ],
    },
  },
  {
    lead: { name: 'Morgan Blake', phone: '+15551234004', email: 'morgan@example.com', company: 'Northline Cafe' },
    script: {
      status: 'active', ai_enabled: 1, deal_stage: 'qualifying', sentiment: 'positive',
      messages: [
        { sender: 'ai', body: "Hi Morgan! Thanks for reaching out to Nationwide Advance. How can I help?" },
        { sender: 'lead', body: 'Need funding for renovations. Card sales are solid.' },
        { sender: 'ai', body: "Perfect. About how much in monthly card sales, and how much are you looking for?" },
        { sender: 'lead', body: 'Around $25k monthly. Looking for $15k.' },
      ],
    },
  },

  // ── Escalated (4) ───────────────────────────────────────
  {
    lead: { name: 'Jordan Lee', phone: '+15551234005', email: 'jordan@example.com', company: 'Lee Construction' },
    script: {
      status: 'escalated', ai_enabled: 0, deal_stage: 'negotiation', sentiment: 'neutral',
      escalation_reason: 'Lead requested human agent', assigned_agent: 'Pending Assignment',
      messages: [
        { sender: 'ai', body: "Hi Jordan! Thanks for your interest in business funding. What's your business type?" },
        { sender: 'lead', body: 'Construction company, looking at $75k.' },
        { sender: 'ai', body: 'Great. About how much monthly revenue and how long in business?' },
        { sender: 'lead', body: 'Can I speak to someone about rates and approval odds?' },
        { sender: 'system', body: 'Connecting you with a funding specialist now.' },
      ],
    },
  },
  {
    lead: { name: 'Sam Ortiz', phone: '+15551234006', email: 'sam@example.com', company: 'Brightpath Auto' },
    script: {
      status: 'escalated', ai_enabled: 0, deal_stage: 'negotiation', sentiment: 'neutral',
      escalation_reason: 'Lead requested human agent', assigned_agent: 'Pending Assignment',
      messages: [
        { sender: 'ai', body: "Hello Sam! How can Nationwide Advance help today?" },
        { sender: 'lead', body: 'I already have one advance — can I stack another?' },
        { sender: 'ai', body: 'Sometimes, depending on revenue and current positions. Want a specialist to review?' },
        { sender: 'lead', body: 'Yes, please have a person call me.' },
        { sender: 'system', body: 'Connecting you with a funding specialist now.' },
      ],
    },
  },
  {
    lead: { name: 'Drew Patel', phone: '+15551234007', email: 'drew@example.com', company: 'Summit HVAC' },
    script: {
      status: 'escalated', ai_enabled: 0, deal_stage: 'proposal', sentiment: 'frustrated',
      escalation_reason: 'Negative sentiment detected', assigned_agent: 'Pending Assignment',
      messages: [
        { sender: 'ai', body: "Hi Drew! Still interested in working capital?" },
        { sender: 'lead', body: 'This is taking forever and feels useless.' },
        { sender: 'system', body: 'Escalating due to frustration — a human will follow up.' },
      ],
    },
  },
  {
    lead: { name: 'Casey Nguyen', phone: '+15551234008', email: 'casey@example.com', company: 'Nguyen Market' },
    script: {
      status: 'escalated', ai_enabled: 0, deal_stage: 'qualifying', sentiment: 'neutral',
      escalation_reason: 'Lead requested human agent', assigned_agent: 'Pending Assignment',
      messages: [
        { sender: 'ai', body: "Hi Casey! Nationwide Advance here — looking for funding?" },
        { sender: 'lead', body: 'Maybe. Talk to a real person please.' },
        { sender: 'system', body: 'Connecting you with a funding specialist now.' },
      ],
    },
  },

  // ── Paused (4) ──────────────────────────────────────────
  {
    lead: { name: 'Quinn Harper', phone: '+15551234009', email: 'quinn@example.com', company: 'Harper Logistics' },
    script: {
      status: 'paused', ai_enabled: 0, deal_stage: 'qualifying', sentiment: 'positive',
      assigned_agent: 'Admin',
      messages: [
        { sender: 'ai', body: "Hi Quinn! Are you still looking for business funding?" },
        { sender: 'lead', body: 'Yes — freight brokerage, about $60k/mo revenue.' },
        { sender: 'human', body: "Hey Quinn, this is Admin from Nationwide Advance. I'll take it from here." },
      ],
    },
  },
  {
    lead: { name: 'Avery Kim', phone: '+15551234010', email: 'avery@example.com', company: 'Kim Salon Group' },
    script: {
      status: 'paused', ai_enabled: 0, deal_stage: 'proposal', sentiment: 'positive',
      assigned_agent: 'Admin',
      messages: [
        { sender: 'ai', body: "Hi Avery! Thanks for connecting with Nationwide Advance." },
        { sender: 'lead', body: 'Need $20k for equipment. 3 locations.' },
        { sender: 'human', body: "Got it — I'll review options and text you next steps." },
      ],
    },
  },
  {
    lead: { name: 'Jamie Torres', phone: '+15551234011', email: 'jamie@example.com', company: 'Torres Plumbing' },
    script: {
      status: 'paused', ai_enabled: 0, deal_stage: 'negotiation', sentiment: 'neutral',
      assigned_agent: 'Admin',
      messages: [
        { sender: 'ai', body: "Hi Jamie! Still exploring a business advance?" },
        { sender: 'lead', body: 'Want to compare against a bank line first.' },
        { sender: 'human', body: "No problem — happy to outline differences when you're ready." },
      ],
    },
  },
  {
    lead: { name: 'Reese Alvarez', phone: '+15551234012', email: 'reese@example.com', company: 'Alvarez Foods' },
    script: {
      status: 'paused', ai_enabled: 0, deal_stage: 'qualifying', sentiment: 'positive',
      assigned_agent: 'Admin',
      messages: [
        { sender: 'ai', body: "Hi Reese! Nationwide Advance — still need working capital?" },
        { sender: 'lead', body: 'Yes for payroll bridge. Restaurant group.' },
        { sender: 'human', body: "Thanks Reese — I'll gather a few docs and circle back." },
      ],
    },
  },

  // ── Won (4) ─────────────────────────────────────────────
  {
    lead: { name: 'Cameron Diaz', phone: '+15551234013', email: 'cameron@example.com', company: 'Diaz Auto Repair' },
    script: {
      status: 'won', ai_enabled: 0, deal_stage: 'closed_won', sentiment: 'positive',
      messages: [
        { sender: 'ai', body: "Hi Cameron! Looking for business funding?" },
        { sender: 'lead', body: 'Yes — shop needs a lift and inventory. $35k.' },
        { sender: 'ai', body: 'Great. Revenue and time in business look solid — specialist will finalize.' },
        { sender: 'lead', body: 'Sounds good, approved docs sent.' },
      ],
    },
  },
  {
    lead: { name: 'Parker Singh', phone: '+15551234014', email: 'parker@example.com', company: 'Singh Med Supply' },
    script: {
      status: 'won', ai_enabled: 0, deal_stage: 'closed_won', sentiment: 'positive',
      messages: [
        { sender: 'ai', body: "Hi Parker! Nationwide Advance here." },
        { sender: 'lead', body: 'Need $40k for wholesale inventory.' },
        { sender: 'human', body: 'Offer accepted — funding scheduled.' },
      ],
    },
  },
  {
    lead: { name: 'Skyler Reed', phone: '+15551234015', email: 'skyler@example.com', company: 'Reed Landscaping' },
    script: {
      status: 'won', ai_enabled: 0, deal_stage: 'closed_won', sentiment: 'positive',
      messages: [
        { sender: 'ai', body: "Hi Skyler! Still need equipment funding?" },
        { sender: 'lead', body: 'Yes — mowers and a trailer. $18k.' },
        { sender: 'lead', body: 'We are ready to move forward.' },
      ],
    },
  },
  {
    lead: { name: 'Hayden Brooks', phone: '+15551234016', email: 'hayden@example.com', company: 'Brooks Bakery' },
    script: {
      status: 'won', ai_enabled: 0, deal_stage: 'closed_won', sentiment: 'positive',
      messages: [
        { sender: 'ai', body: "Hi Hayden! Thanks for choosing Nationwide Advance." },
        { sender: 'lead', body: 'Funding helped us open the second location. Appreciate it!' },
      ],
    },
  },
];

function clearDemoData() {
  db.exec(`
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM leads;
    DELETE FROM events;
    DELETE FROM notifications;
  `);
}

function insertDemoConversation(
  lead: { name: string; phone: string; email: string; company: string },
  script: Script
) {
  const leadId = uuid();
  db.prepare(`
    INSERT INTO leads (id, name, phone, email, company, source)
    VALUES (?, ?, ?, ?, ?, 'demo')
  `).run(leadId, lead.name, lead.phone, lead.email, lead.company);

  const convId = uuid();
  const closedAt = script.status === 'won' ? new Date().toISOString() : null;

  db.prepare(`
    INSERT INTO conversations (id, lead_id, status, ai_enabled, sentiment, escalation_reason, assigned_agent, deal_stage, closed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    convId, leadId, script.status, script.ai_enabled, script.sentiment,
    script.escalation_reason ?? null,
    script.assigned_agent ?? null,
    script.deal_stage,
    closedAt
  );

  script.messages.forEach((msg) => {
    addMessage({
      conversationId: convId,
      direction: msg.sender === 'lead' ? 'inbound' : 'outbound',
      sender: msg.sender,
      body: msg.body,
      sentiment: msg.sender === 'lead' ? script.sentiment : undefined,
    });
  });

  logEvent('conversation_started', convId, leadId);
  if (script.status === 'escalated') {
    logEvent('escalation', convId, leadId, { reason: script.escalation_reason });
  }
  if (script.status === 'won') logEvent('deal_won', convId, leadId);
  if (script.status === 'paused') logEvent('ai_paused', convId, leadId, { agent: script.assigned_agent });
}

export function seedDatabase() {
  const currentVersion = getSetting('seed_version');
  const leadCount = (db.prepare('SELECT COUNT(*) as c FROM leads').get() as { c: number }).c;

  if (currentVersion === SEED_VERSION && leadCount > 0) {
    refreshPromptIfNeeded();
    return;
  }

  if (leadCount > 0) {
    console.log('Refreshing demo seed data...');
    clearDemoData();
  } else {
    console.log('Seeding demo data...');
  }

  DEMO_DATA.forEach(({ lead, script }) => insertDemoConversation(lead, script));

  // Prefer env: DEMO_MODE=false means real OpenAI; otherwise default demo for fresh installs
  if (!getSetting('demo_mode')) {
    setSetting('demo_mode', process.env.DEMO_MODE === 'false' ? 'false' : 'true');
  } else if (process.env.DEMO_MODE === 'false') {
    setSetting('demo_mode', 'false');
  }
  if (!getSetting('agent_name')) setSetting('agent_name', 'Admin');
  if (!getSetting('bot_company_name')) setSetting('bot_company_name', 'Nationwide Advance');
  // Nationwide live training defaults (prompt/outreach come from ai.ts when unset)
  if (!getSetting('bot_outreach_template')) {
    setSetting(
      'bot_outreach_template',
      'Hey {firstName}, Thank you for applying and trusting us with your business financing needs. I saw you were seeking {fundingNeed}. Are you ready to move forward with the application and your recent 4-month bank statements?'
    );
  }
  setSetting('seed_version', SEED_VERSION);
  refreshPromptIfNeeded();

  console.log(`Demo data seeded: ${DEMO_DATA.length} conversations (4 active, 4 escalated, 4 paused, 4 won).`);
}
