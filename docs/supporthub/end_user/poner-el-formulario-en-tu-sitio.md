---
supporthub:
  source_of_truth: false
  audience: end_user
  priority: critical
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
  tags: [integracion, html, codigo, adjuntos, submit]
---

# Poner el formulario en tu sitio web (código HTML para pegar)

## Qué vas a lograr

Que el formulario de tu página empiece a mandar los mensajes a formPost, con el código correcto y sin sorpresas.

## Cómo copiar el código HTML de mi formulario

1. En la tarjeta del formulario, tocá **Editar**.
2. Bajá hasta la sección **Integración** (al final de la ventana).
3. Tocá **Copiar**. Vas a ver `Copiado al portapapeles`.
4. Pegá ese código en tu página web.

El código ya viene con la dirección de tu servidor, con el `form_id` correcto y —si el formulario tiene captcha configurado— con el bloque del proveedor que elegiste (Turnstile o hCaptcha) [evidencia: admin/index.html:2875-2902].

También hay un ejemplo genérico completo en el botón **?** del encabezado (Guía de Integración), con su propio botón de copiar [evidencia: admin/index.html:2567-2654].

## Cómo se ve el código y qué hace cada parte

```html
<form action="https://TU-SERVIDOR/submit" method="POST" enctype="multipart/form-data">
    <input type="hidden" name="form_id" value="TU_FORM_ID">

    <!-- Honeypot anti-spam (oculto, no lo saques) -->
    <input type="text" name="_hp_field" style="display:none" tabindex="-1" autocomplete="off">

    <label>Name: <input type="text" name="name" required></label>
    <label>Email: <input type="email" name="email" required></label>
    <label>Phone: <input type="tel" name="phone"></label>
    <label>Message: <textarea name="message"></textarea></label>

    <!-- Adjuntos (opcional, máx 5 archivos, 10 MB cada uno) -->
    <label>Attachments: <input type="file" name="attachments" multiple></label>

    <button type="submit">Send</button>
</form>
```

- **`action`**: siempre la dirección de tu servidor formPost terminada en `/submit`.
- **`form_id`**: el ID del formulario que creaste en el panel. Si no coincide, el envío falla con `ID de formulario no válido.`
- **`_hp_field`**: la trampa anti-bots. Tiene que quedar **oculta y vacía**; si un bot la completa, formPost simula un envío exitoso y descarta el mensaje [evidencia: server.js:804-807].
- **Los demás campos**: los que quieras. No hay una lista fija: todo lo que mandes se guarda y aparece en el email [evidencia: server.js:1056-1059].

## Qué nombres de campo conviene usar (name, email, teléfono)

formPost reconoce algunos nombres para identificar a la persona:

- Nombre: `name`, `nombre` o `full_name`
- Email: `email`, `correo` o `e_mail`

Con esos nombres, la persona aparece identificada en la bandeja de entrada, el asunto del email sale con su nombre, podés responderle directo y funciona la auto-respuesta [evidencia: server.js:847, server.js:946, server.js:1078-1079]. Cualquier otro campo funciona igual, solo que se muestra como un dato más.

## Cómo permitir que la gente adjunte archivos

1. Agregá `enctype="multipart/form-data"` en la etiqueta `<form>`.
2. Agregá `<input type="file" name="attachments" multiple>`.

Límites: **5 archivos** como máximo y **10 MB** por archivo. Los adjuntos se reenvían por email, Discord y Telegram, y además quedan guardados en el servidor: los descargás desde el detalle de cada envío [evidencia: server.js:17-18, server.js:1061-1067].

Hay extensiones bloqueadas por seguridad: `exe, bat, cmd, sh, ps1, msi, dll, com, scr, pif, vbs, js, jar, cpl, inf, reg` [evidencia: server.js:24].

## Cómo enviar el formulario con JavaScript (fetch / AJAX, sin recargar la página)

Podés mandarlo por `fetch()` en vez de dejar que el navegador haga el POST clásico:

