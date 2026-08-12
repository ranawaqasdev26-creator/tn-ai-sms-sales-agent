import OpenAI from 'openai';
import { getSetting } from '../db/index.js';

export const DEFAULT_OUTREACH_TEMPLATE =
  'Hey {firstName}, Thank you for applying and trusting us with your business financing needs. I saw you were seeking {fundingNeed}. Are you ready to move forward with the application and your recent 4-month bank statements?';

const DEFAULT_SYSTEM_PROMPT = `You are the AI texting assistant for Nationwide Advance (business financing / MCA / working capital). Leads already applied on the website and are pre-qualified from the form — do NOT run a full qualification checklist.

Your goals (in order):
1. Warm thank-you / confirmation that you saw their application
2. Handle objections using the approved replies below
3. ALWAYS steer toward completing the application and uploading recent 4-month bank statements via the upload link
4. Hand off to a human when the lead is upset or questions get too difficult

Tone: warm, professional, concise, natural iMessage/SMS. Keep most replies under ~300 characters. No markdown. No bullet lists.

Do NOT ask qualifying questions like business type, time in business, industry, existing advances, or urgency — that was already collected on the form. You may briefly confirm funding need only if they bring it up or the opener referenced it.

Approved objection handling (adapt naturally, keep the meaning):
- Not interested: "May I ask why you applied just now on our site if you were not interested? Has something steered you in a different direction?"
- Call me later / call me: "Of course — what time works best, and is this the best number to reach you on?" (do NOT escalate just because they ask for a call)
- Already working with someone: "Great — shopping around is always a smart business decision. Was there a specified goal that wasn't met with the other finance company?"
- Rates / terms: "Our rates and terms depend on many qualifying factors, but what I can tell you is that we strive to deliver the best results in every aspect whether it comes to rate and term." Then gently push docs/application.

Never say / never promise:
- Exact rates, guarantees, approvals, funding amounts, or timelines as guaranteed
- Always frame as "depends on qualifying factors"
- Never ask for SSN, full bank login credentials, or card numbers over text
- Never bad-mouth competitors
- If they say STOP / unsubscribe / remove me — acknowledge once and stop selling (use [ESCALATE] so the team can suppress further outreach)

Primary CTA every conversation should return to:
- Send in the application + recent 4-month bank statements on the upload link
- If an upload link is provided in your context, include it when they are ready
- If no link is configured yet, ask them to reply YES and say a specialist will send the secure upload link right away

When to hand off (respond with exactly [ESCALATE]):
- Merchant is getting upset / angry / frustrated
- Questions become too complex for text (legal, underwriting edge cases, stacked positions detail, etc.)
- Lead explicitly asks for a human / specialist (not just "call me later")
- Compliance / legal threats

Deal stages: new → engaged → docs_requested → negotiation → closed_won/closed_lost / escalated`;

export function getDefaultSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT;
}

export function getSystemPrompt(): string {
  const custom = getSetting('bot_system_prompt');
  const products = getSetting('bot_products_catalog');
  const company = getSetting('bot_company_name');
  const uploadLink = getSetting('bot_upload_link');
  let prompt = custom || DEFAULT_SYSTEM_PROMPT;
  if (company && !custom) {
    prompt = prompt.replace(/Nationwide Advance/g, company);
  }

  if (products) {
    prompt += `\n\nAdditional product info:\n${products}`;
  }
  if (uploadLink) {
    prompt += `\n\nSecure upload link for application + 4-month bank statements:\n${uploadLink}\nShare this link when pushing docs.`;
  } else {
    prompt += `\n\nNo upload link is configured yet. When they are ready for docs, ask them to reply YES and say a specialist will text the secure upload link.`;
  }
  return prompt;
}

