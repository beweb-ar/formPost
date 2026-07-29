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
  tags: [login, ingreso, google, otp, codigo, contraseña, sesion]
---

# Entrar al panel: con Google, con un código o con contraseña

> Este documento describe el ingreso de la versión **1.6.0**, correspondiente a cambios de código posteriores al commit registrado arriba (todavía sin commitear al momento de generar la KB). Verificar contra la app productiva antes de publicarlo.

## Qué vas a lograr

Entrar a `/admin` por cualquiera de las tres puertas, y saber qué hacer cuando alguna no funciona.

Las tres llevan al mismo usuario y a los mismos permisos. **No hay auto-registro**: tu email tiene que estar cargado en un usuario que ya exista; si no, el ingreso se rechaza.

## Cómo entrar con Google (acceder con Google / iniciar sesión con mi cuenta de Google)

1. Abrí `https://TU-SERVIDOR/admin`.
2. Tocá **Acceder con Google** (arriba de todo).
3. Elegí tu cuenta de Google en la ventana que abre Google.
4. Entrás directo al panel.

Requisitos: que tu usuario en formPost tenga cargado **ese mismo email**, y que el email esté verificado en Google [evidencia: server.js:1567-1594, server.js:3153-3169].

Si el botón no aparece, este servidor no tiene configurado el ingreso con Google: usá contraseña o código.

## Cómo entrar sin contraseña, con un código que llega por mail (código de un solo uso / OTP)

Sirve cuando no te acordás la contraseña o preferís no usarla.

1. En la pantalla de ingreso, tocá **Ingresar con un código de un solo uso**.
2. Escribí tu **email** y tocá **Enviarme un código**.
3. Revisá tu casilla: llega un mail de formPost con un número de **6 dígitos** (asunto: *Tu código de acceso a formPost*).
4. Escribí el código y tocá **Ingresar**.

Cosas para tener en cuenta:

- El código **vale 10 minutos** y **sirve una sola vez** [evidencia: server.js:1507].
- Tenés **3 intentos** por código; al cuarto hay que pedir uno nuevo [evidencia: server.js:1508, server.js:3138-3142].
- Podés pedir hasta **5 códigos por hora** con el mismo email [evidencia: server.js:1509].
- La pantalla siempre avanza al paso del código, exista o no ese email: es a propósito, para no revelar qué emails están dados de alta [evidencia: server.js:3105-3109].

## Cómo entrar con email y contraseña (el método de siempre)

1. Escribí tu **email** y tu **contraseña**.
2. Tocá **Ingresar**.

Si venías usando tu nombre de usuario en vez del email, **sigue funcionando**: el campo acepta las dos cosas [evidencia: server.js:1497-1503, server.js:3081-3098].

## Cuánto dura la sesión

La sesión dura **12 horas** y se guarda solo en esa pestaña del navegador: si la cerrás, hay que volver a ingresar [evidencia: server.js:1443, admin/index.html — `sessionStorage`].

Cuando vence, el panel te devuelve a la pantalla de ingreso con el mensaje `Tu sesión expiró. Ingresá de nuevo.`

## Cómo cargar el email de un usuario (para que pueda usar Google o el código)

Lo hace un superadmin, en **Configuración > Usuarios**:

1. **Editar** en el usuario (o **+ Nuevo Usuario**).
2. Completá el campo **Email**.
3. **Save**.

Cada email puede pertenecer a un solo usuario. Ver [Usuarios y roles](../client_admin/usuarios-y-roles.md).

## Errores frecuentes

- **"Credenciales inválidas."** → email/usuario o contraseña incorrectos.
- **"No existe un usuario con ese email. Pedile a tu administrador que lo cree — no hay auto-registro."** → te autenticaste bien en Google, pero ese email no está cargado en ningún usuario de formPost. Que un superadmin lo agregue en Configuración > Usuarios.
- **"Tu email de Google no está verificado."** → verificá el email en tu cuenta de Google y reintentá.
- **"No se pudo validar el ingreso con Google."** → el ingreso con Google falló (token vencido o problema de configuración del servidor). Probá de nuevo o entrá con contraseña.
- **"El ingreso con Google no está habilitado en este servidor."** → falta configurar el client id de Google; usá contraseña o código.
- **"Código inválido."** → el número no coincide, ya se usó o ya se pidió otro más nuevo. Pedí uno nuevo.
- **"El código expiró — pedí uno nuevo."** → pasaron más de 10 minutos.
- **"Demasiados intentos con este código — pedí uno nuevo."** → tres intentos fallidos; el código se quemó.
- **"Pediste demasiados códigos. Probá de nuevo más tarde."** → más de 5 pedidos en una hora con ese email.
- **"No se puede enviar el código: no hay ningún sender de email configurado."** → el servidor no tiene remitente activo para mandar el mail. Entrá con contraseña y configurá un sender (ver [Remitentes de email](remitentes-de-email.md)).
- **"No pudimos enviar el código por email. Probá de nuevo en unos minutos."** → el remitente falló al enviar; revisá la configuración del sender.
- **"Too many login attempts. Please try again later."** → 20 intentos fallidos en 15 minutos desde tu conexión; esperá y reintentá [evidencia: server.js:3050-3058].
- **No me llega el código** → revisá spam; confirmá con tu administrador que tu usuario tiene **ese** email cargado (si el email no existe, la pantalla igual avanza y nunca llega nada).

## Notas de trazabilidad (para revisión, no para el usuario)

- Pantalla de ingreso con los tres modos: [evidencia: admin/index.html, bloque `loginOverlay`]
- Endpoints públicos de ingreso: [evidencia: server.js:3071-3169]
- Token de sesión firmado (HMAC con la clave de cifrado del servidor, 12 h): [evidencia: server.js:1443-1475]
- Verificación del token de Google contra `oauth2.googleapis.com/tokeninfo` y control de `aud`/`azp`: [evidencia: server.js:1567-1594]
- Sin auto-registro (usuario debe existir): [evidencia: server.js:3161-3166]
- Reglas del código de un solo uso (TTL, intentos, pedidos por hora): [evidencia: server.js:1507-1530]
- Respuesta genérica 202 para no filtrar emails: [evidencia: server.js:3105-3109]
- Compatibilidad con ingreso por nombre de usuario: [evidencia: server.js:1497-1503]