```js
const form = document.querySelector('#mi-formulario');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('https://TU-SERVIDOR/submit', {
    method: 'POST',
    body: new FormData(form)
  });
  const data = await res.json();   // { success: true, message: "Formulario enviado correctamente." }
});
```

Dos cosas a tener en cuenta:

- Dejá vacía la **URL de Redirección** del formulario, así el servidor responde JSON en vez de redirigir [evidencia: server.js:1320-1324].
- El servidor acepta pedidos desde cualquier origen para poder leer la respuesta; el control de quién puede enviar lo hace la lista de **Dominios Permitidos** [evidencia: server.js:420-429].

En el panel vas a distinguir los dos casos: cada envío muestra una etiqueta **POST** (formulario HTML clásico) o **JS** (enviado por JavaScript) [evidencia: server.js:793-795, admin/index.html:4118-4122].

## Cómo agregar el captcha en mi página

Si el formulario tiene captcha activado, el código copiado ya trae el bloque correspondiente; solo reemplazá `YOUR_SITE_KEY` por tu clave pública:

- Turnstile: `<div class="cf-turnstile" data-sitekey="TU_SITE_KEY"></div>` + `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
- hCaptcha: `<div class="h-captcha" data-sitekey="TU_SITE_KEY"></div>` + `<script src="https://js.hcaptcha.com/1/api.js" async defer></script>`

Ver [Captcha y anti-spam](captcha-y-antispam.md).

## Cuánto puedo mandar (límites de un envío)

- Máximo **30 campos** por envío
- Máximo **100 caracteres** en el nombre de un campo
- Máximo **5.000 caracteres** en el valor de un campo
- El cuerpo del pedido no puede superar **100 KB** (sin contar adjuntos)
- Máximo **5 envíos por minuto** desde la misma IP, y **100 por minuto** por formulario

[evidencia: server.js:376-388, server.js:417-418, server.js:840-845]

## Errores frecuentes

- **"ID de formulario no válido."** → el `form_id` del HTML no coincide con ninguno del panel, está mal escrito o el formulario fue eliminado.
- **"No se permiten envíos desde este dominio."** → tu sitio no está en la lista de Dominios Permitidos del formulario. Agregalo con el mismo esquema y dominio (`https://tusitio.com`).
- **"Por favor complete la verificación de seguridad."** → falta el widget de captcha en la página, o el visitante no lo resolvió.
- **"Demasiados campos en el formulario."** → más de 30 campos: quitá alguno.
- **"El campo "X" es demasiado largo."** → ese campo supera los 5.000 caracteres.
- **"Dirección de email no válida."** → el campo de email no tiene formato válido.
- **"File too large (max 10 MB)." / "Too many files (max 5)." / "File type not allowed."** → problemas con los adjuntos (tamaño, cantidad o extensión bloqueada).
- **"Too many submissions. Please try again later."** → se superaron los 5 envíos por minuto desde esa IP.
- **"Ocurrió un error en el servidor."** → el envío llegó pero el email no pudo salir. **Ese envío no queda guardado**: revisá la Bandeja de Salida para ver el error del remitente [evidencia: server.js:1017-1040].

## Notas de trazabilidad (para revisión, no para el usuario)

- Generador del código de integración por formulario: [evidencia: admin/index.html:2875-2911]
- Ejemplo HTML de la ayuda in-app: [evidencia: admin/index.html:2581-2624]
- Procesamiento del envío, honeypot, validaciones y límites: [evidencia: server.js:788-897]
- Adjuntos, extensiones bloqueadas y persistencia: [evidencia: server.js:15-30, server.js:697-716]
- CORS abierto en /submit con control por allowedDomains: [evidencia: server.js:420-429, server.js:824-836]
- Detección POST vs JS por cabecera `sec-fetch-mode`: [evidencia: server.js:793-795]
- Cuando falla el email se responde 500 antes de guardar el envío: [evidencia: verificado a c73bdc5 — server.js:1039 retorna antes del bloque de guardado en server.js:1043]
