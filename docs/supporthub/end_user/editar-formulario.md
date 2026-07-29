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
  tags: [formularios, editar, configuracion, destinatarios, asunto]
---

# Cambiar la configuración de un formulario

## Qué vas a lograr

Modificar a dónde llegan los mensajes, cómo se ve el asunto, qué pasa después de enviar y qué avisos se disparan.

Abrí la ventana con el botón **Editar** de la tarjeta del formulario. Al terminar, **Guardar Cambios** (aviso: `Formulario actualizado correctamente`).

## Cómo cambiar a dónde llegan los mensajes (destinatarios / email destino / agregar otro correo)

En **Email Destino** están las direcciones actuales, una por línea con una **✕** al lado.

- Para **agregar** otra: escribila en el casillero de abajo y tocá **+**.
- Para **sacar** una: tocá la **✕** de esa dirección.
- Guardá con **Guardar Cambios**. Todas las direcciones reciben el mismo email.

## Cómo cambiar el asunto de los mails que recibo (prefijo de asunto)

En **Prefijo de Asunto** escribí el texto fijo, por ejemplo `[Contacto Web]`. El asunto final que te llega es ese prefijo seguido del nombre de quien completó el formulario (o del alias que configures) [evidencia: server.js:970].

## A dónde va el visitante después de enviar (página de gracias / redirección)

En **URL de Redirección** poné la página de agradecimiento, por ejemplo `https://tusitio.com/gracias`.

- **Con** URL: después de enviar, el navegador lleva al visitante ahí.
- **Sin** URL (campo vacío): el servidor contesta un JSON `{"success": true, ...}`. Es lo que corresponde si tu formulario se envía por JavaScript (fetch/AJAX) y vos mostrás tu propio mensaje de gracias [evidencia: server.js:1320-1324].

## Cómo cambiar el diseño del email que recibo (plantilla)

El desplegable **Plantilla** lista las plantillas disponibles para tu cuenta más las compartidas. Para editar su contenido, ver [Plantillas de email](plantillas-de-email.md).

## Cómo cambiar desde qué casilla salen los mails (sender / remitente)

El desplegable **Sender** elige el servidor de salida configurado en **Configuración > Senders**. Ver [Remitentes de email](remitentes-de-email.md).

**Alias del Sender (nombre del remitente)**: el nombre que se ve como remitente en tu bandeja. Si lo dejás vacío, aparece el nombre de la persona que completó el formulario [evidencia: server.js:947-948].

Dato útil: el **Responder a** del email que te llega es la dirección de la persona que completó el formulario, así que podés contestarle directo desde tu cliente de correo [evidencia: server.js:981].

## Cómo activar o desactivar el captcha de un formulario

Tildá o destildá **Activar Verificación Captcha**, elegí el **Proveedor** (Cloudflare Turnstile o hCaptcha) y pegá la **Clave Secreta**. Detalle completo en [Captcha y anti-spam](captcha-y-antispam.md).

Si el formulario ya tenía una clave guardada, el campo aparece vacío con el texto `•••• (configured)`: dejalo así para conservar la clave actual, o escribí una nueva para reemplazarla [evidencia: admin/index.html:2845-2846].

## Cómo mandar un mail automático de "recibimos tu mensaje" (auto-respuesta)

Tildá **Activar auto-respuesta al remitente** y completá asunto, plantilla y Responder a. Ver [Auto-respuesta al visitante](auto-respuesta-al-visitante.md).

## Cómo permitir el formulario solo desde mi sitio (dominios permitidos)

En **Dominios Permitidos** agregá `https://tusitio.com` y tocá **+**. Si la lista está vacía, se acepta desde cualquier sitio. Ver [Captcha y anti-spam](captcha-y-antispam.md).

## Cómo recibir avisos en Discord, Telegram o mi propio sistema (webhook)

Los campos **Discord Webhook URL**, **Telegram Bot Token** + **Telegram Chat ID** y **Webhook URL** están en la misma ventana. Ver [Notificaciones a Discord, Telegram y webhook](notificaciones-discord-telegram-webhook.md).

## Cómo pasar un formulario a otra cuenta (solo superadmin)

Arriba de todo aparece el selector **Cuenta**. Cambiarlo mueve el formulario junto con sus envíos y su bandeja de salida, como avisa el texto bajo el campo [evidencia: admin/index.html:920-924, server.js:1617-1622].

## Cómo copiar el código HTML para pegar en mi sitio

Al final de la ventana, la sección **Integración** muestra el código listo para ese formulario. Tocá **Copiar**. Ver [Poner el formulario en tu sitio](poner-el-formulario-en-tu-sitio.md).

## Errores frecuentes

- **"Formulario no encontrado"** → el formulario fue eliminado (o no pertenece a tu cuenta). Recargá el panel.
- **"senderId belongs to another account"** → el remitente elegido es de otra cuenta; elegí uno propio o uno *Global*.
- **"templatePath outside your account templates"** → la plantilla no está disponible para tu cuenta.
- **"Unknown account: X"** → (superadmin) la cuenta de destino ya no existe.
- **"Error al actualizar"** → el servidor no pudo guardar. Reintentá; si persiste, avisá a soporte.
- **Guardé un token de Telegram y ahora veo `••••`** → es normal: los datos sensibles se muestran enmascarados y se conservan si dejás el campo así [evidencia: server.js:1458-1469].

## Notas de trazabilidad (para revisión, no para el usuario)

- Campos del modal de edición: [evidencia: admin/index.html:914-1041]
- Carga de valores actuales y máscaras: [evidencia: admin/index.html:2828-2869]
- Payload de guardado: [evidencia: admin/index.html:2913-2962]
- Validaciones y merge en el servidor: [evidencia: server.js:1609-1653]
- Asunto = prefijo + nombre/alias; Reply-To = email del visitante: [evidencia: server.js:947-981]
- Redirect vs JSON: [evidencia: server.js:1320-1324]
