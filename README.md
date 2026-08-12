# Nationwide Advance — AI SMS Sales Agent

Production dashboard and AI texting engine for **Nationwide Advance** business financing (MCA / working capital).

**Live app:** [https://keith-sms-agent.vercel.app/](https://keith-sms-agent.vercel.app/)  
**GitHub:** [TechNationwide/ai-sms-sales-agent](https://github.com/TechNationwide/ai-sms-sales-agent)

Leads apply on the Nationwide website (pre-qualified). This platform texts them via **iBluSend**, answers with **OpenAI**, syncs context to **Zoho CRM**, and lets Nationwide Tech Admin monitor, take over, and train the bot from Settings.

---

## Table of contents

1. [What this system does](#1-what-this-system-does)
2. [Who uses it](#2-who-uses-it)
3. [Technology stack](#3-technology-stack)
4. [High-level architecture](#4-high-level-architecture)
5. [End-to-end business flow](#5-end-to-end-business-flow)
6. [AI sales behavior (Nationwide script)](#6-ai-sales-behavior-nationwide-script)
7. [Dashboard modules](#7-dashboard-modules)
8. [Bot Training (operator-editable)](#8-bot-training-operator-editable)
9. [Integrations setup](#9-integrations-setup)
10. [API reference](#10-api-reference)
11. [Environment variables](#11-environment-variables)
12. [Local development](#12-local-development)
13. [Production deploy (Vercel)](#13-production-deploy-vercel)
14. [Folder structure](#14-folder-structure)
15. [Security & compliance notes](#15-security--compliance-notes)
16. [Known limitations & roadmap](#16-known-limitations--roadmap)
17. [Changelog of what was built](#17-changelog-of-what-was-built)

---

## 1. What this system does

| Capability | Detail |
|------------|--------|
| Outbound outreach | First text to a new applicant using a Nationwide-branded opener |
| Inbound replies | AI responds in SMS/iMessage style using OpenAI |
| Objections | Scripted handling for not interested, call later, competitor, rates/terms |
| Docs CTA | Always steers toward application + recent **4-month bank statements** via upload link |
| Escalation | Hands off when the merchant is upset, asks for a human, opts out, or hits complex/legal topics |
| Human takeover | Tech Admin can pause AI, reply manually, resume AI |
| CRM sync | Zoho Notes/Tasks on conversation start, escalation, takeover |
| Training UI | Non-technical Bot Training in Settings (prompt, opener, upload link) |
| Demo mode | Full dashboard testing without sending real messages |
| PDF tool | Optional PDF compressor page for statement/document size reduction |

**Not in v1:** multi-tenant orgs, team agent accounts, Twilio as primary channel, model fine-tuning.

---

## 2. Who uses it

| Role | Access |
|------|--------|
| **Nationwide Tech Admin** | Single login. Full dashboard, Settings, Bot Training, takeover |
| **AI agent** | Texts leads automatically when AI is enabled |
| **Lead / merchant** | Receives/sends SMS or iMessage; never sees the dashboard |

### Default login (production seed)

| Field | Value |
|-------|-------|
| Email | `tech@nationwideadvance.com` |
| Password | `tech@nationwideadvance.com` |

Change this password for long-term production hardening when a password-change UI or secrets rotation process is added.

---

## 3. Technology stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts, React Router |
| Backend | Node.js 22, Express, TypeScript |
| Database | SQLite (`node:sqlite` / `DatabaseSync`) |
| AI | OpenAI API (`gpt-4o-mini` default) |
| Messaging | **iBluSend** (Mac bridge → iMessage / SMS) |
| CRM | Zoho CRM (OAuth refresh token + REST) |
| Auth | JWT + bcryptjs |
| Realtime | WebSocket locally; **polling fallback** on Vercel serverless |
| Hosting | Vercel (static client + `api/index.ts` serverless function) |
| Email alerts | Optional SMTP (nodemailer); without SMTP, preview-only delivery |

> Older docs mentioning Twilio as the primary SMS path are outdated. **Production messaging is iBluSend.** A Twilio webhook route remains only for local/legacy tests.

---

## 4. High-level architecture

```
                    ┌──────────────────────────────┐
                    │   Nationwide website form    │
                    │   (lead already pre-qualified)│
                    └──────────────┬───────────────┘
                                   │ Zoho lead / webhook
                                   ▼
┌─────────────┐   HTTPS/JWT    ┌──────────────────┐
│  React      │◄──────────────►│  Express API     │
│  Dashboard  │   (+ polling)  │  (Vercel / local)│
└─────────────┘                └────────┬─────────┘
                                        │
              ┌────────────┬────────────┬────────────┐
              ▼            ▼            ▼            ▼
         ┌────────┐  ┌────────┐  ┌──────────┐  ┌─────────┐
         │ SQLite │  │ OpenAI │  │ iBluSend │  │ Zoho CRM│
         │   DB   │  │   AI   │  │ messages │  │ Notes/  │
         └────────┘  └────────┘  └──────────┘  │ Tasks   │
                                               └─────────┘
```

### Runtime paths

| Environment | API | DB location | Realtime |
|-------------|-----|-------------|----------|
| Local `npm run dev` | `http://localhost:3001` | `server/data/` | WebSocket `/ws` |
| Vercel production | `https://keith-sms-agent.vercel.app/api` | `/tmp` (ephemeral) | Polling |

---

## 5. End-to-end business flow

### A. New lead outreach

1. Lead submits financing application on Nationwide’s site (pre-qualified).
2. Zoho creates/updates the lead → webhook `POST /api/webhooks/zoho/lead` (or Demo → New Lead).
3. Platform creates lead + conversation if none is active.
4. AI sends the **outreach opener** (Bot Training template) via iBluSend.
5. Zoho Note + in-app notification: “Outreach Sent”.

### B. Inbound message → AI reply

1. Merchant texts back.
2. iBluSend fires `message.received` → `POST /api/webhooks/iblusend`.
3. Platform finds/creates lead by phone, stores inbound message, runs sentiment.
4. If conversation is active and AI enabled → OpenAI generates reply using system prompt + last ~10 messages.
5. Outbound reply sent via iBluSend; dashboard updates (poll/WS).

### C. Objection & docs push

AI does **not** re-qualify (form already did). It handles objections and repeatedly steers to:

- Complete the application  
- Upload **recent 4-month bank statements**  
- Use the **secure upload link** from Settings (`bot_upload_link`)

### D. Escalation / human handoff

Triggers include:

- Explicit ask for a human / specialist  
- Frustrated / angry sentiment  
- STOP / unsubscribe / opt-out  
- Legal / complaint language  
- AI emits `[ESCALATE]` for questions too complex for text  

Effects:

- Conversation status → `escalated`, AI disabled  
- Zoho Task (if enabled)  
- Dashboard bell + escalation email to `ESCALATION_EMAIL` / Settings notify address  

**Note:** “Call me later” is **not** an auto-escalation — AI asks for best time and best number.

### E. Human takeover

1. Tech Admin opens Conversations → **Take Over** (pause AI).  
2. Types manual replies.  
3. **Resume AI** when ready to hand back to the bot.  
4. **Close** deal as won/lost when appropriate.

---

## 6. AI sales behavior (Nationwide script)

Defaults live in `server/src/services/ai.ts` and are editable in **Settings → Bot Training**.

| Topic | Behavior |
|-------|----------|
| Opener | Thank them for applying / trusting Nationwide with financing needs; reference funding need; invite next step on app + statements |
| Qualifying | **Do not** run a long qualification checklist |
| Not interested | Ask why they applied if not interested / what steered them away |
| Call later | Ask best time + confirm best number |
| Already with someone | Affirm shopping around; ask what goal wasn’t met |
| Rates / terms | Depend on qualifying factors; Nationwide strives for best rate/term outcomes; push docs |
| Never say | Guaranteed rates, approvals, amounts, or timelines |
| Always push | Application + 4-month bank statements on upload link |
| Handoff | Upset merchant or questions too difficult for text |

---

## 7. Dashboard modules

| Route | Purpose |
|-------|---------|
| `/` Dashboard | KPIs, needs-attention escalations, demo simulator, recent conversations |
| `/leads` | Lead list with status |
| `/conversations` | Thread view, reply, pause/resume, close |
| `/analytics` | Success / escalation / volume trends |
| `/pdf-compressor` | Compress PDFs (statements/docs) for easier sharing |
| `/settings` | Integrations, Bot Training, escalation email |
| `/docs` | **In-app documentation** (this guide, readable inside the product) |
| `/login` | Auth gate |

### Demo Simulator (Dashboard)

Use without burning live SMS:

- **Trigger Outreach SMS** — simulate new-lead opener  
- **Send Inbound SMS** — simulate merchant reply + AI response  
- **Simulate Full Conversation** — seed a sample thread  

---

## 8. Bot Training (operator-editable)

Path: **Settings → Bot Training**

| Field | Key | Notes |
|-------|-----|-------|
| Company Name | `bot_company_name` | Default: Nationwide Advance |
| Secure Upload Link | `bot_upload_link` | Sent when merchant is ready for docs |
| Products / Services Notes | `bot_products_catalog` | Optional context appended to prompt |
| System Prompt | `bot_system_prompt` | Personality, objections, never-say, handoff rules |
| Outreach Opener | `bot_outreach_template` | Placeholders: `{firstName}`, `{name}`, `{fundingNeed}` |

**How training works:** prompt engineering stored in settings (and code defaults). **Not** OpenAI fine-tuning. Changes apply on the **next** AI reply.

Also configurable nearby: OpenAI key/model, iBluSend keys, Zoho OAuth + notify toggles, escalation notify email.

---

## 9. Integrations setup

### iBluSend (primary messaging)

1. Create API key in iBluSend → Developer → API Keys.  
   - `iblu_test_…` = sandbox  
   - `iblu_…` = live  
2. Set Outbound Webhook to:

```text
https://keith-sms-agent.vercel.app/api/webhooks/iblusend
```

3. Put API key + webhook signing secret (+ optional device ID) in Vercel env or Settings.

### Zoho CRM

1. Create OAuth client; obtain refresh token with CRM scopes.  
2. Set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, optional `ZOHO_WEBHOOK_SECRET`.  
3. Point Zoho automation / webhook at:

```text
https://keith-sms-agent.vercel.app/api/webhooks/zoho/lead
```

4. Toggle Notes on conversation start and Tasks on escalation in Settings.

### OpenAI

1. Set `OPENAI_API_KEY` (and optional `OPENAI_MODEL`).  
2. Set `DEMO_MODE=false` in production so real AI is used.

### Escalation email

1. Set `ESCALATION_EMAIL=tech@nationwideadvance.com` (or override in Settings).  
2. Optional SMTP vars for real delivery (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, …).

---

## 10. API reference

Base: `https://keith-sms-agent.vercel.app/api` (or `http://localhost:3001/api`)

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/auth/login` | `{ email, password }` → `{ token, agent }` |
| POST | `/webhooks/iblusend` | iBluSend inbound events |
| POST | `/webhooks/zoho/lead` | New/updated Zoho lead |
| POST | `/webhooks/twilio/sms` | Legacy/local only |

### Protected (Bearer JWT)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/me` | Current admin profile |
| GET/POST | `/leads` | List / create leads |
| GET | `/conversations` | List conversations |
| GET | `/conversations/:id` | Thread + messages |
| POST | `/conversations/:id/reply` | Human reply |
| POST | `/conversations/:id/pause` | Take over (pause AI) |
| POST | `/conversations/:id/resume` | Resume AI |
| POST | `/conversations/:id/close` | `{ outcome: "won" \| "lost" }` |
| GET | `/analytics` | Dashboard metrics |
| GET/PUT | `/settings` | Read/update config |
| GET | `/notifications` | In-app alerts |
| POST | `/demo/inbound-sms` | Simulate inbound |
| POST | `/demo/new-lead` | Simulate outreach |
| POST | `/demo/simulate-conversation` | Seed demo thread |
| POST | `/agents` | **403** — multi-user disabled in v1 |

---

## 11. Environment variables

Copy `.env.example` → `.env` for local use. On Vercel, set the same keys in Project → Settings → Environment Variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Prod | JWT signing secret |
| `OPENAI_API_KEY` | Prod AI | OpenAI key |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini` |
| `IBLUSEND_API_KEY` | Prod SMS | iBluSend API key |
| `IBLUSEND_WEBHOOK_SECRET` | Recommended | Webhook signature secret |
| `IBLUSEND_DEVICE_ID` | No | Default device UUID |
| `IBLUSEND_BASE_URL` | No | API base URL |
| `ZOHO_CLIENT_ID` | Zoho | OAuth client |
| `ZOHO_CLIENT_SECRET` | Zoho | OAuth secret |
| `ZOHO_REFRESH_TOKEN` | Zoho | Refresh token |
| `ZOHO_API_DOMAIN` | No | Default `https://www.zohoapis.com` |
| `ZOHO_WEBHOOK_SECRET` | Recommended | Validates Zoho webhooks |
| `DEMO_MODE` | Prod | Set `false` for live AI/messaging |
| `ESCALATION_EMAIL` | Recommended | Alert inbox |
| `DASHBOARD_URL` | No | Links inside alert emails |
| `SMTP_*` / `EMAIL_FROM` | No | Real outbound email |

---

## 12. Local development

**Prerequisites:** Node.js 18+ (20/22 recommended), npm 9+

```bash
git clone https://github.com/TechNationwide/ai-sms-sales-agent.git
cd ai-sms-sales-agent
npm run install:all
cp .env.example .env
npm run dev
```

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:5173 |
| API | http://localhost:3001/api |
| Health | http://localhost:3001/api/health |

Vite proxies `/api` to the Express server during development.

---

## 13. Production deploy (Vercel)

Project: **Technationwide / keith-sms-agent**  
Public URL: **https://keith-sms-agent.vercel.app/**

How it is packaged (`vercel.json`):

1. Install root + `server` + `client` deps  
2. Build client → `client/dist`  
3. Serverless function `api/index.ts` mounts the Express app  
4. Rewrites `/api/*` → serverless function  

**Deploy notes:**

- Keep the PDF resizer companion folder out of the Vercel upload when it causes FastAPI auto-detect conflicts (use `.vercelignore` / exclude during CLI deploy).  
- After env changes, redeploy so functions pick them up.  
- SQLite on Vercel is **ephemeral** (`/tmp`) — fine for demos; for durable production history, plan Postgres (or similar) later.

---

## 14. Folder structure

```text
ai-sms-sales-agent/
├── api/                      # Vercel serverless entry → Express
├── client/                   # React dashboard (Vite)
│   └── src/
│       ├── pages/            # Dashboard, Leads, Conversations, Analytics,
│       │                     # PDF Compressor, Settings, Docs, Login
│       ├── components/
│       ├── context/          # Auth
│       ├── hooks/            # WebSocket / polling
│       └── api.ts
├── server/
│   └── src/
│       ├── db/               # Schema + seed
│       ├── models/           # Repository CRUD
│       ├── routes/           # REST API
│       ├── services/         # AI, iBluSend, Zoho, auth, email, conversation
│       ├── middleware/       # JWT
│       ├── app.ts
│       └── index.ts          # Local HTTP + WS server
├── .env.example
├── vercel.json
├── render.yaml               # Alternate host option
└── README.md                 # This document
```

---

## 15. Security & compliance notes

- Never guarantee rates, approvals, or funding amounts over text.  
- Never ask for SSN, full bank login, or card numbers in SMS.  
- Honor STOP / unsubscribe (escalate + stop selling).  
- Keep API keys in Vercel env / Settings — never commit `.env`.  
- Webhook secrets should be enabled for iBluSend and Zoho in production.  
- JWT secret must be unique and strong in production.

---

## 16. Known limitations & roadmap

| Limitation | Notes |
|------------|-------|
| Single-user v1 | One Tech Admin login; team agents deferred |
| Ephemeral SQLite on Vercel | Data can reset on cold starts; stable admin ID keeps login working |
| Serverless WebSocket | Dashboard uses polling on Vercel |
| SMTP optional | Without SMTP, escalation email may be preview-only |
| No formal DB migrations | Schema via `CREATE TABLE IF NOT EXISTS` |
| Single organization | Not multi-tenant |

**Likely next steps:** Postgres, durable storage, multi-user agents (when approved), stronger webhook verification defaults, CI, password-change UI.

---

## 17. Changelog of what was built

This section documents the delivered Nationwide platform as of the current main branch:

1. **Full-stack AI SMS agent** — React dashboard + Express API + SQLite.  
2. **iBluSend messaging path** — inbound webhook + outbound send (Twilio demoted to legacy).  
3. **OpenAI conversation engine** — system prompt, sentiment, demo fallbacks.  
4. **Zoho CRM hooks** — lead webhook, Notes/Tasks, notify toggles.  
5. **Nationwide sales script** — opener, objections, no-guarantee rules, docs CTA, upset/complex handoff.  
6. **Bot Training UI** — company, prompt, opener, upload link editable by Tech Admin.  
7. **Escalation alerts** — in-app bell + email to Nationwide tech inbox.  
8. **Human takeover** — pause AI / manual reply / resume.  
9. **Demo Simulator** — test outreach and inbound without live SMS.  
10. **Auth hardening for Vercel** — stable admin identity so login survives ephemeral DB.  
11. **Production login** — `tech@nationwideadvance.com`.  
12. **Vercel production deploy** — Technationwide project, live URL above.  
13. **PDF compressor page** — helper for shrinking statement PDFs.  
14. **In-app Docs page** — same architecture/business documentation inside the product.  
15. **GitHub** — source of truth at TechNationwide/ai-sms-sales-agent.

---

## License

Private repository for Nationwide Advance / TechNationwide. All rights reserved.