const DEMO_RESPONSES: Record<string, string[]> = {
  greeting: [
    "Hey! Thanks again for applying with Nationwide Advance — ready to send in the application and your recent 4-month bank statements?",
    "Thanks for trusting us with your financing needs. Want me to send the upload link for your app and last 4 months of bank statements?",
  ],
  pricing: [
    "Our rates and terms depend on many qualifying factors, but we strive to deliver the best results on both. Ready to upload your recent 4-month bank statements so we can review?",
    "Happy to help on rates — they depend on qualifying factors. Best next step is the application plus your last 4 months of bank statements on the upload link.",
  ],
  interest: [
    "Awesome — next step is the application and your recent 4-month bank statements on the upload link. Want me to send that now?",
    "Perfect. Reply YES and I'll get you the secure upload link for the application and last 4 months of statements.",
  ],
  not_interested: [
    "May I ask why you applied just now on our site if you were not interested? Has something steered you in a different direction?",
  ],
  call_later: [
    "Of course — what time works best, and is this the best number to reach you on?",
  ],
  competitor: [
    "Great — shopping around is always a smart business decision. Was there a specified goal that wasn't met with the other finance company?",
  ],
  objection: [
    "Totally fair. Want me to send the upload link anyway so you have options if you decide to move forward?",
  ],
  default: [
    "Got it. Whenever you're ready, the fastest path is the application plus your recent 4-month bank statements on the upload link.",
    "Appreciate that — want me to send the secure upload link for the app and last 4 months of bank statements?",
  ],
  escalate: [
    "Absolutely — I'll connect you with a Nationwide Advance specialist now. Someone from the team will follow up shortly!",
  ],
};

function isDemoMode(): boolean {
  // Explicit env wins over DB (so .env DEMO_MODE=false enables real OpenAI)
  if (process.env.DEMO_MODE === 'false') return false;
  if (process.env.DEMO_MODE === 'true') return true;
  const demoSetting = getSetting('demo_mode');
  if (demoSetting !== null) return demoSetting === 'true';
  return true;
}

function getOpenAIKey(): string | null {
  return getSetting('openai_api_key') || process.env.OPENAI_API_KEY || null;
}

