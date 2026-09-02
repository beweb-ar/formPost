---
supporthub:
  source_of_truth: false
  audience: internal_support
  priority: high
  source_type: generated
  generated_by: "Claude Opus 5 (claude-opus-5[1m])"
  generation_prompt: "kb-generation@v2.1"
  source_commit: "c73bdc5d2a8af4a127ee1d54200dce3ecbd806e8"
  derived_from:
    - admin/index.html
    - server.js
    - package.json
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [inventario, cobertura, ui]
---

# Inventario de superficie de UI — formPost

Checklist de cobertura de la KB. Todo lo que un usuario puede ver o tocar en la app tal como está implementada.

> **Base**: commit `c73bdc5` (v1.5.0) **más** los cambios de ingreso de la v1.6.0 (Google / código de un solo uso / email como identificador), que al momento de generar esta KB estaban en el árbol de trabajo sin commitear. Las filas y mensajes marcados como v1.6.0 corresponden a esos cambios.

## Estructura del repo (paso 1 del inventario)

formPost **no** es un monorepo con apps/paquetes: es un servidor Express de un solo archivo más un panel de una sola página.

| Pieza | Archivo | Qué es |
|---|---|---|
| Servidor + toda la lógica | `server.js` (3421 líneas) | Express: endpoint público de envío, router admin, router de API para agentes |
| Panel de administración | `admin/index.html` (4315 líneas) | HTML + CSS + JS inline, sin build ni framework. Incluye el diccionario i18n (EN/ES) |
| Plantillas de email | `templates/*.html`, `email-template.html` | Plantillas por defecto |
| Configuración | `config.json` | Formularios, senders, cuentas, usuarios, estadísticas, claves |

Tres "routers" = tres superficies:

1. **Público**: `POST /submit`, `GET /health`, `/admin` (sirve el panel), `/logo.png`, `/fav-icon.png`, `/logo_beweb.png` [evidencia: server.js:788, server.js:1349, server.js:1483]
2. **Ingreso** `/admin/api/auth/*` — público, sin auth: contraseña, código de un solo uso y Google (v1.6.0) [evidencia: server.js:3040-3170]
3. **Admin API** `/admin/api/*` — auth por token de sesión (`Bearer`) o HTTP Basic + roles [evidencia: server.js:1504-2763]
4. **API para agentes** `/api/v1/*` — auth por API key [evidencia: server.js:2765-3421]

## Pantallas del panel (`/admin`)

El panel es una sola ruta: no hay router de URLs, todo es un overlay/modal dentro de `/admin`. La columna "Ruta" indica cómo se llega.

