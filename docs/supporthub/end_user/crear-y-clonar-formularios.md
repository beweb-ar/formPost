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
  tags: [formularios, crear, clonar, duplicar]
---

# Crear un formulario nuevo (y duplicar uno existente)

## Qué vas a lograr

Dar de alta un formulario en formPost para que un formulario de tu sitio web empiece a mandarte los mensajes por email.

## Cómo crear un formulario nuevo (dar de alta / agregar formulario)

1. En la pantalla principal, tocá la tarjeta punteada **+ Agregar Formulario** (está al final de las tarjetas).
2. Completá los campos:
   - **ID**: el identificador del formulario, por ejemplo `contacto-home`. Se usa letras, números, guiones y guiones bajos, hasta 64 caracteres. Este mismo texto va después en el campo oculto `form_id` de tu HTML.
   - **Email Destino**: escribí la dirección y tocá **+**. Podés agregar varias; cada una queda como una etiqueta con una **✕** para sacarla.
   - **Prefijo de Asunto**: lo que va adelante del asunto de cada email, por ejemplo `[Contacto Web]`.
   - **URL de Redirección** (opcional): a dónde mandar al visitante después de enviar. Si la dejás vacía, el servidor responde un JSON de éxito en vez de redirigir.
   - **Plantilla**: el diseño del email que vas a recibir.
   - **Sender**: desde qué remitente sale el email.
   - **Captcha**: viene tildado por defecto. Si lo dejás tildado, cargá la **Clave Secreta** de Turnstile o hCaptcha; sin clave secreta guardada el captcha no se verifica.
   - **Dominios Permitidos** (opcional): desde qué sitios se acepta el envío. Vacío = cualquiera.
   - **Discord / Telegram / Webhook** (opcional): notificaciones además del email.
3. Tocá **Agregar Formulario**. Vas a ver el aviso `Formulario agregado correctamente`.
4. Abrí el formulario con **Editar** y copiá el código HTML de la sección **Integración** al final: ver [Poner el formulario en tu sitio](poner-el-formulario-en-tu-sitio.md).

Si sos superadmin y hay más de una cuenta, arriba de todo aparece el selector **Cuenta** para elegir en cuál se crea [evidencia: admin/index.html:1059-1062, admin/index.html:2669-2683].

## Cómo duplicar un formulario (clonar / copiar uno que ya tengo)

Sirve cuando querés otro formulario casi igual (por ejemplo el mismo contacto para otra landing).

1. En la tarjeta del formulario original, tocá el ícono de **copiar** (dos hojas).
2. Se abre la ventana **Clonar Formulario** con todos los datos ya cargados y el ID sugerido `<id-original>-copy`.
3. **Cambiá el ID** (dos formularios no pueden tener el mismo) y ajustá lo que necesites.
4. Tocá **Agregar Formulario**.

La copia se lleva también cosas que esa ventana no muestra: el alias del remitente y toda la configuración de auto-respuesta [evidencia: admin/index.html:2722-2729, admin/index.html:2797-2803].

Lo que **no** se copia: los envíos recibidos ni el historial de salida del formulario original — el clon arranca vacío.

## Cómo eliminar un formulario

En la tarjeta, tocá el **tacho**. Te pide confirmación: `¿Seguro que desea eliminar "<id>"? Esta acción no se puede deshacer.` Al aceptar se borran la configuración del formulario, su clave de captcha guardada y los archivos adjuntos que había recibido [evidencia: server.js:1656-1677].

A partir de ese momento, cualquier envío desde tu sitio a ese `form_id` va a fallar con `ID de formulario no válido.`

## Errores frecuentes

- **"El ID del formulario ya existe"** → ya hay un formulario con ese ID (incluso en otra cuenta si sos superadmin). Elegí otro.
- **"ID de formulario no válido"** → el ID tiene espacios, acentos o símbolos. Usá solo letras, números, `-` y `_`, máximo 64 caracteres.
- **"Falta id o configuración"** → quedó vacío el ID. Completalo y volvé a guardar.
- **"senderId belongs to another account"** → elegiste un remitente que pertenece a otra cuenta. Elegí uno de tu cuenta o uno marcado como *Global*.
- **"templatePath outside your account templates"** → la plantilla elegida no es tuya ni compartida. Elegí una de la lista de tu cuenta.
- **"Unknown account: X"** → (superadmin) la cuenta seleccionada ya no existe. Recargá el panel.
- **No veo la tarjeta "+ Agregar Formulario"** → tu rol es *Usuario*, que solo consulta. Pedile a un administrador de tu cuenta que lo cree.

## Notas de trazabilidad (para revisión, no para el usuario)

- Modal de creación y sus campos: [evidencia: admin/index.html:1055-1158]
- Envío del formulario de creación y campos que viajan: [evidencia: admin/index.html:2762-2823]
- Clonado y campos arrastrados: [evidencia: admin/index.html:2712-2760]
- Validaciones del servidor al crear: [evidencia: server.js:1566-1606]
- Borrado en cascada de captcha y adjuntos: [evidencia: server.js:1656-1677]
- Captcha tildado por defecto en el alta: [evidencia: admin/index.html:1102]
