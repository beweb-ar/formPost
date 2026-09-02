---
supporthub:
  source_of_truth: false
  audience: internal_support
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
  tags: [runbook, diagnostico, soporte, troubleshooting]
---

# Runbook: los casos que más entran a soporte

Cada caso: qué preguntar, qué mirar y cuál es la causa probable.

## "No me llegan los mails del formulario"

1. ¿Aparece el envío en **Envíos**?
   - **Sí** → el problema es de entrega. Andá a la **Bandeja de Salida** del formulario:
     - `OK` → salió; revisar spam del destinatario y reputación del dominio remitente.
     - `Error` → leer el motivo (credenciales, dominio no verificado, destinatario inválido).
     - `Skipped` → el sender está **desactivado**.
     - Sin entrada → el formulario no tiene sender disponible.
   - **No** → nunca llegó el envío al servidor (revisar `form_id`, dominios permitidos y captcha). Ojo: en instalaciones **anteriores a v1.9.2** un email fallido descartaba el envío, así que salidas en rojo sin envío asociado a la misma hora son datos perdidos por ese bug; desde v1.9.2 el envío se guarda siempre.
2. Si tampoco hay outbox: pedir que envíen el formulario mientras se mira la **Bandeja de Entrada** en vivo. Si no aparece nada, el envío no llega al servidor → revisar `form_id`, dominios permitidos y captcha.

## "Un formulario dejó de enviar y nadie se dio cuenta"

Desde v1.9.2 la tarjeta del formulario muestra un **círculo rojo con `!`** y borde rojo cuando le falta
algo para funcionar. Pasando el mouse (o desplegando la tarjeta) se lee el motivo:

| Problema | Severidad | Qué hacer |
|---|---|---|
| No tiene dirección de destino cargada | error | Cargar el destino en *Editar*. Es el caso que dejaba `No recipients defined` en la salida |
| Dirección de destino inválida | error | Corregir la dirección |
| No tiene un sender utilizable | error | Asignarle un sender, o crear uno para esa cuenta |
| Su sender está desactivado | advertencia | Reactivar el sender en Configuración > Senders |
| Responder-a de la auto-respuesta inválido | advertencia | Corregir o vaciar el campo |

Además, guardar un formulario **sin destino o con un destino inválido** ahora se rechaza, tanto en el
panel como por la API. Un formulario que ya estaba roto igual se puede editar (si no, no habría forma
de arreglarlo): lo que se bloquea es dejarlo roto en esa misma edición.

## "El Test del sender falla con wrong version number"

`SSL routines:...:wrong version number` = el modo TLS no coincide con el puerto: se abrió una conexión
cifrada de entrada (implícita) contra un puerto que arranca en texto plano, o al revés. El caso clásico
es puerto **587 con "Conexión Segura" tildada**.

Desde v1.9.0 formPost deriva el modo del puerto (465 → TLS implícito; 587/2525/25 → STARTTLS) tanto al
guardar como al construir el transporte, así que las configuraciones viejas se corrigen solas sin
volver a guardarlas. Si el error persiste, el sender usa un **puerto no estándar**: ahí manda el tilde,
y hay que probar la otra opción.

## "Un remitente está marcado CAÍDO en el panel"

Es el disyuntor (*circuit breaker*): tras 3 fallos seguidos de nivel remitente, formPost deja de
intentar con ese sender durante 5 minutos y manda todo a su respaldo. El enfriamiento se duplica con
cada recaída, hasta 30 minutos.

1. Pasar el mouse por la etiqueta **CAÍDO** para ver el último error y hasta cuándo dura el enfriamiento.
2. Corregir la causa real (credenciales, firewall de salida, cuota del proveedor).
3. **Reintentar ahora** borra el estado y vuelve a intentar en el próximo mail. No hace falta: una
   verificación en segundo plano prueba la conexión cada minuto y lo reactiva sola cuando responde.
4. El estado es en memoria: reiniciar el proceso también lo limpia.

Umbrales configurables por entorno: `SENDER_FAIL_THRESHOLD` (3), `SENDER_COOLDOWN_MINUTES` (5),
`SENDER_COOLDOWN_MAX_MINUTES` (30).

## "Configuré un respaldo pero no se usó"

El respaldo es solo para fallas **del remitente** (conexión, TLS, credenciales, throttling, 5xx del
proveedor). Si el rechazo es **del mensaje** —destinatario inexistente (550), contenido o adjunto
rechazado, payload inválido en SendGrid (400/413)— no se reintenta, porque el respaldo daría el mismo
resultado. En el log del servidor, cada intento sale como `Send attempt failed` con `reason` y
`willTryBackup`, que dice exactamente cuál de los dos casos fue.

