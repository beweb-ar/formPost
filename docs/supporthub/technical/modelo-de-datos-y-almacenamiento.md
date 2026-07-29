---
supporthub:
  source_of_truth: false
  audience: technical
  priority: normal
  source_type: generated
  generated_by: "Claude Opus 5 (claude-opus-5[1m])"
  generation_prompt: "kb-generation@v2.1"
  source_commit: "c73bdc5d2a8af4a127ee1d54200dce3ecbd806e8"
  derived_from:
    - server.js
    - config.json
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [datos, config, almacenamiento, esquema]
---

# Modelo de datos y almacenamiento

Sin base de datos: JSON en disco. Todas las escrituras de configuración pasan por `writeConfigSafe`, que serializa con un mutex, hace copia previa en `config.backup.json` y cifra los secretos [evidencia: server.js:114-134].

## `config.json`

```jsonc
{
  "recipients":  { "<formId>": { /* configuración del formulario */ } },
  "senders":     { "<senderId>": { /* SMTP o SendGrid */ } },
  "captcha":     { "<formId>": { "secretKey": "enc:v1:…" } },
  "turnstile":   { /* legacy, mismo formato que captcha */ },
  "accounts":    { "<accountId>": { "name": "…", "api": { "key": "fp_…", "enabled": true } } },
  "users":       { "<username>": { "passwordHash": "$2b$…", "role": "…", "accountId": "…|null", "name": "…", "email": "…" } },
  "api":         { "key": "fp_…", "enabled": true },
  "auth":        { "googleClientId": "…apps.googleusercontent.com" },
  "statistics":  { "<formId>": { "successfulSubmissions": 0, "mailsSent": 0, "notificationsSent": 0, "lastSubmission": "ISO|null" } },
  "cors":        { "allowedOrigins": ["…"] },
  "smtp":        { /* legacy: migrado a senders.default */ }
}
```

### Formulario (`recipients[formId]`)

`to` (string, coma-separado), `subjectPrefix`, `redirectUrl`, `templatePath`, `senderId`, `senderAlias`, `accountId`, `captchaEnabled`, `captchaProvider`, `allowedDomains[]`, `discordWebhook`, `telegramBotToken` (cifrado), `telegramChatId`, `webhookUrl`, `autoReplyEnabled`, `autoReplySubject`, `autoReplyTemplate`, `autoReplyReplyTo`.

La clave secreta del captcha **no** vive acá: va en `captcha[formId].secretKey` [evidencia: server.js:1594-1600].

### Sender (`senders[senderId]`)

`name`, `type` (`smtp` | `sendgrid`), `from`, `active`, `accountId` (ausente = global) y, según el tipo: `host`/`port`/`secure`/`user`/`pass` (cifrada) o `apiKey` (cifrada)/`domain` [evidencia: server.js:2899-2930, 1680-1700].

### Usuario (`users[username]`)

`passwordHash` (bcrypt, 10 rounds), `role` (`superadmin` | `admin` | `user`), `accountId` (null para superadmin), `name`, `email` (identificador de ingreso para Google y códigos de un solo uso, único entre usuarios).

## Archivos en `data/`

| Ruta | Contenido | Retención |
|---|---|---|
| `submissions-<formId>.json` | Array de envíos, más nuevo primero | 1.000 por formulario |
| `outbox-<formId>.json` | Array de entregas | 500 por formulario |
| `attachments/<formId>/<submissionId>/` | Archivos adjuntos, nombre saneado | Vive con su envío |
| `.secret.key` | Clave de cifrado AES-256-GCM (0600) | Permanente — respaldar |

### Envío

```jsonc
{
  "id": "m8x1a2b3c",            // base36 de timestamp + aleatorio
  "timestamp": "2026-07-28T14:03:11.000Z",
  "ip": "200.51.23.xxx",        // anonimizada
  "submitMethod": "html|js",
  "name": "…", "email": "…",    // campos dinámicos del formulario
  "attachments": [ { "filename": "…", "size": 12345, "mimetype": "…" } ]
}
```

Claves reservadas (no son campos del formulario): `id`, `timestamp`, `ip`, `submitMethod`, `attachments`, `_hp_field` [evidencia: server.js:1050-1067, admin/index.html `meta`].

### Entrada de outbox

```jsonc
{
  "id": "m8x1a2b3c",
  "timestamp": "…",
  "channel": "email|discord|telegram",
  "to": "destino o etiqueta del canal",
  "subject": "…",
  "status": "ok|error|skipped",
  "autoReply": true,                 // solo en auto-respuestas
  "provider": "smtp|sendgrid",       // solo email
  "providerStatus": 202,             // SendGrid: aceptado para entrega
  "messageId": "…",
  "response": "…",
  "error": "…"                       // solo status=error
}
```

[evidencia: server.js:1003-1035, 1293-1305]

## Plantillas

- `templates/*.html` — compartidas (todas las cuentas las ven; solo superadmin las modifica).
- `templates/<accountId>/*.html` — de esa cuenta.
- `email-template.html` y `email-template*.html` en la raíz del proyecto — legacy, visibles para superadmin.

Placeholders: `{{fields}}` (lista generada), `{{form_id}}` / `{{website_id}}`, y `{{campo}}` para valores puntuales [evidencia: server.js:915-943, 2115-2148].

## Cifrado

Campos cifrados con AES-256-GCM y prefijo `enc:v1:`: `senders[*].pass`, `senders[*].apiKey`, `smtp.pass`, `recipients[*].telegramBotToken`, `captcha[*].secretKey`, `turnstile[*].secretKey`. El cifrado es idempotente y se aplica en cada escritura; los valores en texto plano heredados se leen igual y se cifran en la siguiente escritura [evidencia: server.js:67-112].

## Migraciones de arranque

Se ejecutan en orden y reescriben `config.json`: hash de la contraseña admin heredada → clave de API maestra → multi-cuenta (crea `accounts`, `users`, estampa `accountId`, genera claves por cuenta) → configuración de ingreso (client id de Google) → escritura final que cifra secretos pendientes [evidencia: server.js:291-451].

## Notas de trazabilidad

- Escritura segura y backup: [evidencia: server.js:114-134]
- Estructura de envíos y outbox: [evidencia: server.js:657-767, 1003-1087]
- Adjuntos y saneo de nombres: [evidencia: server.js:682-724]
- Cifrado: [evidencia: server.js:45-112]
- Migraciones: [evidencia: server.js:291-451]
