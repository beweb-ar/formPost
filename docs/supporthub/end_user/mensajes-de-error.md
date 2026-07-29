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
    - server.js
    - admin/index.html
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [errores, mensajes, diagnostico, troubleshooting]
---

# "Me sale este mensaje": qué significa y qué hacer

## Qué vas a lograr

Buscar el texto exacto que aparece en pantalla y saber en dos líneas qué hacer.

## Mensajes que ve la gente que completa tu formulario

Son los que devuelve el servidor cuando alguien envía el formulario desde tu sitio.

| Mensaje exacto | Qué pasó | Qué hacer |
|---|---|---|
| `ID de formulario no válido.` | El `form_id` del HTML no coincide con ningún formulario | Revisá que el `form_id` sea igual al ID del panel; si borraste el formulario, creá uno nuevo |
| `No se permiten envíos desde este dominio.` | El sitio no está en Dominios Permitidos | Agregá tu dominio en **Editar > Dominios Permitidos** (con `https://` y con/sin `www` según corresponda) |
| `Por favor complete la verificación de seguridad.` | Falta el token del captcha | Poné el widget del captcha en la página, o desactivá el captcha del formulario |
| `Verificación de seguridad fallida. Intente nuevamente.` | El proveedor rechazó el captcha | Verificá que la clave secreta corresponda a la site key de tu sitio |
| `Error de verificación de seguridad. Intente más tarde.` | No se pudo contactar a Turnstile/hCaptcha | Suele ser temporal; reintentá |
| `Envío de formulario no válido.` | Captcha activado sin clave secreta guardada | Cargá la clave secreta o destildá el captcha |
| `Demasiados campos en el formulario.` | Más de 30 campos | Reducí la cantidad de campos |
| `Nombre de campo no válido.` | Un nombre de campo supera 100 caracteres | Acortá el `name` de ese input |
| `El campo "X" es demasiado largo.` | Ese campo supera 5.000 caracteres | Limitá el largo en tu formulario |
| `Dirección de email no válida.` | El campo email no tiene formato válido | Validá el email en el navegador antes de enviar |
| `Too many submissions. Please try again later.` | Más de 5 envíos por minuto desde la misma IP | Esperá un minuto |
| `Too many submissions for this form. Please try again later.` | Más de 100 envíos por minuto en ese formulario | Suele indicar un ataque o un bucle en tu sitio; revisá |
| `File too large (max 10 MB).` | Adjunto de más de 10 MB | Pedí archivos más chicos |
| `Too many files (max 5).` | Más de 5 adjuntos | Limitá el input de archivos |
| `File type not allowed.` | Extensión bloqueada (exe, bat, js, jar…) | Pedile a la persona que lo mande comprimido en zip o por otro medio |
| `Ocurrió un error en el servidor.` | El email no pudo salir; **ese envío no se guarda** | Revisá la Bandeja de Salida: ahí está el error del remitente |
| `Error de configuración de template.` / `Error de template en el servidor.` | Problema con la plantilla del formulario | Elegí otra plantilla en **Editar > Plantilla** |
| `Formulario enviado correctamente.` | Todo bien (o el honeypot detectó un bot y respondió éxito falso) | Nada |

## Mensajes al entrar al panel

Están explicados en [Entrar al panel](como-ingresar-al-panel.md): credenciales inválidas, código expirado, "no existe un usuario con ese email", demasiados intentos, etc.

## Mensajes del panel (avisos de colores arriba a la derecha)

| Mensaje exacto | Qué pasó | Qué hacer |
|---|---|---|
| `Error de conexión` | El panel no pudo hablar con el servidor | Recargá; si sigue, el servidor puede estar caído |
| `Too many requests. Please try again later.` | Más de 120 pedidos por minuto desde el panel | Esperá un minuto |
| `Tu sesión expiró. Ingresá de nuevo.` | Pasaron 12 horas | Volvé a ingresar |
| `El ID del formulario ya existe` | Ya hay un formulario con ese ID | Elegí otro |
| `ID de formulario no válido` | El ID tiene caracteres no permitidos | Solo letras, números, `-` y `_` |
| `Formulario no encontrado` | El formulario fue borrado o es de otra cuenta | Recargá el panel |
| `senderId belongs to another account` | El remitente elegido es de otra cuenta | Elegí uno propio o Global |
| `templatePath outside your account templates` | La plantilla no está disponible para tu cuenta | Elegí una de tu lista |
| `Host y puerto son requeridos para senders SMTP` | Falta host o puerto | Completalos |
| `La API Key de SendGrid es requerida` | Sender SendGrid sin clave | Cargá la API key |
| `Connection failed: …` | El Test del remitente falló | El detalle indica la causa (credenciales, dominio, IP) |
| `SendGrid: invalid API key (401)` | Clave inválida o IP bloqueada en SendGrid | Regenerá la key o habilitá la IP en SendGrid |
| `SendGrid: stored API key cannot be decrypted…` | Cambió la clave de cifrado del servidor | Volvé a cargar la API key en el sender |
| `No se encontraron chats. Enviá un mensaje al bot primero e intentá de nuevo.` | Telegram no tiene chats para ese bot | Escribile al bot desde el chat destino y reintentá |
| `Enter a Bot Token first` | Tocaste **Obtener** sin token | Pegá el token del bot |
| `Guardada como copia para tu cuenta` | Editaste una plantilla compartida | No es error: ahora tenés tu propia copia |
| `Invalid template name` | Nombre con barras o sin `.html` | Usá un nombre simple, por ejemplo `mi-plantilla.html` |
| `La cuenta todavía tiene formularios o senders…` | Intento de borrar una cuenta con datos | Borrá o reasigná sus formularios y senders primero |
| `Cannot delete your own user` | Intentaste borrar tu propio usuario | Pedile a otro superadmin que lo haga |
| `Cannot demote the last superadmin` / `Cannot delete the last superadmin` | Quedaría la plataforma sin superadmin | Creá otro superadmin antes |
| `That email is already used by another user` | Ese email ya está en otro usuario | Usá otro email o liberalo del usuario anterior |
| `Too many connections` | Más de 20 sesiones del panel abiertas | Cerrá alguna pestaña o sesión |
| `Invalid backup file` / `Restore failed: …` | El archivo de backup no es válido | Usá un backup generado por formPost |

## Cómo leer un error de entrega en la Bandeja de Salida

Los errores de la columna **Estado** vienen del proveedor de correo, no de formPost. Los más comunes:

- **Credenciales rechazadas** (`535`, `Invalid login`) → usuario o contraseña del sender.
- **Dominio o remitente no verificado** (SendGrid `403`, "from address does not match a verified Sender Identity") → verificá el dominio/remitente en SendGrid.
- **Destinatario inexistente** (`550`) → la dirección de destino está mal escrita.
- **Timeout / ECONNREFUSED** → host o puerto incorrectos, o el servidor de correo no acepta conexiones desde este servidor.

Ver [Bandejas de entrada y salida](bandejas-entrada-y-salida.md) y [Remitentes de email](remitentes-de-email.md).

## Notas de trazabilidad (para revisión, no para el usuario)

- Diccionario de mensajes del servidor (ES/EN): [evidencia: server.js:145-260]
- Errores de validación del envío: [evidencia: server.js:810-897]
- Errores de subida de archivos: [evidencia: server.js:1332-1346]
- Textos del panel: [evidencia: admin/index.html, diccionario `i18n`]
- Errores de API admin (formularios, senders, cuentas, usuarios): [evidencia: server.js:1566-2761]
- El texto exacto que ve el visitante depende de la variable `LANG` del servidor: [evidencia: server.js:142, server.js:229]