| # | Pantalla / superficie | Ruta (cómo se llega) | Qué permite hacer | Atajos | Archivos fuente |
|---|---|---|---|---|---|
| 1 | Ingreso — botón *Acceder con Google* | `/admin` (overlay inicial) | Ingresar con la cuenta de Google cuyo email esté cargado en un usuario | ninguno | admin/index.html (`googleSignInHolder`, `onGoogleCredential`), server.js:3153-3169 |
| 1b | Ingreso — email + contraseña | `/admin` | Ingresar con email (o el usuario histórico) y contraseña | ninguno | admin/index.html (`loginForm`), server.js:3081-3098 |
| 1c | Ingreso — código de un solo uso (paso 1) | link *Ingresar con un código de un solo uso* | Pedir un código de 6 dígitos por email | ninguno | admin/index.html (`otpRequestForm`), server.js:3100-3125 |
| 1d | Ingreso — código de un solo uso (paso 2) | tras pedir el código | Escribir el código y entrar | ninguno | admin/index.html (`otpVerifyForm`), server.js:3127-3151 |
| 2 | Encabezado | siempre visible tras login | Badge de usuario+rol+cuenta, Configuración, Plantillas, ES/EN, Ayuda, Cambiar contraseña, Salir | ninguno | admin/index.html:816-829 |
| 3 | Tarjeta "Servidor" | dashboard | Estado, puerto, uptime, memoria | ninguno | admin/index.html:833-836, server.js:1509 |
| 4 | Tarjeta "Datos" | dashboard | Formularios, total envíos, total mails, total notificaciones | ninguno | admin/index.html:837-840 |
| 5 | Gráfico "Envíos" | dashboard | Serie diaria de envíos/mails/notificaciones; selector Hoy/Semana/Mes/Año | ninguno | admin/index.html:841-852, server.js:1884 |
| 6 | Bandeja de entrada (Inbox) | dashboard | Envíos en vivo (SSE), colapsable, badge de no leídos, estado de conexión, link **Ver todo**; cada fila abre el envío completo | ninguno | admin/index.html:858-873, admin/index.html:2036 |
| 7 | Bandeja de salida (Outbox) | dashboard | Mails/notificaciones en vivo, colapsable, badge, link **Ver todo**; cada fila abre el detalle de la entrega | ninguno | admin/index.html:876-890 |
| 7a | Modal: Todos los envíos | *Ver todo* del Inbox | Bandeja de entrada completa de todos los formularios, paginada, con buscador | ninguno | admin/index.html (inboxAllModal) |
| 7b | Modal: Bandeja de salida completa | *Ver todo* del Outbox | Todas las entregas, paginadas, filtro por estado y resumen ok/error/skipped | ninguno | admin/index.html (outboxAllModal) |
| 7c | Modal: Detalle del envío (salida) | click en una fila de cualquier bandeja de salida | Estado, destino, asunto, sender usado y previsto, provider, message-id, respuesta y error | ninguno | admin/index.html (outboxEntryModal) |
| 8 | Filtro por cuenta | dashboard, **arriba de las bandejas** (solo superadmin con más de 1 cuenta) | Acota a esa cuenta las tarjetas, ambas bandejas en vivo y las vistas completas | ninguno | admin/index.html (accountFilterBar) |
| 9 | Tarjetas de formularios | dashboard | Ver stats por formulario, **etiqueta del sender efectivo** (o *SIN SENDER*), **indicador rojo `!` si le falta configuración**, desplegar detalle, abrir Envíos, Editar, Clonar, Eliminar | ninguno | admin/index.html:900-902, admin/index.html:2471 |
| 10 | Tarjeta "+ Agregar Formulario" | dashboard (admin y superadmin) | Abrir el modal de creación | ninguno | admin/index.html:2549-2554 |
| 11 | Modal: Editar Formulario | botón *Editar* de una tarjeta | Destinatarios, asunto, redirect, plantilla, sender, alias, captcha, auto-respuesta, dominios, Discord, Telegram, webhook, cuenta (superadmin) y código de integración | ninguno | admin/index.html:914-1041, admin/index.html:2828 |
| 12 | Modal: Agregar/Clonar Formulario | tarjeta "+" o botón *Clonar* | Crear un formulario nuevo o copiar uno existente | ninguno | admin/index.html:1055-1158, admin/index.html:2712 |
| 13 | Modal: Envíos | botón *Envíos* de una tarjeta o click en la bandeja de entrada | Buscar por nombre/email, paginar, abrir detalle, exportar CSV/JSON, eliminar uno o todos | ninguno | admin/index.html:1161-1179, admin/index.html:4003 |
| 14 | Modal: Detalle del Envío | click en una fila de Envíos | Ver todos los campos, descargar adjuntos, ver ID/IP y método de envío | ninguno | admin/index.html:1044-1052, admin/index.html:4113 |
| 15 | Modal: Bandeja de Salida (log) | click en una entrada del Outbox | Historial paginado de mails/notificaciones con estado, error, **sender que entregó** (naranja si fue el respaldo) y datos del proveedor; borrar entradas | ninguno | admin/index.html:1203-1216, admin/index.html:2171 |
| 16 | Modal: Configuración (4 pestañas) | botón *Configuración* (admin y superadmin) | Pestañas Senders / Cuentas / Usuarios / API para Agentes + Backup y Restaurar | ninguno | admin/index.html:1219-1286, admin/index.html:3305 |
| 16a | Pestaña Senders | Configuración | Listar, crear, editar y eliminar remitentes. Columnas *Forms* (formularios que envían por él) y *Respaldo*, más el estado de salud (etiqueta **CAÍDO** / **RECUPERANDO** con botón *Reintentar ahora*) | ninguno | admin/index.html:1229-1237, admin/index.html:3620 |
| 16b | Pestaña Cuentas | Configuración (solo superadmin) | Crear/renombrar/eliminar cuentas, copiar y regenerar su API key, habilitarla | ninguno | admin/index.html:1240-1246, admin/index.html:3664 |
| 16c | Pestaña Usuarios | Configuración (solo superadmin) | Crear, editar y eliminar usuarios con rol y cuenta | ninguno | admin/index.html:1249-1255, admin/index.html:3803 |
| 16d | Pestaña API para Agentes | Configuración | Ver/copiar/regenerar la API key, habilitarla, copiar el prompt de integración | ninguno | admin/index.html:1257-1275, admin/index.html:3563 |
| 17 | Backup / Restaurar | pie del modal Configuración (solo superadmin) | Descargar backup JSON, restaurar desde archivo | ninguno | admin/index.html:1277-1283, admin/index.html:3929 |
| 18 | Modal: Editor de Sender | *+ Nuevo Sender* o *Editar* en la lista | SMTP o SendGrid, activo/inactivo, cuenta o Global, **sender de respaldo**, botón *Test*. La casilla *Conexión Segura* se ajusta sola según el puerto | ninguno | admin/index.html:1411-1500, admin/index.html:3730 |
| 19 | Modal: Nueva Cuenta | *+ Nueva Cuenta* | ID y nombre de la cuenta | ninguno | admin/index.html:1329-1347 |
| 20 | Modal: Editor de Usuario | *+ Nuevo Usuario* o *Editar* | Usuario, **email** (identificador para Google/código), contraseña, rol, cuenta, nombre visible | ninguno | admin/index.html:1289-1326, admin/index.html:3842 |
| 21 | Modal: Plantillas de Email | botón *Plantillas* del encabezado | Listar plantillas propias y compartidas, editar, eliminar, crear | ninguno | admin/index.html:1463-1476, admin/index.html:3003 |
| 22 | Modal: Editor de Plantilla | *Editar* o *+ Nueva Plantilla* | Editar HTML con vista previa en vivo, copiar desde otra plantilla | ninguno | admin/index.html:1427-1460, admin/index.html:3049 |
| 23 | Modal: Cambiar Contraseña | botón candado del encabezado | Cambiar la propia contraseña (mínimo 8 caracteres) | ninguno | admin/index.html:1182-1200, admin/index.html:4260 |
| 24 | Modal: Guía de Integración (ayuda in-app) | botón "?" del encabezado | Documentación embebida: cómo integrar, ejemplo HTML copiable, restricciones, integración con agentes de IA, cuentas y roles | ninguno | admin/index.html:1479-1487, admin/index.html:2567-2654 |
| 25 | Toasts | cualquier acción | Confirmaciones y errores (desaparecen a los ~4 s) | ninguno | admin/index.html:1831 |

