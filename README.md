<p align="center">
  <img src="logo.png" alt="formPost" height="80" />
</p>

<p align="center">
  A production-ready Node.js backend for processing contact form submissions.<br/>
  <strong><a href="README.es.md">Leer en Español</a></strong>
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
- [Docker Deployment](#docker-deployment)
- [Security](#security)
- [File Structure](#file-structure)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

- **Multi-form support** - Handle unlimited forms, each with its own configuration
- **HTML email notifications** - Custom email templates per form with dynamic field injection
- **Cloudflare Turnstile** - Per-form bot protection with enable/disable toggle
- **Domain restriction** - Allow submissions only from authorized domains (per form)
- **Submission storage** - JSON file-based storage, up to 1000 submissions per form
- **Export** - Download submissions as CSV or JSON
- **Admin dashboard** - Full web UI to manage forms, SMTP, statistics, submissions, and passwords
- **Real-time inbox** - SSE-powered live feed of new submissions
- **Internationalization** - Server and admin UI available in English and Spanish via `LANG` env var
- **Statistics** - Per-form and global submission counts
- **Dark / Light theme** - Toggle in admin UI, persisted in localStorage
- **Rate limiting** - Separate limits for form submissions, admin API, and login attempts
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
            "to": "you@example.com",
            "subjectPrefix": "Contact Form - ",
            "redirectUrl": "https://example.com/thanks",
            "templatePath": "email-template.html",
            "turnstileEnabled": true,
            "allowedDomains": ["https://example.com", "https://www.example.com"]
        }
    },
    "statistics": {
        "my-form": {
            "successfulSubmissions": 0,
            "lastSubmission": null
        }
    },
    "smtp": {
        "host": "smtp.example.com",
        "port": 587,
        "secure": false,
        "from": "noreply@example.com",
        "user": "smtp_user",
        "pass": "smtp_pass"
    },
    "turnstile": {
        "my-form": {
            "secretKey": "0x4AAAAA..."
        }
    },
    "cors": {
        "allowedOrigins": [
            "https://example.com"
        ]
    },
    "admin": {
        "username": "admin",
        "password": "changeme123"
    }
}
```

### Sections

| Section | Description |
|---|---|
| `recipients` | One entry per form: destination email, subject prefix, redirect URL, template path, turnstile toggle, allowed domains |
| `statistics` | Auto-managed submission counters and timestamps per form |
| `smtp` | SMTP server settings (host, port, secure, from, user, pass) |
| `turnstile` | Cloudflare Turnstile secret key per form (optional) |
| `cors` | Array of allowed origins for CORS (must include protocol) |
| `admin` | Admin dashboard credentials |

### Per-form options

| Field | Type | Description |
|---|---|---|
| `to` | string | Destination email address |
| `subjectPrefix` | string | Email subject prefix |
| `redirectUrl` | string | URL to redirect after successful submission (optional) |
| `templatePath` | string | Path to email template HTML file |
| `turnstileEnabled` | boolean | Enable/disable Turnstile verification (default: `true` if key exists) |
| `allowedDomains` | string[] | List of allowed origin domains. Empty = allow all |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `DEBUG` | `false` | When `true`, skips Turnstile verification (for testing) |
| `LANG` | `es` | UI and server message language (`en` or `es`) |
| `ADMIN_USERNAME` | - | Override admin username from config.json |
| `ADMIN_PASSWORD` | - | Override admin password from config.json |
| `SMTP_HOST` | - | Override SMTP host |
| `SMTP_PORT` | - | Override SMTP port |
| `SMTP_SECURE` | - | Override SMTP secure flag |
| `SMTP_FROM` | - | Override SMTP from address |
| `SMTP_USER` | - | Override SMTP username |
| `SMTP_PASS` | - | Override SMTP password |

## Internationalization (i18n)

The application supports **English** (`en`) and **Spanish** (`es`).

```bash
# Spanish (default)
LANG=es

# English
LANG=en
```

- **If `LANG` is not set, Spanish is used by default.**
- The server translates all response messages (form validation errors, API responses, auth messages).
- The admin UI detects the language from the server and applies translations to all labels, buttons, toasts, confirm dialogs, and status bar items.

In Docker Compose, add it to `environment`:

```yaml
environment:
  - LANG=es
```

## Admin Interface

**URL:** `http://localhost:3000/admin`

### Dashboard

- **Status bar** - Server status, port, uptime, memory, form count, **total submissions** (global)
- **Form cards** - Each form shows: destination email, subject, redirect, template, Turnstile status, allowed domains, submission count, last submission date
- **Real-time inbox** - SSE-powered live feed of new submissions
- **Dark/Light theme** toggle

### Form Management

- Add, edit, and delete form configurations
- Enable/disable Turnstile verification per form
- Configure allowed domains per form (restrict which origins can submit)
- Changes are persisted to `config.json` immediately

### Submissions

- Paginated table per form (50 per page)
- Click any row to see full detail
- **Export CSV** or **Export JSON**
- **Delete all** submissions for a form
- IP addresses are anonymized (last octet masked)

### Statistics

- Per-form submission count and last submission timestamp
- **Total submissions** across all forms shown in the status bar
- Reset statistics per form

### Settings

- Edit SMTP configuration (credentials are masked in display)
- Change admin password (requires current password, min 8 chars)

## Email Templates

Templates are HTML files with placeholders. Two modes:

### Dynamic mode (recommended)

Use `{{fields}}` to auto-generate a list of all submitted fields:

```html
<h2>New submission from {{website_id}}</h2>
<div>{{fields}}</div>
```

