const sections = [
  {
    id: 'overview',
    title: '1. What this system does',
    body: (
      <>
        <p>
          Nationwide Advance AI SMS Sales Agent engages financing applicants over text (iMessage/SMS via iBluSend),
          answers with OpenAI, syncs events to Zoho CRM, and gives Tech Admin a dashboard to monitor, take over, and train the bot.
        </p>
        <ul className="list-disc pl-5 mt-3 space-y-1 text-luxury-600">
          <li>Leads are <strong>pre-qualified on the Nationwide website form</strong> — AI does not run a long qualification checklist.</li>
          <li>Primary CTA: complete the application + upload recent <strong>4-month bank statements</strong>.</li>
          <li>Never guarantees rates, approvals, amounts, or timelines.</li>
          <li>Hands off when the merchant is upset or questions get too complex for text.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'login',
    title: '2. Login',
    body: (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-luxury-100">
              <td className="py-2 pr-4 text-luxury-500">Email</td>
              <td className="py-2 font-mono text-luxury-900">tech@nationwideadvance.com</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 text-luxury-500">Password</td>
              <td className="py-2 font-mono text-luxury-900">tech@nationwideadvance.com</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-luxury-400 mt-2">Single-user v1 — one Nationwide Tech Admin login.</p>
      </div>
    ),
  },
  {
    id: 'stack',
    title: '3. Technology stack',
    body: (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-luxury-500 border-b border-luxury-200">
              <th className="py-2 pr-4">Layer</th>
              <th className="py-2">Technology</th>
            </tr>
          </thead>
          <tbody className="text-luxury-700">
            {[
              ['Frontend', 'React 18, TypeScript, Vite, Tailwind, Recharts'],
              ['Backend', 'Node.js, Express, TypeScript'],
              ['Database', 'SQLite'],
              ['AI', 'OpenAI (gpt-4o-mini default)'],
              ['Messaging', 'iBluSend (iMessage / SMS) — not Twilio in production'],
              ['CRM', 'Zoho CRM (OAuth, Notes, Tasks)'],
              ['Auth', 'JWT + bcryptjs'],
              ['Hosting', 'Vercel (static + serverless API)'],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-luxury-50">
                <td className="py-2 pr-4 font-medium">{k}</td>
                <td className="py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: 'architecture',
    title: '4. Architecture',
    body: (
      <>
        <pre className="text-xs sm:text-sm bg-luxury-50 border border-luxury-200 rounded-xl p-4 overflow-x-auto text-luxury-800 font-mono leading-relaxed">{`Nationwide website form (pre-qualified)
            │
            ▼ Zoho lead webhook
┌─────────┐  HTTPS/JWT   ┌──────────────┐
│ React   │◄────────────►│ Express API  │
│Dashboard│  (+ polling) │ (Vercel)     │
└─────────┘              └──────┬───────┘
         ┌──────────┬───────────┼──────────┐
         ▼          ▼           ▼          ▼
      SQLite     OpenAI     iBluSend    Zoho CRM`}</pre>
        <p className="mt-3 text-sm text-luxury-600">
          On Vercel, SQLite lives under <code className="text-xs">/tmp</code> (ephemeral). Locally it persists under{' '}
          <code className="text-xs">server/data/</code>. Realtime uses WebSocket locally and polling in production.
        </p>
      </>
    ),
  },
  {
    id: 'flow',
    title: '5. Business flow (step by step)',
    body: (
      <div className="space-y-4 text-luxury-600">
        <div>
          <p className="font-medium text-luxury-900">A. New lead outreach</p>
          <ol className="list-decimal pl-5 mt-1 space-y-1">
            <li>Merchant applies on Nationwide site (already pre-qualified).</li>
            <li>Zoho webhook <code className="text-xs">POST /api/webhooks/zoho/lead</code> (or Demo → New Lead).</li>
            <li>Platform creates lead + conversation if none active.</li>
            <li>Sends outreach opener via iBluSend.</li>
            <li>Zoho Note + in-app “Outreach Sent”.</li>
          </ol>
        </div>
        <div>
          <p className="font-medium text-luxury-900">B. Inbound → AI reply</p>
          <ol className="list-decimal pl-5 mt-1 space-y-1">
            <li>Merchant texts back → iBluSend <code className="text-xs">message.received</code>.</li>
            <li>Webhook <code className="text-xs">POST /api/webhooks/iblusend</code>.</li>
            <li>Store message + sentiment; if AI enabled → OpenAI reply.</li>
            <li>Outbound via iBluSend; dashboard updates.</li>
          </ol>
        </div>
        <div>
          <p className="font-medium text-luxury-900">C. Always push docs</p>
          <p className="mt-1">
            Application + recent 4-month bank statements on the secure upload link from Bot Training.
          </p>
        </div>
        <div>
          <p className="font-medium text-luxury-900">D. Escalation</p>
          <p className="mt-1">
            Rare only: STOP/opt-out, explicit human/live-agent request, or legal/abusive language →
            AI off, Zoho Task, bell + email. Rates, timing, docs, and “call me later” stay in SMS — do <em>not</em> auto-escalate.
          </p>
        </div>
        <div>
          <p className="font-medium text-luxury-900">E. Human takeover</p>
          <p className="mt-1">Conversations → Take Over → manual reply → Resume AI → Close won/lost.</p>
        </div>
      </div>
    ),
  },
  {
    id: 'script',
    title: '6. Nationwide AI sales script',
    body: (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-luxury-500 border-b border-luxury-200">
              <th className="py-2 pr-4">Situation</th>
              <th className="py-2">AI behavior</th>
            </tr>
          </thead>
          <tbody className="text-luxury-700">
            {[
              ['Opener', 'Thank them for applying; reference financing need; invite app + statements'],
              ['Not interested', 'Ask why they applied / what steered them away'],
              ['Call later', 'Ask best time + confirm best number'],
              ['Already with someone', 'Affirm shopping around; ask what goal wasn’t met'],
              ['Rates / terms', 'Depend on qualifying factors; push docs'],
              ['Never say', 'Guaranteed rates, approvals, amounts, timelines'],
              ['Handoff', 'Rare — STOP, explicit human request, or legal/abuse only'],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-luxury-50 align-top">
                <td className="py-2 pr-4 font-medium whitespace-nowrap">{k}</td>
                <td className="py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-luxury-400 mt-2">Edit anytime in Settings → Bot Training. Applies on the next AI reply.</p>
      </div>
    ),
  },
  {
    id: 'modules',
    title: '7. Dashboard modules',
    body: (
      <ul className="space-y-2 text-luxury-600">
        <li><strong className="text-luxury-900">Dashboard</strong> — KPIs, escalations, Demo Simulator</li>
        <li><strong className="text-luxury-900">Leads</strong> — lead list + status</li>
        <li><strong className="text-luxury-900">Conversations</strong> — threads, reply, pause/resume, close</li>
        <li><strong className="text-luxury-900">Analytics</strong> — success / escalation / volume</li>
        <li><strong className="text-luxury-900">PDF Compressor</strong> — shrink statement PDFs for sharing</li>
        <li><strong className="text-luxury-900">Settings</strong> — keys, Zoho toggles, Bot Training, escalation email</li>
        <li><strong className="text-luxury-900">Docs</strong> — this page</li>
      </ul>
    ),
  },
  {
    id: 'training',
    title: '8. Bot Training fields',
    body: (
      <ul className="list-disc pl-5 space-y-1 text-luxury-600">
        <li><strong>Company Name</strong> — default Nationwide Advance</li>
        <li><strong>Secure Upload Link</strong> — application + 4-month statements</li>
        <li><strong>Products / Services Notes</strong> — optional catalog context</li>
        <li><strong>System Prompt</strong> — personality, objections, never-say, handoff</li>
        <li><strong>Outreach Opener</strong> — placeholders {'{firstName}'}, {'{name}'}, {'{fundingNeed}'}</li>
      </ul>
    ),
  },
  {
    id: 'webhooks',
    title: '9. Production webhooks',
    body: (
      <div className="space-y-2 text-sm text-luxury-700 font-mono break-all">
        <p>iBluSend → https://keith-sms-agent.vercel.app/api/webhooks/iblusend</p>
        <p>Zoho lead → https://keith-sms-agent.vercel.app/api/webhooks/zoho/lead</p>
        <p className="font-sans text-xs text-luxury-400 mt-2">
          Set signing secrets in iBluSend / Zoho and mirror them in Vercel env or Settings.
        </p>
      </div>
    ),
  },
  {
    id: 'env',
    title: '10. Critical production env vars',
    body: (
      <p className="text-luxury-600 text-sm leading-relaxed">
        <code className="text-xs">JWT_SECRET</code>, <code className="text-xs">OPENAI_API_KEY</code>,{' '}
        <code className="text-xs">DEMO_MODE=false</code>, <code className="text-xs">IBLUSEND_API_KEY</code>,{' '}
        <code className="text-xs">IBLUSEND_WEBHOOK_SECRET</code>, Zoho OAuth trio,{' '}
        <code className="text-xs">ESCALATION_EMAIL</code>, optional SMTP. Full list is in the GitHub README.
      </p>
    ),
  },
  {
    id: 'limits',
    title: '11. Known limitations',
    body: (
      <ul className="list-disc pl-5 space-y-1 text-luxury-600">
        <li>Single-user v1 (team agent accounts deferred)</li>
        <li>Vercel SQLite is ephemeral — cold starts can reset conversation history</li>
        <li>Serverless uses polling instead of persistent WebSockets</li>
        <li>SMTP optional — without it, escalation email may be preview-only</li>
        <li>iBluSend test keys (`iblu_test_…`) are sandbox; live keys required for real customer texts</li>
      </ul>
    ),
  },
  {
    id: 'built',
    title: '12. What was delivered',
    body: (
      <ol className="list-decimal pl-5 space-y-1 text-luxury-600">
        <li>Full-stack React + Express + SQLite platform</li>
        <li>iBluSend inbound/outbound messaging path</li>
        <li>OpenAI engine with Nationwide sales defaults</li>
        <li>Zoho lead webhook + Notes/Tasks</li>
        <li>Bot Training UI (prompt, opener, upload link)</li>
        <li>Escalation bell + email alerts</li>
        <li>Human takeover / resume AI</li>
        <li>Demo Simulator</li>
        <li>Vercel production deploy + TechNationwide GitHub</li>
        <li>PDF compressor helper page</li>
        <li>Stable Tech Admin login for serverless</li>
        <li>This in-app documentation</li>
      </ol>
    ),
  },
];

export default function DocsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="card p-6">
        <h3 className="font-display text-2xl text-luxury-900">Nationwide Advance — Platform Docs</h3>
        <p className="text-sm text-luxury-500 mt-2">
          Complete architecture, business flow, and operator guide. Same source of truth as the GitHub README —
          written so any Nationwide teammate can understand the system end-to-end.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <a
            className="px-3 py-1.5 rounded-lg bg-navy-800 text-white hover:bg-navy-700 transition-colors"
            href="https://keith-sms-agent.vercel.app/"
            target="_blank"
            rel="noreferrer"
          >
            Live app
          </a>
          <a
            className="px-3 py-1.5 rounded-lg border border-luxury-200 text-luxury-700 hover:bg-luxury-50 transition-colors"
            href="https://github.com/TechNationwide/ai-sms-sales-agent"
            target="_blank"
            rel="noreferrer"
          >
            GitHub repo
          </a>
        </div>
      </div>

      <nav className="card p-5">
        <p className="text-sm font-medium text-luxury-900 mb-3">Jump to section</p>
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-xs px-2.5 py-1 rounded-lg bg-luxury-50 border border-luxury-200 text-luxury-700 hover:border-gold-300 hover:bg-gold-50 transition-colors"
            >
              {s.title.replace(/^\d+\.\s*/, '')}
            </a>
          ))}
        </div>
      </nav>

      {sections.map((s) => (
        <section key={s.id} id={s.id} className="card p-5 scroll-mt-24">
          <h3 className="font-semibold text-luxury-900 mb-3">{s.title}</h3>
          <div className="text-sm leading-relaxed">{s.body}</div>
        </section>
      ))}
    </div>
  );
}