**Descartadas del alcance end_user**: ninguna pantalla. Todas están cubiertas (ver INDEX.md).

## Atajos de teclado

**No hay ninguno.** No existe un solo handler de `keydown`/`keyup` ni binding de `Escape`, `Ctrl+*` o `Meta+*` en todo el panel [evidencia: verificado a c73bdc5 — `grep -n "keydown\|keyup\|Escape\|ctrlKey\|metaKey" admin/index.html` no devuelve resultados].

Lo único parecido a un atajo: **hacer click fuera de un modal lo cierra** (click en el fondo oscuro) [evidencia: admin/index.html:4304-4308]. La tecla `Esc` **no** cierra los modales.

## Ayuda in-app detectada (promovida a la KB)

| Fuente | Contenido | Doc que la absorbe |
|---|---|---|
| Modal Guía de Integración | 6 pasos de integración, ejemplo HTML completo, 5 restricciones, guía de agentes de IA, explicación de cuentas y roles | `end_user/poner-el-formulario-en-tu-sitio.md`, `end_user/integrar-con-agente-de-ia.md`, `client_admin/usuarios-y-roles.md` |
| Sección *Integración* del modal de edición | Código HTML generado para ese formulario (con captcha del proveedor configurado) | `end_user/poner-el-formulario-en-tu-sitio.md` |
| Botón *Copiar prompt de integración* | Párrafo de instrucciones para un agente de IA (variantes clave maestra / clave de cuenta) | `end_user/integrar-con-agente-de-ia.md` |
| Hints bajo los campos (`allowedDomainsHint`, `discordWebhookHint`, `telegramHint`, `webhookHint`, `autoReplyReplyToHint`, `formAccountHint`, `globalSenderHint`, `passwordKeepHint`) | Explicaciones cortas de cada campo | `end_user/editar-formulario.md` y afines |
| Especificación auto-documentada `GET /api/v1` | Descripción de cada endpoint y campo | `technical/api-agentes-v1.md` |

