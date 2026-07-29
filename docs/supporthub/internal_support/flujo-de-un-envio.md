---
supporthub:
  source_of_truth: false
  audience: internal_support
  priority: critical
  source_type: generated
  generated_by: "Claude Opus 5 (claude-opus-5[1m])"
  generation_prompt: "kb-generation@v2.1"
  source_commit: "c73bdc5d2a8af4a127ee1d54200dce3ecbd806e8"
  derived_from:
    - server.js
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [flujo, submit, diagnostico, orden-de-ejecucion]
---

# Qué hace formPost con un envío, paso a paso

Orden real de ejecución de `POST /submit` [evidencia: server.js:788-1329]. Sirve para ubicar en qué punto se rompió algo.

| # | Paso | Si falla |
|---|---|---|
| 1 | Límite de 5 envíos/min por IP (middleware) | `429 Too many submissions...` — no queda registro |
| 2 | Se guardan los adjuntos en el temporal del sistema (máx 5 × 10 MB, extensiones bloqueadas) | `400 File too large / Too many files / File type not allowed` |
| 3 | **Honeypot**: si `_hp_field` viene con valor → corta y responde éxito falso | Nada se guarda; queda `Honeypot triggered` en el log |
| 4 | Validación del `form_id` y existencia del formulario | `400 ID de formulario no válido.` |
| 5 | Límite de 100 envíos/min por formulario | `429 Too many submissions for this form...` |
| 6 | Control de origen contra `allowedDomains` (Origin, si no Referer) | `403 No se permiten envíos desde este dominio.` |
| 7 | Validación de campos: ≤30, nombre ≤100, valor ≤5000, email válido | `400` con el mensaje correspondiente |
| 8 | Captcha: solo si `captchaEnabled !== false` **y** hay clave secreta guardada; `DEBUG=true` lo saltea | `400 completeCaptcha / captchaFailed`, `500 captchaError` |
| 9 | Se arma el cuerpo del email con la plantilla (`{{fields}}`, `{{form_id}}`, `{{campo}}`) o uno genérico si no existe el archivo | `500 templateError` si el path sale del directorio de la app |
| 10 | Se elige el sender: el del formulario; si no sirve, el primero de la cuenta; si no, uno global | Sin sender → se saltea el email (solo log). Sender inactivo → outbox `skipped` |
| 11 | **Envío del email principal** | Outbox `error` + **`500 serverError` y se corta el flujo: el envío NO se guarda** |
| 12 | Se guarda el envío en `data/submissions-<form>.json` (IP anonimizada, `submitMethod`), se persisten adjuntos y se emite el evento SSE de inbox | Solo log de error; el visitante ya recibió respuesta |
| 13 | Estadísticas: `successfulSubmissions++`, `mailsSent++` si el mail salió | Solo log |
| 14 | Discord (si hay webhook): mensaje + adjuntos → outbox | Outbox `error`; no corta |
| 15 | Telegram (si hay token **y** chat id): mensaje + documentos → outbox | Outbox `error`; no corta |
| 16 | Webhook genérico (si hay URL): `POST {formId, timestamp, fields}`, timeout 5 s | **Solo log, no deja outbox** |
| 17 | Auto-respuesta (si está activa, hay email del visitante y el sender no fue salteado) → outbox | Solo log; no corta |
| 18 | Respuesta: `302` al `redirectUrl` o `200 {success:true}` | — |

## Las tres consecuencias que más confunden a soporte

1. **Si el email principal falla, el envío se pierde**: el flujo responde 500 en el paso 11 y nunca llega al paso 12. En el panel se ve una entrada de salida en rojo sin envío asociado [evidencia: verificado a c73bdc5 — server.js:1039 retorna antes de server.js:1043].
2. **Si el sender está inactivo o no hay ninguno, el envío sí se guarda**: el paso 11 se saltea (outbox `skipped` o nada) y el flujo sigue normal.
3. **El webhook genérico es invisible en la UI**: no genera entrada de outbox ni cuenta como notificación; solo aparece en los logs del servidor.

## Qué mirar en los logs (JSON en stdout)

- `Honeypot triggered` — bot descartado.
- `Origin rejected` — dominio no permitido.
- `Captcha verification failed` / `No captcha token provided`.
- `Email sent` — incluye `provider`, `statusCode`, `messageId`, `accepted`, `rejected`, `response`.
- `Error sending email` — `provider`, `statusCode`, `error`.
- `Sender disabled, skipping email` / `No sender configured, skipping email`.
- `Discord webhook failed`, `Telegram notification failed`, `Webhook failed`, `Auto-reply failed`.
- `Error saving submission`, `Error persisting attachments`.

[evidencia: server.js:34-43 (logger), server.js:805-1316]

## Estados posibles de una entrada de outbox

`ok` (aceptado por el proveedor), `error` (rechazado, con `error`) y `skipped` (sender desactivado). Para email se guardan además `provider`, `providerStatus`, `messageId` y `response`; en SendGrid `202` significa aceptado para entrega, no entregado [evidencia: server.js:954-1040, server.js:514-517].

## Notas de trazabilidad

- Handler completo: [evidencia: server.js:788-1329]
- Manejo de errores de subida: [evidencia: server.js:1332-1346]
- Selección de sender: [evidencia: server.js:600-628]
- Emisión SSE: [evidencia: server.js:235-244, server.js:1071-1084]
