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
    - templates/auto-reply.html
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [auto-respuesta, autoreply, confirmacion, gracias]
---

# Mandar un "gracias por escribirnos" automático al visitante (auto-respuesta)

## Qué vas a lograr

Que quien completa tu formulario reciba al instante un email de confirmación, con tu diseño y tu dirección de respuesta.

## Cómo activar la auto-respuesta

1. En la tarjeta del formulario, tocá **Editar**.
2. Tildá **Activar auto-respuesta al remitente**.
3. Completá:
   - **Asunto de auto-respuesta**: por ejemplo `Recibimos tu consulta`. Acepta las mismas variables que la plantilla, así que podés poner `Hola {{name}}! Te contactamos desde Catálogo Plus` [evidencia: server.js:1855]. Si lo dejás vacío, se manda con el asunto `Thank you for your submission`.
   - **Template de auto-respuesta**: el diseño del email. Por defecto `templates/auto-reply.html`.
   - **Responder a**: la dirección donde querés que lleguen las respuestas del visitante, por ejemplo `ventas@tuempresa.com`.
4. **Guardar Cambios**.

## Requisitos para que la auto-respuesta salga

Se envía solo si se cumplen las tres condiciones [evidencia: server.js:1834]:

1. La auto-respuesta está activada en ese formulario.
2. El envío trae un **email válido** del visitante, en un campo llamado `email`, `correo` o `e_mail`.
3. El remitente del formulario está **activo** (si está desactivado no sale ni el email principal ni la auto-respuesta).

Si el visitante no deja su email, no hay a quién responderle: el envío se procesa igual, sin auto-respuesta.

## Cómo cambiar el texto del "gracias"

La auto-respuesta usa una plantilla como cualquier otro email: editala desde **Plantillas** en el encabezado. Podés usar `{{fields}}` para incluir un resumen de lo que la persona escribió, `{{form_id}}` para el nombre del formulario y `{{nombre_del_campo}}` para tutear a la persona por su nombre. Ver [Plantillas de email](plantillas-de-email.md).

### Personalizar con los datos que dejó la persona

Tanto el cuerpo como el **asunto** aceptan `{{nombre_del_campo}}`, y `{{nombre_del_campo|texto por defecto}}` para el caso de que ese campo venga vacío [evidencia: server.js:1297-1335]:

| Escribís | Si mandó "Juan" | Si no mandó nombre |
|---|---|---|
| `Hola {{name}}!` | `Hola Juan!` | `Hola!` |
| `Hola {{name|amigo}}!` | `Hola Juan!` | `Hola amigo!` |

Fijate que el espacio de más no queda colgando: un valor vacío antes de `!`, `,` o `.` se limpia solo.

Los nombres se comparan sin distinguir mayúsculas ni guiones, y los pares habituales español/inglés son equivalentes: nombre/name, correo/email, telefono/phone, empresa/company, mensaje/message. O sea que `{{name}}` funciona aunque tu campo se llame `nombre`.

Viene incluida `templates/autoresponder-catalogoplus-es.html` como ejemplo completo, con logo, botón y firma.

Si el archivo de la plantilla no existe, formPost manda igual un texto genérico: *"Thank you for your submission — We have received your message and will get back to you soon."* [evidencia: server.js:1849].

## Con qué nombre y dirección llega la auto-respuesta

- **De**: el alias del remitente que hayas configurado en el formulario; si no hay alias, el nombre del sender [evidencia: server.js:1860].
- **Responder a**: lo que cargaste en el campo **Responder a**. Si lo dejás vacío, la respuesta del visitante vuelve a la dirección del sender.

## Cómo confirmar que la auto-respuesta salió

En la **Bandeja de Salida** aparece como una entrada de canal **Mail** dirigida al email del visitante, con su estado ✓ o ✗ [evidencia: server.js:1877-1892]. También suma al contador de mails del formulario.

## Errores frecuentes

- **No llega la auto-respuesta pero sí el email a mí** → el envío no traía un campo `email`/`correo`/`e_mail` válido, o la casilla del visitante la marcó como spam. Verificá en la Bandeja de Salida si hay una entrada dirigida a esa persona.
- **Llega con el asunto "Thank you for your submission"** → quedó vacío el campo Asunto de auto-respuesta, o todas sus variables quedaron vacías (un asunto que queda en blanco vuelve al texto por defecto).
- **Donde iba el nombre no aparece nada** → ese `{{campo}}` no coincide con ningún campo del formulario, y en la auto-respuesta un campo sin dato se reemplaza por nada (nunca por un "Not specified" delante del cliente). Revisá cómo se llama el input en tu sitio y, si el campo puede no venir, usá `{{campo|texto por defecto}}`.
- **Llega sin diseño, con un texto genérico en inglés** → la plantilla configurada no existe; elegí una válida en **Editar > Template de auto-respuesta**.
- **En la Bandeja de Salida la auto-respuesta figura con ✗** → el servidor de correo rechazó ese envío puntual (por ejemplo, dirección inexistente). El mensaje original tuyo no se pierde.

## Notas de trazabilidad (para revisión, no para el usuario)

- Campos de auto-respuesta en el modal de edición: [evidencia: admin/index.html:974-994]
- Condiciones de envío: [evidencia: server.js:1834]
- Motor de variables ({{campo}}, {{campo|defecto}}, alias es/en): [evidencia: server.js:1263-1335]
- Plantilla y asunto de la auto-respuesta: [evidencia: server.js:1844-1859]
- Remitente y Reply-To de la auto-respuesta: [evidencia: server.js:1860-1864]
- Registro en outbox y contador de mails: [evidencia: server.js:1877-1899]