## Mensajes de error y confirmación relevados

### A. Los que ve el visitante del sitio web (respuesta de `POST /submit`)

Idioma según la variable `LANG` del servidor (por defecto `es`) [evidencia: server.js:142-229].

| Mensaje (ES) | Código | Causa |
|---|---|---|
| `ID de formulario no válido.` | 400 | Falta `form_id`, tiene caracteres raros, o el formulario no existe [evidencia: server.js:810-816] |
| `Too many submissions. Please try again later.` | 429 | Más de 5 envíos por minuto desde la misma IP [evidencia: server.js:376-382] |
| `Too many submissions for this form. Please try again later.` | 429 | Más de 100 envíos por minuto en ese formulario (todas las IP) [evidencia: server.js:386, server.js:820] |
| `No se permiten envíos desde este dominio.` | 403 | El origen no está en Dominios Permitidos [evidencia: server.js:824-836] |
| `Demasiados campos en el formulario.` | 400 | Más de 30 campos [evidencia: server.js:840] |
| `Nombre de campo no válido.` | 400 | Nombre de campo de más de 100 caracteres [evidencia: server.js:842] |
| `El campo "X" es demasiado largo.` | 400 | Valor de más de 5000 caracteres [evidencia: server.js:844] |
| `Dirección de email no válida.` | 400 | El campo email/correo/e_mail no es un email válido [evidencia: server.js:848] |
| `Por favor complete la verificación de seguridad.` | 400 | Captcha activo y no llegó el token [evidencia: server.js:860] |
| `Verificación de seguridad fallida. Intente nuevamente.` | 400 | El proveedor de captcha rechazó el token [evidencia: server.js:887] |
| `Error de verificación de seguridad. Intente más tarde.` | 500 | No se pudo contactar al proveedor de captcha [evidencia: server.js:891] |
| `Envío de formulario no válido.` | 400 | Captcha activo sin clave secreta guardada [evidencia: server.js:866] |
| `Error de configuración de template.` | 500 | `templatePath` apunta fuera del directorio de la app [evidencia: server.js:905] |
| `Ocurrió un error en el servidor.` | 500 | Falló el envío del email [evidencia: server.js:1039] |
| `Error de template en el servidor.` | 500 | Excepción al armar el email [evidencia: server.js:1327] |
| `File too large (max 10 MB).` | 400 | Adjunto de más de 10 MB [evidencia: server.js:1338] |
| `Too many files (max 5).` | 400 | Más de 5 adjuntos [evidencia: server.js:1339] |
| `File type not allowed.` | 400 | Extensión bloqueada (exe, bat, cmd, sh, ps1, msi, dll, com, scr, pif, vbs, js, jar, cpl, inf, reg) [evidencia: server.js:24, server.js:1343] |
| `File upload error.` | 400 | Otro error de subida [evidencia: server.js:1340] |
| `Formulario enviado correctamente.` | 200 | Éxito (o honeypot disparado: respuesta falsa de éxito) [evidencia: server.js:806, server.js:1323] |

### B. Los que ve quien usa el panel (toasts, confirmaciones y errores de API)

