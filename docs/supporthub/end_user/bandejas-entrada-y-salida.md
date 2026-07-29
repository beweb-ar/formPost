---
supporthub:
  source_of_truth: false
  audience: end_user
  priority: high
  source_type: generated
  generated_by: "Claude Opus 5 (claude-opus-5[1m])"
  generation_prompt: "kb-generation@v2.1"
  source_commit: "c73bdc5d2a8af4a127ee1d54200dce3ecbd806e8"
  derived_from:
    - admin/index.html
    - server.js
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [inbox, outbox, tiempo-real, entregas, mails-enviados]
---

# Bandeja de entrada y bandeja de salida (¿llegó? ¿salió el mail?)

## Qué vas a lograr

Ver en vivo lo que va entrando, y confirmar si el email correspondiente realmente salió o falló.

## Cómo ver los mensajes que entran en tiempo real (bandeja de entrada)

El panel **Bandeja de Entrada** está en la pantalla principal y se actualiza solo, sin recargar la página.

- Cada línea muestra fecha y hora, el formulario, una etiqueta **POST** o **JS**, quién envió y un adelanto de los datos.
- Hacé click en una línea para abrir el listado completo de envíos de ese formulario.
- Tocá el título para **plegar o desplegar** el panel; queda así para la próxima vez que entres.
- Con el panel plegado aparece un **contador** de mensajes nuevos; se pone en cero al desplegarlo.
- A la derecha del título ves el estado: **Conectado**, **Reconectando...** o **Desconectado**.

Muestra las últimas **15** entradas de la sesión; al abrir el panel se cargan las 4 más recientes para que no esté vacía [evidencia: admin/index.html:1935, admin/index.html:2025-2034].

## Cómo saber si el email salió (bandeja de salida)

El panel **Bandeja de Salida** muestra, también en vivo, cada email y cada notificación que formPost intenta enviar:

- Una etiqueta de color por canal: **Mail**, **Discord** o **Telegram**.
- Un **✓** verde si salió bien o una **✗** roja si falló, con el motivo del error debajo.

Hacé click en cualquier entrada para abrir el **historial completo** de ese formulario.

## Cómo ver el historial de mails enviados de un formulario

Al hacer click en una entrada de la Bandeja de Salida se abre una tabla paginada (**20 por página**) con: fecha, canal, destinatario, asunto y estado.

Los tres estados posibles:

| Estado | Qué significa |
|---|---|
| **OK** | El servidor de correo (o Discord/Telegram) aceptó el mensaje |
| **Error** | Falló el envío. El motivo aparece debajo, en rojo |
| **Skipped** | No se intentó enviar porque el remitente del formulario está **desactivado** [evidencia: server.js:954-965] |

En los emails, además, se muestra el proveedor y un identificador: por ejemplo `SendGrid 202 · id abc123…`. **202 significa "SendGrid lo aceptó para entregarlo", no "el destinatario lo recibió"**; ese identificador (`message-id`) es lo que permite rastrear el mensaje en el panel de SendGrid [evidencia: server.js:514-517, admin/index.html:2197-2206].

Podés borrar una entrada del historial con la **✕** roja (solo administradores); eso borra el registro, no el email ya enviado.

Se conservan las últimas **500 entradas por formulario** [evidencia: server.js:765].

## Por qué un envío aparece en la entrada pero no llegó el mail

Casos posibles, en orden de frecuencia:

1. **El remitente está desactivado** → la salida figura como *Skipped*. Activalo en Configuración > Senders.
2. **El formulario no tiene ningún remitente disponible** → no se intenta ningún email y no aparece nada en la salida (solo llegan las notificaciones de Discord/Telegram/webhook si están configuradas) [evidencia: server.js:966-968].
3. **Falló el envío** → la salida figura como *Error* con el motivo (credenciales rechazadas, dominio no verificado, etc.). En ese caso el visitante ve `Ocurrió un error en el servidor.` y **el envío no queda guardado** [evidencia: verificado a c73bdc5 — server.js:1017-1040].
4. **Salió bien pero cayó en spam** → figura *OK*; revisá la carpeta de spam del destinatario y la configuración del dominio del remitente.

## Por qué la bandeja dice "Desconectado"

La conexión en vivo se corta si se pierde la red o si el servidor reinicia. El panel reintenta solo cada 5 segundos [evidencia: admin/index.html:2058-2062]. Si queda en *Desconectado* mucho tiempo, recargá la página; si aparece `Too many connections`, es que hay demasiadas sesiones del panel abiertas al mismo tiempo (máximo 20) — cerrá alguna [evidencia: server.js:2351, server.js:2376-2378].

Mientras está desconectada no se pierde nada: los envíos igual se guardan y los vas a ver en **Envíos** al recargar.

## Qué ve cada usuario en las bandejas

Solo lo de tu cuenta. Un superadmin ve el movimiento de todas las cuentas; al cambiar de usuario, las bandejas se limpian para no mezclar sesiones [evidencia: server.js:235-244, admin/index.html:2073-2085].

## Errores frecuentes

- **"Sin envíos recientes. Los nuevos aparecerán aquí en tiempo real."** → todavía no entró nada en esta sesión.
- **"Sin mails ni notificaciones recientes..."** → no hubo salidas todavía para tus formularios.
- **"Too many connections"** → hay más de 20 sesiones del panel abiertas contra el servidor.
- **"Error de conexión"** al abrir el historial → recargá la página.
- **"Error al eliminar registro de salida"** → el registro ya no existe o falló el guardado; recargá.

## Notas de trazabilidad (para revisión, no para el usuario)

- Conexión en vivo por SSE con token temporal y reconexión: [evidencia: admin/index.html:2036-2066, server.js:2354-2392]
- Límite de 15 entradas en pantalla y carga inicial de 4: [evidencia: admin/index.html:1935, admin/index.html:2022-2034]
- Estados ok/error/skipped y datos del proveedor: [evidencia: server.js:954-1040, admin/index.html:2190-2221]
- Retención de 500 entradas de salida: [evidencia: server.js:765]
- Alcance por cuenta del stream: [evidencia: server.js:235-244, server.js:2356]
