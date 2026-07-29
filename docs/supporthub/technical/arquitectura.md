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
    - admin/index.html
    - package.json
    - Dockerfile
    - docker-compose.yml
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [arquitectura, stack, seguridad, despliegue]
---

# Arquitectura de formPost

## Stack

Node.js + Express 4, sin base de datos y sin build de frontend. Dependencias: `nodemailer` (SMTP), `axios` (SendGrid v3, captcha, Discord, Telegram, Google), `multer` (adjuntos), `bcrypt` (contraseñas), `helmet` (CSP), `express-rate-limit`, `body-parser` [evidencia: package.json].

Dos artefactos:

- `server.js` — todo el backend: endpoint público de envío, API del panel, API para agentes, cifrado, migraciones.
- `admin/index.html` — el panel completo (HTML + CSS + JS inline, ES5, sin framework). Única dependencia externa: Chart.js por CDN y, en la pantalla de ingreso, Google Identity Services.

Persistencia en archivos: `config.json` (configuración) y `data/` (envíos, outbox, adjuntos, clave de cifrado).

## Superficies HTTP

| Superficie | Auth | Uso |
|---|---|---|
| `POST /submit` | ninguna (CORS abierto, control por `allowedDomains`) | Recepción de formularios |
| `GET /health` | ninguna | Health check |
| `/admin` | ninguna (el panel maneja su propio ingreso) | Sirve el panel |
| `/admin/api/auth/*` | ninguna (pública) | Ingreso: contraseña, código de un solo uso, Google |
| `/admin/api/*` | `Authorization: Bearer <sesión>` o HTTP Basic | API del panel, con roles |
| `/api/v1/*` | `X-API-Key` o `Authorization: Bearer <api key>` | API para agentes |
| `/agent-api/*` | JWT del usuario (HS256, `SUPPORTHUB_TOOLS_SECRET`) | Herramientas de solo lectura para el agente de ayuda (SupportHub) |

[evidencia: server.js:788, 1349, 1483, 3040-3170, 1504-2763, 2765-3421]

## Modelo multi-cuenta

`accountId` es el eje de aislamiento. El scope se resuelve por request: `null` para superadmin (ve todo), o el `accountId` del usuario/clave. Todos los listados y accesos pasan por helpers (`formsForScope`, `sendersForScope`, `formInScope`, `senderInScope`, `canAccessForm`, `canManageSender`) [evidencia: server.js:1392-1453].

Recursos globales (sin `accountId`): senders y plantillas de la raíz de `templates/`, visibles para todas las cuentas y modificables solo por superadmin.

## Autenticación

- **Panel**: tres flujos públicos (`/admin/api/auth/password`, `/otp/request` + `/otp/verify`, `/google`) que emiten un **token de sesión stateless** `fps1.<payload>.<hmac>` firmado con HMAC-SHA256 derivado de la clave de cifrado del servidor; expira a las 12 h y el rol se relee del `config.json` en cada request. Se acepta también HTTP Basic para compatibilidad y clientes de API.
- **Google**: el navegador obtiene un ID token con Google Identity Services y el servidor lo valida contra `https://oauth2.googleapis.com/tokeninfo`, exigiendo que `aud`/`azp` sea el client id propio y que el email esté verificado. Sin auto-registro.
- **Códigos de un solo uso**: 6 dígitos, HMAC del código en memoria, TTL 10 min, 3 intentos, 5 pedidos/hora por email; se envían con el sender de la cuenta del usuario.
- **API para agentes**: comparación en tiempo constante contra la clave maestra y las claves de cuenta; el scope resultante viaja en `req.apiScope`.

[evidencia: server.js:1438-1594, 3040-3170, 2778-2810]

## Cifrado de secretos

AES-256-GCM con prefijo `enc:v1:` sobre contraseñas SMTP, API keys de SendGrid, tokens de Telegram y claves de captcha. La clave sale de `ENCRYPTION_KEY` (64 hex) o de `data/.secret.key`, autogenerada con permisos 0600. Todas las escrituras de configuración pasan por `writeConfigSafe`, que cifra de forma idempotente y deja `config.backup.json` [evidencia: server.js:45-134].

Las APIs nunca devuelven secretos: se enmascaran como `••••` y los patches con ese valor se descartan para no pisar lo guardado.

## Tiempo real (SSE)

El panel pide un token corto (`POST /admin/api/inbox/token`, 5 min, un solo uso) y abre `GET /admin/api/inbox/stream?token=`. Cada cliente guarda su scope; `broadcastSSE` filtra por cuenta del formulario. Máximo 20 clientes, keepalive cada 30 s [evidencia: server.js:231-244, 2348-2392].

## Seguridad aplicada

- Helmet con CSP explícita (permite Chart.js por CDN y Google Identity Services en el ingreso).
- Rate limiting por superficie (envíos, panel, login, API de agentes).
- Honeypot + captcha + control de origen en `/submit`.
- Anonimización de IP en los envíos guardados.
- Defensas de path traversal en plantillas y adjuntos (los adjuntos solo se sirven si figuran en los metadatos del envío).
- Bloqueo de extensiones ejecutables en subidas.

[evidencia: server.js:361-373, 376-414, 804-836, 1046-1049, 2077-2089, 2151-2174, 24-30]

## Despliegue

Docker multi-stage con usuario no-root y health check; `docker-compose.yml` monta `config.json`, `data/` y `templates/`. El puerto se toma de `PORT` (3000 por defecto) [evidencia: Dockerfile, docker-compose.yml, server.js:140].

## Limitaciones estructurales conocidas

- Un solo proceso: los códigos de un solo uso, el contador por formulario y los clientes SSE viven en memoria; con varias réplicas habría que externalizarlos [inferencia].
- `config.json` es el almacén de configuración: las escrituras están serializadas por un mutex, pero no hay transacciones ni historial más allá de `config.backup.json`.
- Los envíos se guardan como JSON por formulario, con un tope de 1.000; no hay índice ni búsqueda más allá de nombre/email.

## Notas de trazabilidad

- Estructura y dependencias: [evidencia: package.json, server.js:1-31]
- Superficies y montaje de routers: [evidencia: server.js:1483-1506, 3040-3170, 3421]
- Aislamiento por cuenta: [evidencia: server.js:1392-1453]
- Cifrado y escritura de config: [evidencia: server.js:45-134]
- SSE: [evidencia: server.js:2348-2392]