Otras razones para que no se use: el respaldo está **desactivado**, ya no existe (el vínculo se limpia
solo al borrar un sender), o quedó fuera de alcance por un cambio de cuenta.

## "El formulario dice ID de formulario no válido"

Causas por frecuencia: `form_id` mal escrito o de otro entorno; el formulario fue eliminado; se está usando el ID de otra cuenta. Verificar el ID exacto en la tarjeta del panel y en el HTML del sitio.

## "Dice que no se permiten envíos desde este dominio"

El origen del pedido no coincide con ningún elemento de `allowedDomains`. Se compara **origen completo** (esquema+host+puerto). Casos típicos: falta `https://`, `www` vs. sin `www`, entorno de staging no listado, o pruebas desde `file://` (sin origen).

## "El captcha no frena nada" / "sigue entrando spam"

Verificar en orden:
1. ¿El HTML mantiene el `_hp_field` oculto? (si se rediseñó el sitio suele desaparecer).
2. ¿Hay **clave secreta** guardada? Sin ella el captcha no se verifica aunque el tilde esté puesto (la tarjeta del formulario no muestra la línea `Captcha (...)`).
3. ¿El servidor corre con `DEBUG=true`? En ese modo el captcha se saltea siempre.
4. ¿Hay dominios permitidos cargados? Es lo más efectivo contra POST directos.

## "No puedo entrar al panel"

1. ¿Qué método usa? Google, código de un solo uso o contraseña.
2. Google → el usuario debe tener **ese** email cargado (Configuración > Usuarios) y verificado en Google. Sin auto-registro.
3. Código → confirmar el email del usuario; recordar que la pantalla avanza aunque el email no exista, y que hace falta un **sender activo** para poder enviarlo.
4. Contraseña → un superadmin puede resetearla desde Configuración > Usuarios.
5. Si el mensaje es de demasiados intentos: 20 fallidos por 15 minutos (o 7 minutos en el flujo Basic legacy).

## "La bandeja de entrada quedó en Desconectado"

Reintenta sola cada 5 segundos. Si no vuelve: ¿hay más de 20 sesiones del panel abiertas (`Too many connections`)? ¿hay un proxy que corta las conexiones largas (SSE necesita `X-Accel-Buffering: no` y sin buffering)? Los envíos no se pierden: quedan en **Envíos**.

## "Perdí envíos" / "faltan mensajes viejos"

Retención: 1.000 envíos por formulario (los más viejos se descartan junto con sus adjuntos) y 500 entradas de outbox. Recomendar exportar CSV/JSON periódicamente.

## "Los mails salen pero llegan a spam"

formPost entrega al proveedor configurado; el resto es reputación de dominio. Revisar SPF/DKIM/DMARC del dominio del `from`, que el `from` pertenezca al dominio verificado (obligatorio con SendGrid) y evitar remitentes genéricos sin verificar.

## "Después de restaurar un backup no funciona nada de email"

Los secretos están cifrados con la clave del servidor. Si `data/.secret.key` / `ENCRYPTION_KEY` no es la misma, hay que volver a cargar contraseñas SMTP, API keys de SendGrid y tokens de Telegram. La restauración lo avisa en `warnings`.

## "El agente de IA no puede crear cosas"

- `Invalid API key` → clave regenerada o mal copiada.
- `Agent API is disabled...` → el tilde **Habilitada** está apagado (global o de esa cuenta).
- `Your API key is scoped to account X and cannot create accounts` → necesita la clave maestra, o simplemente trabajar dentro de su cuenta.
- `Too many API requests` → 240 pedidos/minuto.

## Cosas que NO se pueden hacer desde el panel (no prometerlas)

- **Reiniciar estadísticas** de un formulario: el endpoint existe pero ningún botón lo invoca [evidencia: verificado a c73bdc5].
- **Tema oscuro**: no hay toggle ni estilos de tema en la UI de este commit, aunque el README lo mencione [evidencia: verificado a c73bdc5].
- **Recuperar contraseña por autogestión**: no hay flujo de "olvidé mi contraseña"; se resuelve con código de un solo uso o con un superadmin.
- **Ver el contenido de un envío en la bandeja de salida**: la outbox guarda destinatario, asunto y estado, no el cuerpo del mail.

## Notas de trazabilidad

- Flujo de envío y puntos de corte: [evidencia: server.js:788-1329]
- Estados de outbox: [evidencia: server.js:954-1040]
- Reconexión SSE y límite de clientes: [evidencia: admin/index.html `connectInbox`, server.js:2351-2392]
- Retenciones: [evidencia: server.js:669-678, server.js:765]
- Ingreso al panel: [evidencia: server.js:3071-3169]
- Aviso de secretos no descifrables al restaurar: [evidencia: server.js:2479-2487]
