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
   - **Asunto de auto-respuesta**: por ejemplo `Recibimos tu consulta`. Si lo dejás vacío, se manda con el asunto `Thank you for your submission` [evidencia: server.js:1277].
   - **Template de auto-respuesta**: el diseño del email. Por defecto `templates/auto-reply.html`.
   - **Responder a**: la dirección donde querés que lleguen las respuestas del visitante, por ejemplo `ventas@tuempresa.com`.
4. **Guardar Cambios**.

## Requisitos para que la auto-respuesta salga

Se envía solo si se cumplen las tres condiciones [evidencia: server.js:1261]:

1. La auto-respuesta está activada en ese formulario.
2. El envío trae un **email válido** del visitante, en un campo llamado `email`, `correo` o `e_mail`.
3. El remitente del formulario está **activo** (si está desactivado no sale ni el email principal ni la auto-respuesta).

Si el visitante no deja su email, no hay a quién responderle: el envío se procesa igual, sin auto-respuesta.

## Cómo cambiar el texto del "gracias"

La auto-respuesta usa una plantilla como cualquier otro email: editala desde **Plantillas** en el encabezado. Podés usar `{{fields}}` para incluir un resumen de lo que la persona escribió y `{{form_id}}` para el nombre del formulario. Ver [Plantillas de email](plantillas-de-email.md).

Si el archivo de la plantilla no existe, formPost manda igual un texto genérico: *"Thank you for your submission — We have received your message and will get back to you soon."* [evidencia: server.js:1274-1276].

## Con qué nombre y dirección llega la auto-respuesta

- **De**: el alias del remitente que hayas configurado en el formulario; si no hay alias, el nombre del sender [evidencia: server.js:1279].
- **Responder a**: lo que cargaste en el campo **Responder a**. Si lo dejás vacío, la respuesta del visitante vuelve a la dirección del sender.

## Cómo confirmar que la auto-respuesta salió

En la **Bandeja de Salida** aparece como una entrada de canal **Mail** dirigida al email del visitante, con su estado ✓ o ✗ [evidencia: server.js:1293-1307]. También suma al contador de mails del formulario.

## Errores frecuentes

- **No llega la auto-respuesta pero sí el email a mí** → el envío no traía un campo `email`/`correo`/`e_mail` válido, o la casilla del visitante la marcó como spam. Verificá en la Bandeja de Salida si hay una entrada dirigida a esa persona.
- **Llega con el asunto "Thank you for your submission"** → quedó vacío el campo Asunto de auto-respuesta.
- **Llega sin diseño, con un texto genérico en inglés** → la plantilla configurada no existe; elegí una válida en **Editar > Template de auto-respuesta**.
- **En la Bandeja de Salida la auto-respuesta figura con ✗** → el servidor de correo rechazó ese envío puntual (por ejemplo, dirección inexistente). El mensaje original tuyo no se pierde.

## Notas de trazabilidad (para revisión, no para el usuario)

- Campos de auto-respuesta en el modal de edición: [evidencia: admin/index.html:974-994]
- Condiciones de envío: [evidencia: server.js:1261]
- Plantilla, variables y fallback: [evidencia: server.js:1263-1277]
- Remitente y Reply-To de la auto-respuesta: [evidencia: server.js:1278-1284]
- Registro en outbox y contador de mails: [evidencia: server.js:1293-1313]
