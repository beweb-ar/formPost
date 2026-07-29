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
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [api, admin, endpoints, auth]
---

# API del panel (`/admin/api`) y endpoints de ingreso

Auth: `Authorization: Bearer <token de sesión>` o HTTP Basic. Límite: 120 pedidos/minuto. Roles: `superadmin`, `admin`, `user` [evidencia: server.js:1504-1506, 1403-1410].

## Ingreso (públicos, sin auth)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/admin/api/auth/config` | — | `{ googleClientId, googleEnabled, otpEnabled, lang }` |
| POST | `/admin/api/auth/password` | `{ email, password }` (acepta usuario en `email`) | `{ token, user }` · 401 si no valida |
| POST | `/admin/api/auth/otp/request` | `{ email }` | `202 { ok: true }` siempre que el pedido sea válido; 429 / 502 / 503 según el caso |
| POST | `/admin/api/auth/otp/verify` | `{ email, code }` | `{ token, user }` · 401 código inválido/expirado · 429 demasiados intentos |
| POST | `/admin/api/auth/google` | `{ credential }` (ID token de GIS) | `{ token, user }` · 401 token inválido · 403 email sin usuario · 503 deshabilitado |

Límites: 20 intentos fallidos / 15 min por IP en password, verify y google; 10 pedidos / 15 min por IP en otp/request, más 5 por hora por email [evidencia: server.js:3050-3068, 1509].

El token de sesión dura 12 h y se envía como `Authorization: Bearer <token>` [evidencia: server.js:1443-1475].

## Estado y formularios

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/status` | cualquiera | Versión, uptime, memoria, totales del scope, usuario actual |
| GET | `/websites` | cualquiera | Formularios del scope, con secretos enmascarados |
| POST | `/websites` | admin+ | `{ id, config }` |
| PUT | `/websites/:id` | admin+ | Merge parcial; solo superadmin puede cambiar `accountId` |
| DELETE | `/websites/:id` | admin+ | Borra captcha y adjuntos asociados |

## Envíos

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/submissions/:formId?page=&limit=&q=` | cualquiera | `q` filtra por nombre/email; `limit` máx 100 |
| DELETE | `/submissions/:formId` | admin+ | Vacía el formulario y borra adjuntos |
| DELETE | `/submissions/:formId/:entryId` | admin+ | Borra uno y sus adjuntos |
| GET | `/submissions/:formId/export?format=csv\|json` | cualquiera | Descarga completa |
| GET | `/submissions/:formId/attachments/:entryId/:filename` | cualquiera | Solo archivos listados en el envío |

## Bandejas y estadísticas

`GET /inbox/recent`, `GET /outbox/recent`, `GET /outbox/:formId?page=&limit=`, `DELETE /outbox/:formId/:entryId` (admin+), `GET /statistics`, `GET /statistics/:id`, `PUT /statistics/:id/reset` (admin+, sin UI que lo invoque), `GET /statistics/chart?period=today|week|month|year`, `POST /inbox/token` + `GET /admin/api/inbox/stream?token=` (SSE) [evidencia: server.js:1884-1975, 2282-2392].

## Senders

`GET /senders`, `POST /senders` (admin+), `PUT /senders/:id` (admin+, solo los de su cuenta), `DELETE /senders/:id` (admin+), `POST /senders/test` (config sin guardar), `POST /senders/:id/test` (merge sobre la config guardada) [evidencia: server.js:1680-1828].

Los secretos vacíos o `••••` se descartan del patch para conservar los almacenados.

## Plantillas

`GET /templates`, `GET /templates/:name` (superadmin puede pasar `?accountId=`), `PUT /templates/:name` (**cualquier rol autenticado**; scoped escribe en su carpeta y editar una compartida crea copia), `DELETE /templates/:name` (admin+) [evidencia: server.js:2177-2248].

## Cuentas, usuarios y claves

| Método | Ruta | Rol |
|---|---|---|
| GET/POST | `/accounts` | superadmin |
| PUT/DELETE | `/accounts/:id` | superadmin |
| POST | `/accounts/:id/apikey/regenerate` | superadmin |
| PUT | `/accounts/:id/api` | superadmin |
| GET/POST | `/users` | superadmin |
| PUT/DELETE | `/users/:username` | superadmin |
| GET/PUT | `/apikey` | admin+ (superadmin opera la clave maestra; admin, la de su cuenta) |
| POST | `/apikey/regenerate` | admin+ |
| PUT | `/admin/reset-password` | cualquiera (requiere contraseña actual) |
| GET | `/backup` · POST `/restore` | superadmin |

Los usuarios aceptan y devuelven `email`, único entre usuarios y usado como identificador de ingreso para Google y códigos de un solo uso [evidencia: server.js:2663-2761].

## Endpoints legacy

`GET /smtp` y `PUT /smtp` (superadmin) operan sobre el sender `default`; quedan por compatibilidad y ninguna pantalla los usa [evidencia: server.js:1862-1881].

## Notas de trazabilidad

- Router y middleware: [evidencia: server.js:1504-1506]
- Ingreso: [evidencia: server.js:3040-3170]
- Roles por endpoint: [evidencia: `requireRole` en cada ruta, server.js:1566-2761]
- Enmascarado de secretos: [evidencia: server.js:1455-1470, 1703-1709]