export function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' | 'frustrated' {
  const lower = text.toLowerCase();
  if (/\b(angry|frustrated|terrible|awful|hate|worst|useless|scam|pissed|ridiculous)\b/.test(lower)) {
    return 'frustrated';
  }
  if (/\b(stop|unsubscribe|leave me alone|don't (text|contact|message)|remove me)\b/.test(lower)) {
    return 'negative';
  }
  if (/\b(not interested)\b/.test(lower)) return 'negative';
  if (/\b(yes|great|awesome|perfect|love|interested|sounds good|let's do it|sign me up|ready)\b/.test(lower)) {
    return 'positive';
  }
  return 'neutral';
}

export function shouldEscalate(text: string, sentiment: string): { escalate: boolean; reason?: string } {
  const lower = text.toLowerCase();

  // STOP / opt-out → escalate so team can suppress
  if (/\b(stop|unsubscribe|remove me|don't (text|contact|message) me)\b/.test(lower)) {
    return { escalate: true, reason: 'Lead opted out / STOP request' };
  }

  // Explicit human request — NOT mere "call me later"
  if (
    /\b(speak|talk|connect me)\b.{0,40}\b(human|person|agent|manager|someone|rep|specialist|keith)\b/.test(lower) ||
    /\b(real person|live (person|agent|human)|actual (person|human)|not a bot)\b/.test(lower) ||
    /\b(can i (get|have) (a )?(human|person|agent))\b/.test(lower) ||
    /\b(transfer me|hand ?off|get (me )?keith)\b/.test(lower)
  ) {
    return { escalate: true, reason: 'Lead requested human agent' };
  }

  if (sentiment === 'frustrated') {
    return { escalate: true, reason: 'Merchant upset / negative sentiment' };
  }
  if (/\b(lawyer|legal action|sue|complaint|report you|attorney)\b/.test(lower)) {
    return { escalate: true, reason: 'Legal/compliance concern' };
  }
  return { escalate: false };
}

function getDemoResponse(inboundText: string): string {
  const lower = inboundText.toLowerCase();
  if (shouldEscalate(inboundText, analyzeSentiment(inboundText)).escalate) {
    return DEMO_RESPONSES.escalate[0];
  }
  if (/\b(call me|call later|later today|tomorrow|next week)\b/.test(lower)) {
    return DEMO_RESPONSES.call_later[0];
  }
  if (/\b(not interested)\b/.test(lower)) {
    return DEMO_RESPONSES.not_interested[0];
  }
  if (/\b(already (working|have)|other (company|lender|finance)|shopping around)\b/.test(lower)) {
    return DEMO_RESPONSES.competitor[0];
  }
  if (/\b(price|cost|how much|pricing|expensive|budget|rate|factor|terms)\b/.test(lower)) {
    return DEMO_RESPONSES.pricing[Math.floor(Math.random() * DEMO_RESPONSES.pricing.length)];
  }
  if (/\b(yes|interested|tell me more|sounds good|demo|trial|ready|send (it|the link))\b/.test(lower)) {
    const upload = getSetting('bot_upload_link');
    if (upload) {
      return `Perfect — here's the secure upload link for the application and your recent 4-month bank statements: ${upload}`;
    }
    return DEMO_RESPONSES.interest[Math.floor(Math.random() * DEMO_RESPONSES.interest.length)];
  }
  if (/\b(no|expensive|can't afford|not sure|maybe later|think about)\b/.test(lower)) {
    return DEMO_RESPONSES.objection[Math.floor(Math.random() * DEMO_RESPONSES.objection.length)];
  }
  if (/\b(hi|hello|hey|good morning|good afternoon)\b/.test(lower)) {
    return DEMO_RESPONSES.greeting[Math.floor(Math.random() * DEMO_RESPONSES.greeting.length)];
  }
  return DEMO_RESPONSES.default[Math.floor(Math.random() * DEMO_RESPONSES.default.length)];
}

export async function generateAIResponse(
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  inboundText: string
): Promise<{ response: string; shouldEscalate: boolean; escalationReason?: string }> {
  const sentiment = analyzeSentiment(inboundText);
  const escalation = shouldEscalate(inboundText, sentiment);

  if (escalation.escalate) {
    return {
      response:
        "Absolutely — I'll connect you with a Nationwide Advance specialist now. Someone from the team will follow up shortly!",
      shouldEscalate: true,
      escalationReason: escalation.reason,
    };
  }

  const apiKey = getOpenAIKey();
  if (!apiKey || isDemoMode()) {
    return {
      response: getDemoResponse(inboundText),
      shouldEscalate: false,
    };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: getSystemPrompt() },
      ...conversationHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: inboundText },
    ];

    const completion = await openai.chat.completions.create({
      model: getSetting('openai_model') || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: 220,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || getDemoResponse(inboundText);

    if (response.includes('[ESCALATE]')) {
      return {
        response:
          "Let me connect you with one of our team members who can help you better. They'll be in touch shortly!",
        shouldEscalate: true,
        escalationReason: 'AI determined escalation needed',
      };
    }

    return { response, shouldEscalate: false };
  } catch (error) {
    console.error('OpenAI error, falling back to demo:', error);
    return {
      response: getDemoResponse(inboundText),
      shouldEscalate: false,
    };
  }
}

export function getInitialOutreachMessage(
  leadName: string,
  extras?: { fundingNeed?: string; monthlyRevenue?: string; fundingAmount?: string }
): string {
  const firstName = leadName.split(' ')[0] || leadName;
  const fundingNeed =
    extras?.fundingNeed ||
    extras?.fundingAmount ||
    extras?.monthlyRevenue ||
    'business financing';

  const template = getSetting('bot_outreach_template') || DEFAULT_OUTREACH_TEMPLATE;
  return template
    .replace(/\{firstName\}/g, firstName)
    .replace(/\{name\}/g, leadName)
    .replace(/\{fundingNeed\}/g, fundingNeed)
    .replace(/\{fundingAmount\}/g, extras?.fundingAmount || fundingNeed)
    .replace(/\{monthlyRevenue\}/g, extras?.monthlyRevenue || fundingNeed);
}
