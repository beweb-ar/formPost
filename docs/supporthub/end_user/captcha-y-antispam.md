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
  tags: [captcha, turnstile, hcaptcha, spam, honeypot, dominios]
---

# Frenar el spam: captcha, honeypot y dominios permitidos

## Qué vas a lograr

Dejar de recibir mensajes basura sin complicarle la vida a la gente que sí quiere escribirte.

formPost tiene tres defensas y conviene entenderlas por separado.

## 1. La trampa invisible que ya viene puesta (honeypot)

El código HTML que copiás del panel incluye este campo oculto:

```html
<input type="text" name="_hp_field" style="display:none" tabindex="-1" autocomplete="off">
```

Una persona nunca lo ve ni lo completa; muchos bots sí. Cuando llega completo, formPost **descarta el mensaje y le responde al bot un falso "enviado correctamente"** para que no siga probando [evidencia: server.js:804-807].

No requiere configuración. Lo único importante: **no lo saques del HTML** y no lo hagas visible.

## 2. El captcha (Cloudflare Turnstile o hCaptcha)

### Cómo activar el captcha en un formulario

1. Creá tu sitio en el proveedor y obtené las dos claves: **site key** (pública) y **secret key** (privada).
   - Cloudflare Turnstile o hCaptcha, el que prefieras.
2. En formPost: **Editar** el formulario → tildá **Activar Verificación Captcha**.
3. Elegí el **Proveedor de Captcha** y pegá la **Clave Secreta** (la privada).
4. **Guardar Cambios**.
5. En tu página, agregá el widget con la **site key**. Si copiás de nuevo el código de la sección **Integración**, ya viene el bloque correcto:
   - Turnstile: `<div class="cf-turnstile" data-sitekey="TU_SITE_KEY"></div>` + el script de Cloudflare.
   - hCaptcha: `<div class="h-captcha" data-sitekey="TU_SITE_KEY"></div>` + el script de hCaptcha.

### Cómo desactivar el captcha

Destildá **Activar Verificación Captcha** y guardá. Podés sacar también el widget de tu página.

### Importante: sin clave secreta, el captcha no se verifica

Aunque el tilde esté puesto, formPost solo verifica el captcha si además hay una **clave secreta guardada** para ese formulario. Sin clave, los envíos pasan sin verificación [evidencia: server.js:852-853].

Para saber cómo está: desplegá la tarjeta del formulario. Si hay clave guardada, aparece la línea `Captcha (Turnstile)` o `Captcha (hCaptcha)` con **Activo** o **Desactivado**. Si no aparece esa línea, no hay clave cargada [evidencia: admin/index.html:2492-2497].

## 3. Aceptar envíos solo desde tu sitio (dominios permitidos)

1. **Editar** el formulario → **Dominios Permitidos**.
2. Escribí `https://tusitio.com` y tocá **+**. Agregá los que necesites (por ejemplo, también `https://www.tusitio.com`).
3. **Guardar Cambios**.

Con la lista vacía se acepta desde cualquier origen. Con la lista cargada, si el envío llega desde otro lado, el visitante ve `No se permiten envíos desde este dominio.` [evidencia: server.js:824-836].

Cuidado con dos detalles: se compara el **origen completo** (esquema + dominio + puerto), así que `http://` y `https://`, o con y sin `www`, cuentan como distintos. Y si probás el formulario abriendo el HTML como archivo local, no hay origen válido y el envío va a ser rechazado.

## Límites automáticos que ya están puestos (anti-abuso)

Sin configurar nada, formPost limita:

- **5 envíos por minuto** desde una misma IP → `Too many submissions. Please try again later.`
- **100 envíos por minuto** por formulario, sumando todas las IP → `Too many submissions for this form. Please try again later.`
- Máximo 30 campos, 5.000 caracteres por campo y 100 KB de cuerpo por envío.

[evidencia: server.js:376-395, server.js:840-845]

## Sigo recibiendo spam: ¿qué reviso?

1. ¿El HTML de tu página tiene el campo `_hp_field` oculto? Si lo sacaste al rediseñar, volvé a copiar el código desde **Editar > Integración**.
2. ¿El captcha está realmente verificando? Revisá que haya **clave secreta guardada** (ver arriba) y que el widget esté en la página.
3. ¿Tenés cargados los **Dominios Permitidos**? Es la forma más efectiva de frenar envíos automatizados directos contra `/submit`.
4. Si el spam viene con el widget resuelto, el problema es la configuración del proveedor de captcha (claves de otro sitio, dominio no autorizado): revisá tu cuenta de Turnstile/hCaptcha.

## Errores frecuentes

- **"Por favor complete la verificación de seguridad."** → el captcha está activo pero el envío no trajo el token: falta el widget en la página o el visitante no lo completó.
- **"Verificación de seguridad fallida. Intente nuevamente."** → el proveedor rechazó el token: la clave secreta no corresponde a la site key, o el token venció (el visitante tardó demasiado).
- **"Error de verificación de seguridad. Intente más tarde."** → no se pudo contactar al proveedor de captcha; suele ser temporal.
- **"Envío de formulario no válido."** → el captcha está activo pero no hay clave secreta guardada para ese formulario.
- **"No se permiten envíos desde este dominio."** → el origen del envío no está en la lista; agregalo tal cual (con `https://` y con o sin `www`, según corresponda).

## Notas de trazabilidad (para revisión, no para el usuario)

- Honeypot y falso éxito: [evidencia: server.js:789, server.js:804-807]
- Verificación de captcha y condición de clave secreta: [evidencia: server.js:850-897]
- Proveedores soportados y URLs de verificación: [evidencia: server.js:869-871]
- Control de origen por allowedDomains: [evidencia: server.js:824-836]
- Límites por IP y por formulario: [evidencia: server.js:376-395]
- Indicador de captcha en la tarjeta: [evidencia: admin/index.html:2492-2497]
- Modo DEBUG del servidor saltea la verificación de captcha: [evidencia: server.js:854, server.js:893-894]
