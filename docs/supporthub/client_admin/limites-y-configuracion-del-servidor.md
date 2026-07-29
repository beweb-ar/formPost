---
supporthub:
  source_of_truth: false
  audience: client_admin
  priority: normal
  source_type: generated
  generated_by: "Claude Opus 5 (claude-opus-5[1m])"
  generation_prompt: "kb-generation@v2.1"
  source_commit: "c73bdc5d2a8af4a127ee1d54200dce3ecbd806e8"
  derived_from:
    - server.js
    - README.md
    - docker-compose.yml
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [limites, rate-limit, variables-de-entorno, retencion, configuracion]
---

# Límites, retención y variables de entorno

## Qué vas a lograr

Saber qué límites aplica formPost sin que nadie los configure, cuánto tiempo guarda los datos y qué se ajusta con variables de entorno.

## Límites de uso (rate limits)

| Qué | Límite | Mensaje al superarlo |
|---|---|---|
| Envíos por IP | 5 por minuto | `Too many submissions. Please try again later.` |
| Envíos por formulario (todas las IP) | 100 por minuto | `Too many submissions for this form. Please try again later.` |
| API del panel (`/admin/api`) | 120 pedidos por minuto | `Too many requests. Please try again later.` |
| Intentos de login fallidos (HTTP Basic) | 20 cada 7 minutos | `Too many login attempts. Please try again later.` |
| Intentos de ingreso (email/código/Google) | 20 fallidos cada 15 minutos | `Too many login attempts. Please try again later.` |
| Pedidos de código de un solo uso | 10 por IP cada 15 min; 5 por email por hora | `Too many codes requested…` / `Pediste demasiados códigos.` |
| API para agentes (`/api/v1`) | 240 pedidos por minuto | `Too many API requests. Please try again later.` |
| Sesiones de bandeja en vivo (SSE) | 20 simultáneas | `Too many connections` |

[evidencia: server.js:376-414, server.js:2770-2776, server.js:3050-3068, server.js:2351]

## Límites por envío

- 30 campos como máximo; nombre de campo hasta 100 caracteres; valor hasta 5.000.
- Cuerpo del pedido: 100 KB (sin contar adjuntos).
- Adjuntos: 5 archivos, 10 MB cada uno; extensiones ejecutables bloqueadas.

[evidencia: server.js:17-30, server.js:417-418, server.js:840-845]

## Cuánto se guarda (retención)

| Dato | Retención |
|---|---|
| Envíos | Últimos **1.000 por formulario** (los más viejos se descartan con sus adjuntos) |
| Bandeja de salida | Últimas **500 entradas por formulario** |
| Adjuntos | Mientras exista su envío (se borran con él) |
| Códigos de un solo uso | 10 minutos, en memoria (se pierden si el servidor reinicia) |
| Sesiones del panel | 12 horas |

[evidencia: server.js:669-678, server.js:765, server.js:718-724, server.js:1443, server.js:1507]

## Variables de entorno

| Variable | Para qué |
|---|---|
| `PORT` | Puerto del servidor (default 3000) |
| `LANG` | Idioma de los mensajes del servidor: `es` (default) o `en` |
| `DEBUG` | `true` activa logs extra y **saltea la verificación de captcha** — nunca en producción |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Crea/actualiza un superadmin al arrancar |
| `API_KEY` | Fija la clave maestra de la API para agentes |
| `GOOGLE_CLIENT_ID` | Client id de Google para el botón "Acceder con Google" |
| `SUPPORTHUB_TOOLS_SECRET` | Secret que firma los tokens de las herramientas del agente de ayuda (`/agent-api`). Sin definir, esos endpoints no responden |
| `SUPPORTHUB_URL` | URL de la plataforma de soporte. Definida, el panel muestra el botón flotante de ayuda a los usuarios logueados |
| `USER_EMAILS` | Semilla del email de usuarios existentes: `usuario1=mail1@dom,usuario2=mail2@dom` (solo si el usuario no tiene email) |
| `ENCRYPTION_KEY` | Clave de cifrado de secretos (64 caracteres hexadecimales) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS` | Pisan la configuración del sender por defecto |

[evidencia: server.js:140-142, server.js:246-272, server.js:376-395, server.js:384-399, server.js:51-65]

## Dónde viven los datos

- `config.json` — toda la configuración (formularios, senders, cuentas, usuarios, estadísticas, claves).
- `config.backup.json` — copia del estado anterior a la última escritura.
- `data/submissions-<formId>.json` — envíos.
- `data/outbox-<formId>.json` — bandeja de salida.
- `data/attachments/<formId>/<submissionId>/` — adjuntos.
- `data/.secret.key` — clave de cifrado autogenerada (**respaldala**: sin ella no se pueden descifrar contraseñas ni API keys guardadas).
- `templates/` — plantillas compartidas; `templates/<cuenta>/` — plantillas por cuenta.

[evidencia: server.js:50, server.js:114-127, server.js:647-767, server.js:2105-2113]

## Qué revisar si el servidor se queda sin espacio

Los envíos y adjuntos crecen con el uso. Puntos de control: cantidad de formularios activos × 1.000 envíos, y el tamaño de `data/attachments/`. Se libera espacio borrando envíos desde el panel (borra también sus adjuntos) o reduciendo el uso de adjuntos en los formularios [inferencia a partir de la política de retención — evidencia: server.js:669-678, server.js:2005-2018].

## Notas de trazabilidad

- Limitadores: [evidencia: server.js:376-414, server.js:2770-2776, server.js:3050-3068]
- Límites de tamaño y de campos: [evidencia: server.js:17-30, server.js:417-418, server.js:838-845]
- Retenciones: [evidencia: server.js:669-678, server.js:765]
- Variables de entorno: [evidencia: server.js:140-142, server.js:246-272, server.js:384-399]
- Rutas de datos: [evidencia: server.js:50, server.js:647-724, server.js:2105]
