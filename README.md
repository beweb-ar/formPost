<p align="center">
  <img src="logo.png" alt="formPost" height="80" />
</p>

<p align="center">
  A production-ready Node.js backend for processing contact form submissions.<br/>
  <strong><a href="README.es.md">Leer en Español</a></strong>
</p>

<p align="center">
  <img src="screenshot.jpg" alt="formPost Admin Dashboard" width="700" />
</p>

<p align="center">
  <strong>Sponsor:</strong>&nbsp;
  <a href="https://beweb.com.ar"><img src="logo_beweb.png" alt="beWeb" height="22" /></a>
</p>

[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-yellow)](LICENSE)

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [Internationalization (i18n)](#internationalization-i18n)
- [Admin Interface](#admin-interface)
- [Email Templates](#email-templates)
- [HTML Form Example](#html-form-example)
- [API Reference](#api-reference)
- [Agent API (for AI Agents)](#agent-api-for-ai-agents)
- [Docker Deployment](#docker-deployment)
- [Security](#security)
- [File Structure](#file-structure)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

### Core
- **Multi-form support** - Handle unlimited forms, each with its own configuration
- **Multi-sender email** - Configure multiple senders (SMTP relays or SendGrid API) with active/disabled toggle per sender
- **Sender failover** - Each sender can name a backup; connectivity/credential failures roll over to it automatically, and a circuit breaker keeps a downed relay out of the path until it recovers
- **SendGrid support** - Send via the SendGrid v3 HTTP API with just an API key and a verified sending domain (no SMTP ports needed)
- **Agent API** - Self-documented REST API (`/api/v1`) so AI agents can create accounts, forms, senders and templates programmatically
- **Three ways to sign in** - Google, email + one-time code (OTP), or email + password. Users are never self-registered: the email must already belong to a user
- **Multiple recipients** - Send to multiple email addresses per form (comma-separated, chip UI)
- **HTML email notifications** - Custom email templates per form with dynamic field injection
- **File attachments** - Accept file uploads (max 5 files, 10 MB each) and forward them via email, Discord, and Telegram
- **Template management** - Create, edit, and delete email templates from the admin UI
- **Auto-responder** - Automatic confirmation email to the person who submitted the form, with selectable template
- **Forms without sender** - Forms can work with notifications only (Discord, Telegram, Webhook) without an SMTP sender

### Notifications
- **Discord notifications** - Optional per-form Discord webhook for real-time submission alerts (with file attachments)
- **Telegram notifications** - Per-form Telegram bot notifications with automatic Chat ID discovery via "Fetch" button (with file attachments)
- **Generic webhook** - POST JSON payload to any URL on each submission (Slack, Zapier, n8n, custom backends)

### Bot Protection
- **Cloudflare Turnstile / hCaptcha** - Per-form captcha with provider selection and enable/disable toggle
- **Honeypot protection** - Hidden field (`_hp_field`) silently rejects bots without user friction
- **Domain restriction** - Allow submissions only from authorized domains (per form)

### Admin Dashboard
- **Full web UI** - Manage forms, senders, templates, statistics, submissions, and passwords
- **Real-time inbox** - SSE-powered live feed of new submissions
- **Real-time outbox** - Live feed of sent emails, Discord, and Telegram notifications with status (OK, error, skipped)
- **Outbox log modal** - Paginated full log of all outgoing mails and notifications per form
- **Statistics & charts** - Per-form and global counts for submissions, mails, and notifications with time-series chart (overlapping areas)
- **Submission search** - Search submissions by name or email
- **Integration code** - Ready-to-copy HTML form code in the edit modal, including honeypot and captcha
- **Backup / restore** - Export and import full configuration (forms, senders, templates) as JSON
- **Dark / Light theme** - Toggle in admin UI, persisted in localStorage
- **Internationalization** - Server and admin UI in English and Spanish via `LANG` env var

### Storage & Export
- **Submission storage** - JSON file-based storage, up to 1000 submissions per form
- **Outbox storage** - JSON file-based log of all outgoing mails and notifications (up to 500 per form)
- **Export** - Download submissions as CSV or JSON

### Security
- **Rate limiting** - Separate limits for form submissions, per-form global limits, admin API, and login attempts
- **Security headers** - Helmet middleware with CSP, XSS protection
- **Docker ready** - Multi-stage build, non-root user, health checks, resource limits

## Quick Start

### Docker Compose (recommended)

```bash
git clone https://github.com/beweb-ar/formPost.git
cd formPost

# Edit config.json with your SMTP and form settings, then:
docker-compose up -d

# Open http://localhost:3000/admin
# Default credentials: admin / changeme123
```

### Local Development

```bash
npm install
npm run dev    # nodemon with auto-reload
# or
npm start      # plain node
```

The admin interface is available at `http://localhost:3000/admin`.

## Configuration

All settings live in `config.json`. The admin UI can modify most of them at runtime.

```json
{
    "recipients": {
        "my-form": {
            "to": "you@example.com, team@example.com",
            "subjectPrefix": "Contact Form - ",
            "redirectUrl": "https://example.com/thanks",
            "templatePath": "templates/contact-form.html",
            "captchaEnabled": true,
            "captchaProvider": "turnstile",
            "allowedDomains": ["https://example.com"],
            "senderId": "default",
            "discordWebhook": "https://discord.com/api/webhooks/...",
            "telegramBotToken": "123456:ABC-DEF...",
            "telegramChatId": "-100123456789",
            "webhookUrl": "https://hooks.example.com/...",
            "autoReplyEnabled": true,
            "autoReplySubject": "Thank you for your submission",
            "autoReplyTemplate": "templates/auto-reply.html"
        }
    },
    "senders": {
        "default": {
            "name": "Default",
            "type": "smtp",
            "host": "smtp.example.com",
            "port": 587,
            "secure": false,
            "active": true,
            "from": "noreply@example.com",
            "user": "smtp_user",
            "pass": "smtp_pass",
            "backupSenderId": "sendgrid"
        },
        "sendgrid": {
            "name": "SendGrid",
            "type": "sendgrid",
            "apiKey": "SG.xxxxxxxx",
            "domain": "example.com",
            "from": "noreply@example.com",
            "active": true
        }
    },
    "api": {
        "key": "fp_xxxxxxxx (auto-generated on first run)",
        "enabled": true
    },
    "captcha": {
        "my-form": {
            "secretKey": "0x4AAAAA..."
        }
    },
    "cors": {
        "allowedOrigins": ["https://example.com"]
    },
    "admin": {
        "username": "admin",
        "password": "changeme123"
    }
}
```

### Per-form options

| Field | Type | Description |
|---|---|---|
| `to` | string | Destination email(s), comma-separated for multiple recipients |
| `subjectPrefix` | string | Email subject prefix |
| `redirectUrl` | string | URL to redirect after successful submission (optional) |
| `templatePath` | string | Path to email template HTML file |
| `captchaEnabled` | boolean | Enable/disable captcha verification |
| `captchaProvider` | string | `"turnstile"` or `"hcaptcha"` |
| `allowedDomains` | string[] | Allowed origin domains. Empty = allow all |
| `senderId` | string | ID of the sender to use (default: `"default"`) |
| `discordWebhook` | string | Discord webhook URL (optional) |
| `telegramBotToken` | string | Telegram Bot API token (optional) |
| `telegramChatId` | string | Telegram chat/group/channel ID (optional) |
| `webhookUrl` | string | Generic webhook URL - receives POST with JSON (optional) |
| `autoReplyEnabled` | boolean | Send auto-reply to the submitter's email |
| `autoReplySubject` | string | Subject for the auto-reply email |
| `autoReplyTemplate` | string | Template path for the auto-reply email |

### Sender options

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name / alias |
| `type` | string | `"smtp"` (default) or `"sendgrid"` |
| `active` | boolean | When `false`, emails are skipped (config preserved) |
| `from` | string | From email address |
| `host` | string | SMTP only: server hostname |
| `port` | number | SMTP only: port (587, 465, etc.) |
| `secure` | boolean | SMTP only: implicit TLS. Derived from the port — see below |
| `user` | string | SMTP only: username |
| `pass` | string | SMTP only: password |
| `apiKey` | string | SendGrid only: API key with **Mail Send** permission |
| `domain` | string | SendGrid only: verified sending domain (the `from` address must belong to it) |
| `backupSenderId` | string | Optional: sender to fall back to when this one fails — see [Sender failover](#sender-failover) |

> **SendGrid:** create an API key at SendGrid > Settings > API Keys with Mail Send permission, and verify your sending domain under Settings > Sender Authentication. SendGrid senders use the v3 HTTP API, so they work even where outbound SMTP ports are blocked.

### TLS mode is derived from the port

`secure` is not an independent choice: 465 is encrypted from the first byte (implicit TLS) while
587/2525/25 start in plaintext and upgrade with STARTTLS. Mixing them produces
`SSL routines:...:wrong version number`. formPost forces `secure` to match the port both on save and
when building the transport, so a config saved with the wrong combination is corrected without a
re-save. Non-standard ports keep whatever you configured. With credentials on a submission port
(587/2525) STARTTLS is required, so the password is never sent in the clear.

### Sender failover

Any sender can name another as its `backupSenderId`. When a send fails **because of the sender** —
no connection, TLS mismatch, rejected credentials, throttling, provider 5xx — the same message is
retried through the backup. When the failure belongs to the **message** — unknown recipient (550),
refused content, oversized attachment, SendGrid 400/413 — there is no retry: the backup would refuse
it identically.

Scope rules keep tenants apart:

- A **global** sender may only fall back to another **global** sender. Two global senders naming each
  other is the recommended highly-available pair.
- An **account** sender may fall back to a global sender or to another sender of the same account.
- So a client-owned sender **can have** a backup but can never **be** the backup of a shared sender —
  otherwise another account's mail would leave through that client's private relay.

A circuit breaker keeps a downed sender out of the way instead of paying its connection timeout on
every message: after `SENDER_FAIL_THRESHOLD` consecutive sender-level failures it is marked down and
all traffic goes straight to the backup for `SENDER_COOLDOWN_MINUTES`, doubling on each relapse up to
`SENDER_COOLDOWN_MAX_MINUTES`. A background probe verifies downed senders once a minute, so recovery
is detected and traffic returns on its own even with no traffic in the meantime. The state is
in-memory: a restart clears it. `GET /admin/api/senders` reports it per sender as `health.state`
(`up | degraded | down | recovering | unknown`), the Senders list shows a **DOWN** badge, and
`POST /admin/api/senders/:id/health/reset` clears it immediately.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `DEBUG` | `false` | When `true`, skips captcha verification |
| `LANG` | `es` | UI and server language (`en` or `es`) |
| `ADMIN_USERNAME` | - | Upsert a superadmin user with this username |
| `ADMIN_PASSWORD` | - | Password for the `ADMIN_USERNAME` superadmin |
| `API_KEY` | - | Override the master Agent API key (`/api/v1`, unrestricted) |
| `SENDER_FAIL_THRESHOLD` | `3` | Consecutive sender-level failures before a sender is marked down and traffic moves to its backup |
| `SENDER_COOLDOWN_MINUTES` | `5` | How long a downed sender is skipped before it gets a trial send |
| `SENDER_COOLDOWN_MAX_MINUTES` | `30` | Cap for the cooldown, which doubles on each relapse |
| `GOOGLE_CLIENT_ID` | (stored in `config.auth.googleClientId`) | Google OAuth client id for "Sign in with Google" on the admin panel |
| `SUPPORTHUB_TOOLS_SECRET` | - | HS256 secret that signs the user tokens accepted by the read-only `/agent-api` endpoints (SupportHub agent tools). Unset = `/agent-api` and the token endpoint are disabled |
| `SUPPORTHUB_URL` | - | Base URL of the SupportHub platform. Set it and the admin panel loads the help widget for signed-in users; unset, nothing is loaded |
| `USER_EMAILS` | - | Seeds the email of existing users so they can use Google / one-time-code sign-in: `user1=mail1@dom,user2=mail2@dom`. Written into each user record, only when that user has no email yet |
| `ENCRYPTION_KEY` | auto | 64 hex chars (32 bytes) used to encrypt stored secrets (SMTP passwords, SendGrid keys, Telegram tokens, captcha secrets). If unset, a key is auto-generated at `data/.secret.key` — **back that file up**: without it, encrypted secrets cannot be recovered |

## Accounts, Users & Roles (v1.4)

formPost is multi-tenant. Data (forms, senders, templates, inbox/outbox, statistics) is scoped per **account**:

- **superadmin** — sees and manages everything: accounts, users, global senders, shared templates, backup/restore, the master API key and every account's API key. Existing installs migrate automatically: the legacy admin becomes a superadmin and existing forms move to the `default` account.
- **admin** (account admin) — full management of their own account's forms, senders, templates and data. Cannot create accounts or users.
- **user** — read-mostly within the account: views inbox/outbox and submissions, and can view/edit the account's templates. Cannot create or modify forms or senders.

**Signing in**: every user has three ways in, all resolving to the same user: **Google** ("Sign in with Google" button), **email + one-time code** (a 6-digit code emailed to them, valid for 10 minutes and single use) or **email + password**. Google and one-time codes require the user to have an **email** on file — there is no self-registration: if the email does not belong to an existing user, sign-in is refused. A successful sign-in issues a signed session token (12 h) that the panel sends as `Authorization: Bearer`.

**Global senders**: a sender without an account is *global* — every account can use it in their forms, but only a superadmin can edit it. Existing senders migrate as global.

**Shared templates**: files in the root of `templates/` are shared with all accounts (read-only for them); per-account templates live in `templates/<accountId>/`. When an account edits a shared template, a private account copy is created automatically.

**Per-account Agent API keys**: each account has its own `/api/v1` key, strictly limited to that account's data — an agent configured with one account's key cannot read or touch any other account. The master key (shown to superadmins) retains unrestricted access.

**Attachments**: uploaded files are stored in `data/attachments/<formId>/<submissionId>/`, listed in each submission, and downloadable from the admin UI and `/api/v1`. They are deleted together with their submission.

**Secrets at rest**: SMTP passwords, SendGrid API keys, Telegram bot tokens and captcha secrets are encrypted (AES-256-GCM) inside `config.json` and never returned by any API after being saved. Backups keep secrets encrypted — restoring on another server requires the same `ENCRYPTION_KEY` / `data/.secret.key`.

## Internationalization (i18n)

The application supports **English** (`en`) and **Spanish** (`es`). All labels, buttons, stat cards, chart filters, and messages are translated.

```yaml
environment:
  - LANG=es   # Spanish (default)
  - LANG=en   # English
```

## Admin Interface

**URL:** `http://localhost:3000/admin`

### Dashboard

- **Status bar** - Server status, port, uptime, memory, submissions, mails, notifications
- **Form cards** - Destination, subject, captcha, domains, sender, Discord, Telegram, webhook, auto-reply status, per-form stats (submissions, mails, notifications)
- **Real-time inbox** (left) - Live feed of incoming submissions via SSE
- **Real-time outbox** (right) - Live feed of outgoing mails and notifications with status
- **Charts** - Overlapping area chart with submissions, mails, and notifications series
- **Dark/Light theme** toggle

### Form Management

- Add, edit, and delete forms with full configuration
- Multiple recipients with chip/tag UI
- Captcha provider selection (Turnstile / hCaptcha)
- Discord, Telegram, and webhook configuration
- Auto-responder with template selection
- Integration code section with copy-to-clipboard
- Backup and restore from the Senders modal

### Submissions

- Paginated table (10 per page) with search by name/email
- Click any row for full detail
- Export CSV / JSON, delete all

### Outbox Log

- Click any outbox entry to open paginated log modal
- Shows: date, channel (Mail/Discord/Telegram), destination, subject, status (OK/Error/Skipped)

### Settings

The Settings modal is split into tabs: **Senders**, **Accounts** and **Users** (superadmin only) and **Agent API**.

- Add, edit, delete senders (SMTP or SendGrid) with active/disabled toggle
- Test connection from the UI
- Agent API key management: view, copy, regenerate, enable/disable
- Copy integration prompt: a ready-to-paste paragraph instructing an AI agent to integrate the site's forms through `/api/v1`
- Backup / Restore buttons (exports forms, senders, templates as JSON)

## Email Templates

Templates are HTML files with placeholders:

```html
<!-- Dynamic mode (recommended) -->
<h2>New submission from {{form_id}}</h2>
<ul>{{fields}}</ul>

<!-- Legacy mode -->
<p><strong>Name:</strong> {{name}}</p>
```

> Both `{{form_id}}` and `{{website_id}}` are supported for backward compatibility.

An auto-reply template (`templates/auto-reply.html`) is included for the auto-responder feature.

## HTML Form Example

```html
<form action="https://your-server.com/submit" method="POST" enctype="multipart/form-data">
    <input type="hidden" name="form_id" value="my-form">

    <!-- Honeypot anti-spam (hidden, do not remove) -->
    <input type="text" name="_hp_field" style="display:none" tabindex="-1" autocomplete="off">

    <label>Name: <input type="text" name="name" required></label>
    <label>Email: <input type="email" name="email" required></label>
    <label>Phone: <input type="tel" name="phone"></label>
    <label>Message: <textarea name="message"></textarea></label>

    <!-- File attachments (optional, max 5 files, 10 MB each) -->
    <label>Attachments: <input type="file" name="attachments" multiple></label>

    <!-- Captcha (if configured) -->
    <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
    <!-- or: <div class="h-captcha" data-sitekey="YOUR_SITE_KEY"></div> -->

    <button type="submit">Send</button>
</form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

> The field `website_id` is still accepted for backward compatibility, but `form_id` is preferred.

## API Reference

### Public

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/submit` | Process a form submission |
| `GET` | `/health` | Health check |

### Admin (Basic Auth)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/api/status` | Server status, totals for submissions/mails/notifications |
| `GET/POST/PUT/DELETE` | `/admin/api/websites[/:id]` | CRUD forms |
| `GET/POST/PUT/DELETE` | `/admin/api/senders[/:id]` | CRUD senders |
| `POST` | `/admin/api/senders/:id/test` | Test sender connection |
| `POST` | `/admin/api/senders/:id/health/reset` | Clear a sender's circuit breaker and retry it immediately |
| `POST` | `/admin/api/telegram/chats` | Fetch available Telegram chats for a bot token |
| `GET/PUT/DELETE` | `/admin/api/templates[/:name]` | CRUD templates |
| `GET` | `/admin/api/statistics[/:id]` | Stats (includes mails/notifications counts) |
| `GET` | `/admin/api/statistics/chart` | Chart data with submissions, mails, notifications per day |
| `PUT` | `/admin/api/statistics/:id/reset` | Reset stats |
| `GET` | `/admin/api/submissions/:id` | Paginated submissions (`?page=1&limit=10&q=search`) |
| `DELETE` | `/admin/api/submissions/:id` | Delete all submissions |
| `GET` | `/admin/api/submissions/:id/export` | Export (`?format=json\|csv`) |
| `GET` | `/admin/api/outbox/recent` | Recent outbox entries |
| `GET` | `/admin/api/outbox/:id` | Paginated outbox log per form |
| `GET` | `/admin/api/backup` | Download full backup (JSON) |
| `POST` | `/admin/api/restore` | Restore from backup |
| `POST` | `/admin/api/inbox/token` | Issue SSE token |
| `GET` | `/admin/api/inbox/stream` | SSE stream (inbox + outbox events) |
| `GET` | `/admin/api/auth/config` | Public: which sign-in methods the login screen should offer |
| `POST` | `/admin/api/auth/password` | Public: sign in with email (or legacy username) + password. Returns a session token |
| `POST` | `/admin/api/auth/otp/request` | Public: email a 6-digit one-time code (always answers `202`, never reveals if the email exists) |
| `POST` | `/admin/api/auth/otp/verify` | Public: exchange email + code for a session token |
| `POST` | `/admin/api/auth/google` | Public: exchange a Google ID token for a session token |
| `GET` | `/admin/api/apikey` | View Agent API key and enabled state |
| `POST` | `/admin/api/apikey/regenerate` | Regenerate the Agent API key |
| `PUT` | `/admin/api/apikey` | Enable/disable the Agent API (`{ "enabled": true }`) |

## Agent API (for AI Agents)

formPost is often the backend for websites built by AI agents. The **Agent API** lets the agent itself connect to your formPost instance and configure everything it needs — forms, email senders (SMTP or SendGrid), templates — and read back submissions and delivery logs, without touching the admin UI.

**Everything an agent needs to know:**

1. **Base URL:** `https://your-server.com/api/v1`
2. **Self-documentation:** `GET /api/v1` (no auth) returns a machine-readable JSON spec of every endpoint, every field and the submit contract. An agent can bootstrap itself from that single URL.
3. **Authentication:** send the API key in the `X-API-Key` header (or `Authorization: Bearer <key>`). The key is auto-generated on first run; the admin can view/copy/regenerate it in the admin UI under **Settings > Agent API**, or set it via the `API_KEY` environment variable.
4. **Accounts:** `GET /api/v1/accounts` tells the agent whether the account for the integration already exists. With the master key it can create a new one with `POST /api/v1/accounts` and get back that account's own scoped key; an account key is already bound to its account and cannot create more.

> Prompt suggestion for your AI agent:
> *"You can create the backend for this contact form on my formPost instance. Fetch `https://your-server.com/api/v1` to learn the API; authenticate with header `X-API-Key: fp_xxx`. Create a form, then use the `exampleHtml` from the response in the website."*

The admin UI writes that prompt for you: **Settings > Agent API > Copy integration prompt** copies a full paragraph of instructions with this server's URL and your key already filled in, including the account check and the account-creation step.

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1` | API spec (public, no auth, no secrets) |
| `GET` | `/api/v1/status` | Version, configured forms and senders |
| `GET` | `/api/v1/accounts` | List accounts visible to the key (an account key only sees its own), with their forms and senders |
| `POST` | `/api/v1/accounts` | Create an account — master key only. Body: `{ "id", "name" }`. Returns the new account-scoped `apiKey` once |
| `GET` | `/api/v1/forms` | List all forms with full config |
| `POST` | `/api/v1/forms` | Create a form. Body: `{ "id", ...formConfig }` |
| `GET` | `/api/v1/forms/:id` | Get one form |
| `PUT` | `/api/v1/forms/:id` | Update a form (partial body, merged) |
| `DELETE` | `/api/v1/forms/:id` | Delete a form |
| `GET` | `/api/v1/forms/:id/submissions` | Read submissions (`?page=1&limit=50`) |
| `GET` | `/api/v1/forms/:id/outbox` | Delivery log (emails/notifications with ok/error status) |
| `GET` | `/api/v1/senders` | List senders (secrets masked) |
| `POST` | `/api/v1/senders` | Create a sender (SMTP or SendGrid). Body: `{ "id", ...senderConfig }` |
| `PUT` | `/api/v1/senders/:id` | Update a sender (omit `pass`/`apiKey` to keep stored secrets) |
| `DELETE` | `/api/v1/senders/:id` | Delete a sender |
| `POST` | `/api/v1/senders/:id/test` | Verify connection + send test email. Body: `{ "to" }` (optional) |
| `GET` | `/api/v1/templates` | List email templates |
| `GET` | `/api/v1/templates/:name` | Get template content |
| `PUT` | `/api/v1/templates/:name` | Create/update a template. Body: `{ "content": "<html>..." }` |

The form and sender field schemas are the same as in [Configuration](#configuration) (see `formConfig` and `senderConfig` in the `GET /api/v1` response). Extra create-form niceties:

- `to` is the only required field besides `id`; sensible defaults are applied (`subjectPrefix`, `templatePath`, captcha off, all origins allowed).
- `captchaSecretKey` (write-only) can be included to configure captcha verification in one call.
- The create response includes `submitUrl` and a ready-to-paste `exampleHtml` form snippet.
- Validation errors come back as descriptive messages an agent can act on, plus `warnings` for non-fatal issues (e.g. a `senderId` that doesn't exist yet).

### Example: full agent flow

```bash
BASE="https://your-server.com"
KEY="fp_xxxxxxxxxxxxxxxx"

# 0. Discover the API (no auth)
curl "$BASE/api/v1"

# 0b. Check the account for this integration (with the master key, create it if missing)
curl -H "X-API-Key: $KEY" "$BASE/api/v1/accounts"
curl -X POST "$BASE/api/v1/accounts" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{ "id": "acme", "name": "ACME Inc" }'
# -> returns "apiKey": the scoped key for that account (shown only once)

# 1. Create a SendGrid sender (or skip if GET /api/v1/senders shows one)
curl -X POST "$BASE/api/v1/senders" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "id": "sendgrid-main",
    "type": "sendgrid",
    "name": "SendGrid",
    "apiKey": "SG.xxxxxxxx",
    "domain": "example.com",
    "from": "noreply@example.com"
  }'

# 2. Test it
curl -X POST "$BASE/api/v1/senders/sendgrid-main/test" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{ "to": "me@example.com" }'

# 3. Create the form
curl -X POST "$BASE/api/v1/forms" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "id": "landing-contact",
    "to": "owner@example.com",
    "subjectPrefix": "[Landing] ",
    "senderId": "sendgrid-main",
    "allowedDomains": ["https://example.com"],
    "autoReplyEnabled": true,
    "autoReplySubject": "Thanks! We got your message"
  }'
# -> response includes "exampleHtml": a working <form> ready to paste into the website

# 4. Later: read the submissions and verify deliveries
curl -H "X-API-Key: $KEY" "$BASE/api/v1/forms/landing-contact/submissions?limit=10"
curl -H "X-API-Key: $KEY" "$BASE/api/v1/forms/landing-contact/outbox"
```

### Rate limits & safety

- Agent API: 240 requests/minute.
- The key grants admin-level configuration access — treat it like a password. Regenerate it anytime from the admin UI.
- The API can be disabled entirely with the **Enabled** toggle in **Settings > Agent API** (requests then get `503`).
- Secrets (`pass`, `apiKey`) are write-only: never returned by `GET` endpoints.

## Docker Deployment

```bash
docker-compose up -d       # Start
docker-compose logs -f     # View logs
docker-compose down        # Stop
```

### Docker features

- **Multi-stage build** - Final image ~150MB
- **Non-root user** - Runs as `nodeuser` (UID 1001)
- **Health check** - `/health` every 30s
- **Resource limits** - 512MB max, 128MB reserved
- **Volumes** - `config.json`, `data/`, `templates/`

## Security

| Scope | Limit |
|---|---|
| Form submissions | 5 per minute per IP |
| Per-form global | 100 per minute per form |
| Admin API | 30 per minute per IP |
| Login attempts | 20 per 7 minutes (failures only) |
| File attachments | Max 5 files, 10 MB each |
| Blocked file types | `.exe`, `.bat`, `.cmd`, `.sh`, `.ps1`, `.msi`, `.dll`, `.com`, `.scr`, `.pif`, `.vbs`, `.js`, `.jar`, `.cpl`, `.inf`, `.reg` |

## File Structure

```
formPost/
├── server.js                       # Main application
├── config.json                     # Configuration
├── package.json
├── Dockerfile / docker-compose.yml
├── admin/
│   └── index.html                  # Admin dashboard (single-file SPA)
├── templates/
│   ├── contact-form.html           # Default email template
│   └── auto-reply.html             # Auto-responder template
└── data/
    ├── submissions-{formId}.json   # Stored submissions
    └── outbox-{formId}.json        # Outgoing mail/notification log
```

## License

ISC
