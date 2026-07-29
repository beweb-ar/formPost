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
   - **No** → o nunca llegó el envío, o **falló el email y por eso no se guardó** (ver [Flujo de un envío](flujo-de-un-envio.md), paso 11). Confirmar mirando si hay una entrada de outbox en rojo a esa hora.
2. Si tampoco hay outbox: pedir que envíen el formulario mientras se mira la **Bandeja de Entrada** en vivo. Si no aparece nada, el envío no llega al servidor → revisar `form_id`, dominios permitidos y captcha.

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