| Mensaje (ES) | Dónde | Origen |
|---|---|---|
| `Credenciales inválidas. Intente nuevamente.` | Login | admin/index.html:1649 |
| `Error de conexión. Intente nuevamente.` / `Error de conexión` | Login / toasts | admin/index.html:1650, admin/index.html:1710 |
| `Too many login attempts. Please try again later.` | Login | server.js:407-414 (20 intentos fallidos / 7 min) |
| `Formulario agregado correctamente` / `Formulario actualizado correctamente` / `Formulario eliminado` | Toast | admin/index.html:1700-1701 |
| `El ID del formulario ya existe` | Toast al crear | server.js:1575 |
| `ID de formulario no válido` | Toast al crear | server.js:1572 |
| `Formulario no encontrado` | Toast | server.js:1613 |
| `Falta id o configuración` | Toast al crear | server.js:1569 |
| `Unknown account: X` | Toast (superadmin) | server.js:1580, server.js:1620 |
| `senderId belongs to another account` | Toast | server.js:1587, server.js:1626 |
| `templatePath outside your account templates` | Toast | server.js:1591, server.js:1630 |
| `¿Seguro que desea eliminar "{id}"? Esta acción no se puede deshacer.` | Confirm | admin/index.html:1712 |
| `¿Eliminar TODOS los envíos de "{id}"? Esta acción no se puede deshacer.` | Confirm | admin/index.html:1714 |
| `¿Eliminar este registro? Esta acción no se puede deshacer.` | Confirm (envío / salida) | admin/index.html:1715 |
| `Todos los envíos eliminados` / `Envío eliminado` / `Error al eliminar envíos` | Toast | admin/index.html:1706-1707 |
| `Registro de salida eliminado` / `Error al eliminar registro de salida` | Toast | admin/index.html:1708 |
| `Exportación descargada` / `Error en la exportación` | Toast | admin/index.html:1705 |
| `La API Key de SendGrid es requerida` | Toast editor de sender | admin/index.html:1763 |
| `Host y puerto son requeridos para senders SMTP` | Toast editor de sender | admin/index.html:1763 |
| `Connection failed: <detalle>` | Toast del botón Test | server.js:1805 |
| `Test email sent to X — <detalle del proveedor>` | Toast del botón Test | server.js:1802 |
| `SendGrid: invalid API key (401)…` | Toast del botón Test | server.js:489 |
| `SendGrid: stored API key cannot be decrypted…` | Toast del botón Test | server.js:470 |
| `Sender ID already exists` / `Sender not found` / `Sender removed` | Toast | server.js:1715, server.js:1742, server.js:1775 |
| `Delete sender "X"? This cannot be undone.` | Confirm | admin/index.html:3509 |
| `No se encontraron chats. Enviá un mensaje al bot primero e intentá de nuevo.` | Toast Telegram | admin/index.html:1674 |
| `Enter a Bot Token first` | Toast Telegram | admin/index.html:3211 |
| `Plantilla guardada correctamente` / `Guardada como copia para tu cuenta` / `Plantilla eliminada` | Toast plantillas | admin/index.html:1757-1758, admin/index.html:1793 |
| `¿Eliminar plantilla "{name}"? Esta acción no se puede deshacer.` | Confirm | admin/index.html:1758 |
| `Invalid template name` / `Content is required` / `Template not found` / `Failed to save template` | Toast plantillas | server.js:2197-2246 |
| `La contraseña debe tener al menos 8 caracteres` | Toast | admin/index.html:1692 |
| `La contraseña actual es incorrecta` | Toast | server.js:222 |
| `Contraseña actualizada. Ingrese nuevamente.` | Toast | admin/index.html:1693 |
| `API key copiada al portapapeles` / `Prompt de integración copiado al portapapeles` | Toast | admin/index.html:1769, admin/index.html:1776 |
| `¿Regenerar la API key? La clave actual dejará de funcionar inmediatamente.` | Confirm | admin/index.html:1770 |
| `API key regenerada` / `API para agentes habilitada` / `API para agentes deshabilitada` | Toast | admin/index.html:1771-1772 |
| `Cuenta creada` / `Cuenta actualizada` / `Cuenta eliminada` | Toast | admin/index.html:1782 |
| `¿Eliminar la cuenta "{id}"? Sus usuarios también se eliminarán…` | Confirm | admin/index.html:1783 |
| `La cuenta todavía tiene formularios o senders. Eliminálos o reasignalos primero.` | Tooltip del botón deshabilitado / error | admin/index.html:1784, server.js:2610 |
| `Account already exists` / `Invalid account ID` / `Account not found` | Toast | server.js:2570-2590 |
| `Usuario creado` / `Usuario actualizado` / `Usuario eliminado` | Toast | admin/index.html:1787 |
| `¿Eliminar el usuario "{id}"? Esta acción no se puede deshacer.` | Confirm | admin/index.html:1788 |
| `Invalid username` / `User already exists` / `Invalid role` | Toast | server.js:2674-2683 |
| `A valid accountId is required for admin/user roles` | Toast | server.js:2686, server.js:2721 |
| `Cannot demote the last superadmin` / `Cannot delete the last superadmin` / `Cannot delete your own user` | Toast | server.js:2716, server.js:2748-2751 |
| `Restore backup? This will overwrite current configuration.` | Confirm | admin/index.html:3948 |
| `Invalid backup file` / `Restore failed: …` / `Backup restored successfully` | Toast | admin/index.html:3966, server.js:2445-2490 |
| `Backup downloaded` | Toast | admin/index.html:3939 |
| `Acceso denegado` (403) | Respuesta de API sin permisos | server.js:202, server.js:1406 |
| `Too many requests. Please try again later.` | Panel (más de 120 req/min) | server.js:398-404 |
| `Too many connections` | Bandejas en vivo (más de 20 sesiones SSE) | server.js:2377 |

