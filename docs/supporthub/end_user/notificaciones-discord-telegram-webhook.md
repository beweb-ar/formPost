---
supporthub:
  source_of_truth: false
  audience: end_user
  priority: normal
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
  tags: [notificaciones, discord, telegram, webhook, avisos]
---

# Recibir avisos por Discord, Telegram o en tu propio sistema

## Qué vas a lograr

Que además del email te llegue un aviso al canal donde estás trabajando, o que cada envío dispare una llamada a tu sistema.

Todo se configura por formulario: **Editar** en la tarjeta del formulario.

## Cómo recibir los mensajes en un canal de Discord

1. En Discord: configuración del canal → **Integraciones > Webhooks > Nuevo webhook** y copiá la URL.
2. En formPost: **Editar** el formulario → campo **Discord Webhook URL** → pegá la URL.
3. **Guardar Cambios**.

Cada envío llega como una tarjeta con hasta 10 campos y, si hubo archivos, los adjuntos van incluidos [evidencia: server.js:1104-1136].

Para desactivarlo, borrá la URL y guardá.

## Cómo recibir los mensajes en Telegram

1. En Telegram, creá un bot con [@BotFather](https://t.me/BotFather) y copiá el **token**.
2. **Mandale un mensaje al bot** desde el chat o grupo donde querés recibir los avisos (si es un grupo, agregá el bot primero). Sin ese mensaje previo, Telegram no expone el chat.
3. En formPost: **Editar** el formulario → pegá el token en **Telegram Bot Token**.
4. Tocá **Obtener** al lado de **Telegram Chat ID**: aparece un desplegable con los chats disponibles. Elegí el tuyo y el ID se completa solo.
5. **Guardar Cambios**.

Hacen falta **las dos cosas** (token y chat ID) para que se envíen las notificaciones [evidencia: server.js:1176]. Los adjuntos se mandan como documentos, uno por uno [evidencia: server.js:1194-1203].

Si más adelante volvés a entrar, el token aparece enmascarado como `••••`: dejalo así para conservarlo. El botón **Obtener** funciona igual, porque usa el token guardado [evidencia: admin/index.html:3215-3217, server.js:1832-1837].

## Cómo conectar los envíos con mi sistema, Zapier, n8n o Slack (webhook genérico)

1. **Editar** el formulario → campo **Webhook URL** → pegá la URL que recibe los datos.
2. **Guardar Cambios**.

En cada envío, formPost hace un `POST` con este JSON [evidencia: server.js:1240-1258]:

```json
{
  "formId": "contacto-home",
  "timestamp": "2026-07-28T14:03:11.000Z",
  "fields": { "name": "Ana", "email": "ana@ejemplo.com", "message": "Hola" }
}
```

Detalles a tener en cuenta:

- El tiempo de espera es de 5 segundos: si tu sistema tarda más, el aviso se pierde (el envío igual se guarda y el email igual sale).
- Los archivos adjuntos **no** viajan en este webhook: van por email, Discord y Telegram [evidencia: verificado a c73bdc5 — server.js:1240-1258 solo envía `fields`].
- A diferencia de Discord y Telegram, el webhook genérico **no deja registro en la Bandeja de Salida**: si falla, queda solo en los logs del servidor [evidencia: verificado a c73bdc5 — server.js:1255-1257].

## Cómo saber si el aviso se envió

Mirá la **Bandeja de Salida**: cada notificación de Discord y Telegram aparece con su etiqueta y su estado ✓/✗, y el motivo del error si falló. Ver [Bandejas de entrada y salida](bandejas-entrada-y-salida.md).

## ¿Las notificaciones reemplazan al email?

No. Son adicionales y se disparan por separado: si el email falla, el envío no se guarda, pero si el email sale bien y una notificación falla, el envío queda igual y solo se registra el error de esa notificación [evidencia: server.js:1157-1172, server.js:1222-1236].

## Errores frecuentes

- **"No se encontraron chats. Enviá un mensaje al bot primero e intentá de nuevo."** → Telegram todavía no tiene actualizaciones para ese bot: escribile un mensaje desde el chat destino y volvé a tocar **Obtener**.
- **"Enter a Bot Token first"** → tocaste **Obtener** con el campo del token vacío.
- **Error de Telegram al obtener chats** (texto que devuelve Telegram, por ejemplo `Unauthorized`) → el token está mal copiado o fue revocado.
- **En la Bandeja de Salida, Discord con ✗** → la URL del webhook fue borrada en Discord o es inválida: generá una nueva y actualizá el campo.
- **En la Bandeja de Salida, Telegram con ✗ "Stored Telegram bot token cannot be decrypted"** → la clave de cifrado del servidor cambió; volvé a pegar el token y guardá [evidencia: server.js:1180].
- **El webhook genérico no llega y no veo nada en la Bandeja de Salida** → es el comportamiento esperado: ese canal no se registra ahí. Probá la URL con otra herramienta y revisá que responda en menos de 5 segundos.

## Notas de trazabilidad (para revisión, no para el usuario)

- Campos de notificaciones en los modales: [evidencia: admin/index.html:1004-1028, admin/index.html:1127-1151]
- Envío a Discord con adjuntos: [evidencia: server.js:1104-1173]
- Envío a Telegram y documentos: [evidencia: server.js:1176-1237]
- Webhook genérico, payload y timeout: [evidencia: server.js:1240-1258]
- Descubrimiento de chats de Telegram: [evidencia: server.js:1830-1859, admin/index.html:3209-3248]
- Contadores de notificaciones: [evidencia: server.js:1152-1156, server.js:1217-1221]
