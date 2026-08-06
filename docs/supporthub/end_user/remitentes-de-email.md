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
  tags: [senders, smtp, sendgrid, remitente, casilla-de-salida]
---

# Configurar desde qué casilla salen los emails (senders / remitentes)

## Qué vas a lograr

Dar de alta el servidor de correo que formPost usa para enviarte los mensajes, probarlo, y entender por qué a veces los mails no salen.

Todo esto está en **Configuración** (engranaje del encabezado) → pestaña **Senders**. Necesitás rol de admin de cuenta o superadmin.

## Cómo agregar un remitente con mi casilla de correo (SMTP)

1. **Configuración > Senders > + Nuevo Sender**.
2. **Nombre / Alias**: cómo lo vas a reconocer en la lista, por ejemplo `Casilla contacto`.
3. **Tipo**: dejá **SMTP**.
4. **From Email**: la dirección desde la que salen los mails, por ejemplo `noreply@tuempresa.com`.
5. **Host** y **Puerto**: los datos que te da tu proveedor de correo (típicamente `587` o `465`).
6. **Conexión Segura (TLS/SSL)**: se ajusta sola según el puerto, no hace falta tocarla (ver abajo).
7. **Usuario** y **Contraseña**: las credenciales de la casilla.
8. **Sender de respaldo** (opcional): a qué otro remitente pasar si este falla (ver más abajo).
9. Tocá **Test** para probar antes de guardar (ver más abajo) y después **Save**.

Host y puerto son obligatorios: si faltan, aparece `Host y puerto son requeridos para senders SMTP`.

### Puerto y "Conexión Segura": no se eligen por separado

El modo de cifrado lo define el puerto, y formPost lo ajusta solo al escribirlo:

| Puerto | Modo | Casilla "Conexión Segura" |
|---|---|---|
| 465 | TLS implícito (cifrado desde el primer byte) | tildada |
| 587 / 2525 | STARTTLS (arranca en texto plano y se cifra enseguida) | destildada |
| 25 | Relay interno, STARTTLS si el servidor lo ofrece | destildada |

Combinarlos al revés — por ejemplo puerto 587 con la casilla tildada — hacía que el envío fallara con
`SSL routines:...:wrong version number`. Ahora la combinación se corrige al guardar y al enviar, así que
ese error ya no debería aparecer con puertos estándar. Si usás un puerto no estándar, la casilla queda
como la dejes.

## Cómo enviar con SendGrid (sin puertos SMTP)

Sirve cuando el hosting bloquea los puertos de correo.

1. **+ Nuevo Sender** → **Tipo: SendGrid**.
2. **From Email**: una dirección de tu dominio verificado en SendGrid.
3. **SendGrid API Key**: la clave con permiso de envío (*Mail Send*).
4. **Dominio de Envío**: el dominio verificado en SendGrid, por ejemplo `tuempresa.com`. Si lo completás, la dirección del *From* tiene que pertenecer a ese dominio.
5. **Test** y **Save**.

La API Key es obligatoria al crearlo: si falta, aparece `La API Key de SendGrid es requerida`.

## Cómo probar que el remitente funciona (botón Test / mail de prueba)

1. Abrí el sender (o completá uno nuevo sin guardarlo todavía).
2. Tocá **Test**.
3. El panel pregunta a qué dirección mandar la prueba (por defecto, la del *From*). Confirmá.
4. Si sale bien, aparece un aviso verde `Test email sent to ... — <detalle>`; si falla, uno rojo `Connection failed: <motivo>`.

Dos detalles útiles:

- El Test usa **lo que está escrito en pantalla en ese momento**, incluso sin guardar: sirve para probar antes de pisar una configuración que funciona [evidencia: server.js:1809-1828, admin/index.html:3528-3558].
- Si dejás vacíos la contraseña o la API Key, el Test usa las guardadas [evidencia: server.js:1704-1709].

Con SendGrid el mensaje de éxito dice algo como `SendGrid accepted it (HTTP 202), message-id ...`. Eso significa **aceptado para entrega**, no entregado: si el mail no aparece, buscá ese `message-id` en el Activity Feed de SendGrid [evidencia: server.js:1797-1802].

## Cómo desactivar temporalmente un remitente sin borrarlo

Destildá **Activo** y guardá. La fila queda gris en la lista.

Mientras está desactivado, los formularios que lo usan **no envían email**: cada intento queda registrado en la Bandeja de Salida con estado *Skipped*. Los envíos se siguen recibiendo y guardando normalmente [evidencia: server.js:954-965].

## Cómo eliminar un remitente

Botón **Delete** en su fila, y confirmá `Delete sender "X"? This cannot be undone.`

Antes de borrarlo, revisá qué formularios lo usan: si un formulario se queda sin su remitente, formPost usa automáticamente el primero disponible de la cuenta (o uno Global) [evidencia: server.js:611-627].

## Qué significa la etiqueta "Global" en la lista

Un sender **Global** lo provee el administrador de la plataforma y está disponible para todas las cuentas. Podés seleccionarlo en tus formularios, pero no editarlo ni borrarlo: los botones no aparecen [evidencia: admin/index.html:3346-3361, server.js:1743].