### Legacy mode

Use individual `{{fieldname}}` placeholders:

```html
<p><strong>Name:</strong> {{name}}</p>
<p><strong>Email:</strong> {{email}}</p>
<p><strong>Message:</strong> {{message}}</p>
```

Field names are auto-converted to labels: `correo_electronico` becomes `Correo Electronico`.

If a template is missing or unreadable, the server generates a basic HTML email automatically.

## HTML Form Example

```html
<form action="https://your-server.com/submit" method="POST">
    <input type="hidden" name="website_id" value="my-form">
    <label>Name: <input type="text" name="name" required></label>
    <label>Email: <input type="email" name="email" required></label>
    <label>Message: <textarea name="message"></textarea></label>

    <!-- Cloudflare Turnstile (optional, only if configured and enabled) -->
    <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>

    <button type="submit">Send</button>
</form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

### Form constraints

- `website_id` (required) - Must match a key in `config.recipients`
- Max 30 fields per submission
- Max 100 characters per field name
- Max 5000 characters per field value
- Email fields are validated (email, correo, e_mail)

## API Reference

### Public

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/submit` | Process a form submission |
| `GET` | `/health` | Health check (no auth) |

### Admin (Basic Auth required)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/api/status` | Server status, uptime, memory, total submissions, lang |
| `GET` | `/admin/api/websites` | List all form configs |
| `POST` | `/admin/api/websites` | Create a new form |
| `PUT` | `/admin/api/websites/:id` | Update a form |
| `DELETE` | `/admin/api/websites/:id` | Delete a form |
| `GET` | `/admin/api/smtp` | Get SMTP config (credentials masked) |
| `PUT` | `/admin/api/smtp` | Update SMTP config |
| `GET` | `/admin/api/statistics` | Stats for all forms |
| `GET` | `/admin/api/statistics/:id` | Stats for one form |
| `PUT` | `/admin/api/statistics/:id/reset` | Reset stats for a form |
| `GET` | `/admin/api/submissions/:id` | Paginated submissions (`?page=1&limit=50`) |
| `DELETE` | `/admin/api/submissions/:id` | Delete all submissions for a form |
| `GET` | `/admin/api/submissions/:id/export` | Export submissions (`?format=json` or `csv`) |
| `PUT` | `/admin/api/admin/reset-password` | Change admin password |

## Docker Deployment

### docker-compose.yml

```bash
docker-compose up -d       # Start
docker-compose logs -f     # View logs
docker-compose down        # Stop
docker-compose restart     # Restart (required after config.json edits outside admin UI)
```

### Manual Docker

```bash
docker build -t formpost .

docker run -d \
  --name formpost \
  -p 3000:3000 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=securepassword \
  -e LANG=es \
  -v ./config.json:/app/config.json \
  -v ./data:/app/data \
  --restart always \
  formpost
```

### Docker features

- **Multi-stage build** - Final image ~150MB (Alpine + production deps only)
- **Non-root user** - Runs as `nodeuser` (UID 1001)
- **Health check** - `/health` every 30s, auto-restart on failure
- **Resource limits** - 512MB max, 128MB reserved
- **no-new-privileges** - Prevents privilege escalation
- **Volumes** - `config.json`, `data/` (submissions)

## Security

### Rate Limiting

| Scope | Limit |
|---|---|
| Form submissions | 5 per minute per IP |
| Admin API | 30 per minute per IP |
| Login attempts | 10 per 15 minutes (failures only) |

### Input Validation

- Request body limited to 100KB
- Max 30 fields, 5000 chars per value, 100 chars per key
- Email validation with 254 char limit
- HTML escaping in templates and submissions (XSS prevention)

### Domain Restriction

- Per-form `allowedDomains` validates the `Origin` header on submissions
- Rejects requests from unauthorized domains with 403

### Headers & Protections

- Helmet with CSP, XSS filter, HSTS, frameguard
- CORS with configurable allowed origins
- IP anonymization in stored submissions (last octet masked)
- Admin credentials never exposed in API responses
- SMTP credentials masked in status endpoint

## File Structure

```
formPost/
├── server.js                       # Main application
├── config.json                     # Configuration (managed by admin UI)
├── package.json                    # Dependencies
├── Dockerfile                      # Multi-stage Docker build
├── docker-compose.yml              # Docker Compose config
├── README.md                       # Documentation (English)
├── README.es.md                    # Documentation (Spanish)
├── LICENSE                         # ISC License
├── logo.png                        # Application logo
├── fav-icon.png                    # Favicon
├── email-template.html             # Default email template
├── email-template-*.html           # Per-form templates
├── admin/
│   └── index.html                  # Admin dashboard (single-file SPA)
└── data/
    └── submissions-{formId}.json   # Stored submissions per form
```

## Troubleshooting

### Emails not sending

1. Verify SMTP credentials in config.json or via admin UI
2. Check firewall allows outbound SMTP connections
3. Check logs: `docker-compose logs -f`

### Turnstile verification failing

1. Verify the site key matches the domain in Cloudflare
2. Check the secret key in config.json matches
3. Ensure `turnstileEnabled` is `true` for the form
4. Set `DEBUG=true` to bypass Turnstile for testing

### CORS errors

1. Add the exact origin to `cors.allowedOrigins` (include `https://`)
2. Restart the container after editing config.json manually

### Domain restriction blocking submissions

1. Check `allowedDomains` in the form config includes the submitting origin
2. Ensure the origin includes the protocol (e.g., `https://example.com`)
3. Remove `allowedDomains` or leave it empty to allow all origins
