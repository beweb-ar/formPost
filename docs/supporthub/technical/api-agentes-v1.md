---
supporthub:
  source_of_truth: false
  audience: technical
  priority: high
  source_type: generated
  generated_by: "Claude Opus 5 (claude-opus-5[1m])"
  generation_prompt: "kb-generation@v2.1"
  source_commit: "c73bdc5d2a8af4a127ee1d54200dce3ecbd806e8"
  derived_from:
    - server.js
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [api, agentes, v1, endpoints, integracion]
---

# API para agentes (`/api/v1`)

REST auto-documentada pensada para agentes de IA y automatizaciones. `GET /api/v1` (sin auth) devuelve la especificación completa: endpoints, esquemas de formulario/sender/cuenta y el contrato de `/submit` [evidencia: server.js:2933-3038].

## Autenticación y alcance

Header `X-API-Key: <clave>` o `Authorization: Bearer <clave>`. Dos tipos de clave [evidencia: server.js:2778-2810]:

- **Maestra** (`config.api.key`, o variable `API_KEY`): sin restricción de cuenta.
- **De cuenta** (`config.accounts[x].api.key`): estrictamente limitada a los datos de esa cuenta; ve además los recursos globales (senders y plantillas compartidas) en modo lectura.

Deshabilitable por tilde en el panel: si está apagada, todo responde `503 Agent API is disabled`. Límite: 240 pedidos/minuto.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/v1` | Especificación (pública) |
| GET | `/api/v1/status` | Versión, scope, formularios y senders visibles, `submitUrl` |
| GET | `/api/v1/accounts` | Cuentas visibles con sus formularios y senders; `canCreateAccounts` |
| POST | `/api/v1/accounts` | Crea una cuenta (**solo clave maestra**). `{ id, name }` → devuelve `apiKey` una única vez |
| GET | `/api/v1/forms` | Formularios del scope |
| POST | `/api/v1/forms` | Crea. Requiere `id` y `to`; devuelve `submitUrl` y `exampleHtml` |
| GET/PUT/DELETE | `/api/v1/forms/:id` | Lee, actualiza (merge parcial) y elimina |
| GET | `/api/v1/forms/:id/submissions?page=&limit=` | Envíos (máx 100 por página) |
| GET | `/api/v1/forms/:id/submissions/:entryId/attachments/:filename` | Descarga de adjunto |
| GET | `/api/v1/forms/:id/outbox?page=&limit=` | Log de entregas |
| GET/POST | `/api/v1/senders` | Lista y crea senders (secretos enmascarados) |
| PUT/DELETE | `/api/v1/senders/:id` | Actualiza y elimina (los globales, no) |
| POST | `/api/v1/senders/:id/test` | Verifica conexión y manda mail de prueba |
| GET | `/api/v1/templates` | Plantillas visibles + placeholders |
| GET/PUT | `/api/v1/templates/:name` | Lee y guarda contenido HTML |

[evidencia: server.js:3047-3419]

## Campos aceptados al crear/actualizar un formulario

`to` (requerido), `subjectPrefix`, `senderId`, `senderAlias`, `templatePath`, `autoReplyEnabled`, `autoReplyTemplate`, `autoReplySubject`, `autoReplyReplyTo`, `discordWebhook`, `telegramBotToken`, `telegramChatId`, `webhookUrl`, `captchaEnabled`, `captchaProvider`, `allowedDomains`, `redirectUrl`, más `captchaSecretKey` (solo escritura) [evidencia: server.js:2849-2855, 3122-3126].

Defaults al crear: `subjectPrefix = "[<id>]"`, `templatePath = "templates/contact-form.html"`, `captchaEnabled = false`, `allowedDomains = []` [evidencia: server.js:3149-3153].

Las respuestas incluyen `warnings` para problemas no fatales (por ejemplo, un `senderId` inexistente) [evidencia: server.js:2888-2896].

## Errores típicos

| Código | Mensaje | Causa |
|---|---|---|
| 401 | `Missing API key…` / `Invalid API key.` | Falta o no coincide la clave |
| 503 | `Agent API is disabled. Enable it from the admin UI.` | Ninguna clave habilitada |
| 403 | `Your API key is scoped to account "X" and cannot create accounts…` | Clave de cuenta intentando crear cuentas |
| 403 | `Global senders are managed by the administrator.` | Intento de editar/borrar un sender global |
| 409 | `Form "X" already exists…` / `Account "X" already exists…` / `Sender "X" already exists…` | ID duplicado |
| 400 | `Invalid "id"…` | ID con caracteres no permitidos o palabra reservada |
| 400 | `"to" must be one or more valid email addresses…` | Destinatarios inválidos |
| 400 | `"templatePath" must be a shared template…` | Plantilla fuera del alcance de la cuenta |
| 404 | `Form not found` / `Sender not found` / `Template not found` | Recurso inexistente o fuera de scope |
| 429 | `Too many API requests…` | Más de 240 pedidos/minuto |

[evidencia: server.js:2785-2806, 3087-3118, 3139, 3245-3247, 3282-3288]

## Flujo recomendado para un agente

1. `GET /api/v1` — aprender la API.
2. `GET /api/v1/accounts` — verificar la cuenta de la integración; con clave maestra, crearla con `POST /api/v1/accounts` si no existe.
3. `GET /api/v1/senders` — confirmar remitente activo; si falta, `POST /api/v1/senders` + `POST /api/v1/senders/:id/test`.
4. `POST /api/v1/forms` — crear el formulario y usar el `exampleHtml` devuelto.
5. `GET /api/v1/forms/:id/submissions` y `.../outbox` — verificar que llegan envíos y salen mails.

El panel entrega este mismo flujo listo para pegar en un agente: **Configuración > API para Agentes > Copiar prompt de integración** [evidencia: admin/index.html, `buildIntegrationPrompt`].

## Notas de trazabilidad

- Router y auth: [evidencia: server.js:2765-2830, 3040-3046]
- Especificación publicada: [evidencia: server.js:2933-3038]
- Endpoints: [evidencia: server.js:3047-3419]
- Validaciones de formulario y sender: [evidencia: server.js:2857-2931]