### B-bis. Mensajes de la pantalla de ingreso (v1.6.0)

| Mensaje (ES) | Causa | Origen |
|---|---|---|
| `Credenciales inválidas.` | Email/usuario o contraseña incorrectos | server.js (`loginInvalid`), 3081-3098 |
| `No existe un usuario con ese email. Pedile a tu administrador que lo cree — no hay auto-registro.` | Google validó el email pero no hay usuario con ese email | server.js:3161-3166 |
| `Tu email de Google no está verificado.` | `email_verified` falso en el token | server.js:1588-1591 |
| `No se pudo validar el ingreso con Google.` | Token inválido o `aud`/`azp` ajeno | server.js:1575-1586 |
| `El ingreso con Google no está habilitado en este servidor.` | Sin client id configurado | server.js:1569 |
| `Código inválido.` / `El código expiró — pedí uno nuevo.` / `Demasiados intentos con este código — pedí uno nuevo.` | Validación del código de un solo uso | server.js:3127-3151 |
| `Pediste demasiados códigos. Probá de nuevo más tarde.` | Más de 5 pedidos por hora para ese email | server.js:1509, 3110 |
| `No se puede enviar el código: no hay ningún sender de email configurado.` | Sin sender activo para enviar el código | server.js:3115-3118 |
| `No pudimos enviar el código por email. Probá de nuevo en unos minutos.` | El sender falló al enviar | server.js:3119-3121 |
| `Tu sesión expiró. Ingresá de nuevo.` | Token vencido (12 h) o usuario eliminado | server.js:1602-1604 |
| `Too many login attempts. Please try again later.` | 20 intentos fallidos / 15 min por IP | server.js:3050-3058 |

### C. Mensajes de la API para agentes (`/api/v1`)

Se documentan en `technical/api-agentes-v1.md`; los más útiles para soporte: `Missing API key…`, `Invalid API key.`, `Agent API is disabled. Enable it from the admin UI.`, `Your API key is scoped to account "X" and cannot create accounts…`, `Account "X" already exists…`, `Form "X" already exists…` [evidencia: server.js:2785-2806, server.js:3087-3118, server.js:3139].

## Cosas que existen en el código pero NO tienen entrada en la UI

Registradas para que soporte no prometa lo que no se puede hacer desde el panel:

- **Reiniciar estadísticas de un formulario**: la función `resetStatistics()` existe en el JS y el endpoint `PUT /admin/api/statistics/:id/reset` funciona, pero **ningún botón del panel la invoca** [evidencia: verificado a c73bdc5 — `resetStatistics` aparece solo en su definición, admin/index.html:3972].
- **Tema oscuro / claro**: hay claves i18n `darkMode`/`lightMode`, pero **no hay botón, ni atributo `data-theme`, ni media query `prefers-color-scheme`** en el panel [evidencia: verificado a c73bdc5]. El README lo menciona como característica; la UI de este commit no lo implementa.
- **Endpoints legacy `/admin/api/smtp`** (GET/PUT): siguen existiendo por compatibilidad, sin UI que los use [evidencia: server.js:1862-1881].