Si sos superadmin, en el editor aparece el campo **Cuenta**: dejarlo vacío crea un sender Global; elegir una cuenta lo asigna a esa cuenta [evidencia: admin/index.html:3377-3391, server.js:1716-1727].

## Cómo configurar un remitente de respaldo (failover)

Cada sender puede apuntar a otro como **respaldo**. Si el envío falla por un problema del remitente
—no hay conexión, credenciales rechazadas, el proveedor está caído o limitando— formPost reintenta
el mismo mensaje por el respaldo, sin que el visitante note nada.

**No** se usa el respaldo cuando el rechazo es del mensaje en sí (destinatario inexistente, contenido
o adjunto rechazado): el respaldo recibiría exactamente la misma negativa. En ese caso el envío queda
en la Bandeja de Salida con estado *error*.

### Qué respaldo puedo elegir

- Un sender **Global** solo puede tener como respaldo a otro sender **Global**. Dos senders globales
  pueden respaldarse mutuamente: es la configuración recomendada para alta disponibilidad.
- Un sender **de una cuenta** puede respaldarse en uno Global o en otro de la misma cuenta.
- Por lo tanto, un sender de un cliente **puede tener** respaldo, pero **nunca puede ser** el respaldo
  de un sender compartido: si no fuera así, el correo de otras cuentas saldría por el relay privado de ese cliente.

El desplegable ya muestra solamente las opciones válidas.

### Qué pasa cuando un remitente se cae

Para no pagar el timeout de conexión en cada mail, formPost recuerda el estado de cada remitente:

1. Tras varios fallos seguidos de nivel remitente (3 por defecto) lo marca como **CAÍDO** y, durante
   un período de enfriamiento (5 minutos por defecto), manda todo directo al respaldo sin siquiera intentarlo.
2. Cumplido ese tiempo le da una oportunidad; si vuelve a fallar, el enfriamiento se duplica (hasta 30 minutos).
3. En paralelo, una verificación en segundo plano prueba la conexión cada minuto, así la recuperación
   se detecta aunque no haya tráfico. Cuando vuelve, el tráfico regresa solo al remitente principal.

En la lista de Senders, un remitente caído muestra la etiqueta **CAÍDO** (con el motivo y hasta cuándo,
al pasar el mouse) y un botón **Reintentar ahora** para volver a habilitarlo sin esperar.

Este estado vive en memoria: al reiniciar el servidor, todos los remitentes arrancan sin marca.

En la Bandeja de Salida, los mails que salieron por un respaldo quedan registrados con el sender que
efectivamente los envió.

## Cómo elegir qué remitente usa cada formulario

Se elige por formulario, en **Editar > Sender**. Si el elegido no está disponible, formPost usa el primero de la cuenta y, si no hay, uno Global [evidencia: server.js:600-628].

## Errores frecuentes

- **"Connection failed: ..."** → el Test no pudo conectar. Revisá host, puerto, usuario y contraseña; si tu proveedor pide contraseña de aplicación, usá esa. El mensaje ahora incluye una pista según el tipo de falla (TLS mal configurado, credenciales rechazadas, servidor inalcanzable).
- **"...wrong version number..."** → el modo TLS no coincide con el puerto. Con puertos estándar se corrige solo; si usás uno no estándar, probá tildar/destildar **Conexión Segura**.
- **"A global sender can only fall back to another global sender"** → estás intentando poner como respaldo de un sender Global uno que pertenece a una cuenta. Usá otro Global.
- **"Backup sender ... belongs to another account"** → el respaldo elegido es de otra cuenta.
- **"A sender cannot be its own backup"** → elegiste el mismo sender como su propio respaldo.
- **"SendGrid: invalid API key (401)"** → la API Key es inválida o el servidor tiene la IP bloqueada en *IP Access Management* de SendGrid.
- **"SendGrid: stored API key cannot be decrypted…"** → la clave de cifrado del servidor cambió; volvé a cargar la API Key en el editor y guardá.
- **"SendGrid: no API key configured for this sender."** → el sender es de tipo SendGrid pero le falta la clave.
- **"La API Key de SendGrid es requerida"** → estás creando un sender SendGrid sin clave.
- **"Host y puerto son requeridos para senders SMTP"** → faltan datos del servidor SMTP.
- **"Sender ID already exists"** → ya hay un sender con ese nombre convertido a ID; usá otro nombre.
- **"Acceso denegado"** al editar → estás intentando modificar un sender Global o de otra cuenta.
- **"Invalid email address"** al testear → la dirección de destino de la prueba está mal escrita.

## Notas de trazabilidad (para revisión, no para el usuario)

- Editor de sender y campos por tipo: [evidencia: admin/index.html:1350-1424, admin/index.html:3393-3426]
- Guardado y validaciones cliente: [evidencia: admin/index.html:3434-3506]
- Test con valores sin guardar y fallback a secretos almacenados: [evidencia: server.js:1781-1828]
- Transporte SendGrid vía API v3 y semántica del 202: [evidencia: server.js:456-536]
- Sender inactivo → outbox *skipped*: [evidencia: server.js:954-965]
- Senders globales y permisos: [evidencia: server.js:595-598, server.js:1743-1769]
- Selección y fallback de sender por formulario: [evidencia: server.js:600-628]
