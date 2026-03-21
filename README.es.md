<p align="center">
  <img src="logo.png" alt="formPost" height="80" />
</p>

<p align="center">
  Backend en Node.js listo para producción para procesar formularios de contacto.<br/>
  <strong><a href="README.md">Read in English</a></strong>
</p>

<p align="center">
  <img src="screenshot.jpg" alt="Panel de Administración formPost" width="700" />
</p>

<p align="center">
  <strong>Sponsor:</strong>&nbsp;
  <a href="https://beweb.com.ar"><img src="logo_beweb.png" alt="beWeb" height="22" /></a>
</p>

[![Docker](https://img.shields.io/badge/Docker-Listo-blue?logo=docker)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/Licencia-ISC-yellow)](LICENSE)

## Tabla de Contenidos

- [Características](#características)
- [Inicio Rápido](#inicio-rápido)
- [Configuración](#configuración)
- [Variables de Entorno](#variables-de-entorno)
- [Internacionalización (i18n)](#internacionalización-i18n)
- [Panel de Administración](#panel-de-administración)
- [Plantillas de Email](#plantillas-de-email)
- [Ejemplo de Formulario HTML](#ejemplo-de-formulario-html)
- [Referencia de API](#referencia-de-api)
- [Despliegue con Docker](#despliegue-con-docker)
- [Seguridad](#seguridad)
- [Estructura de Archivos](#estructura-de-archivos)
- [Licencia](#licencia)

## Características

### Core
- **Soporte multi-formulario** - Formularios ilimitados, cada uno con su propia configuración
- **Multi-sender SMTP** - Múltiples relays SMTP con toggle activo/desactivado por sender
- **Múltiples destinatarios** - Enviar a varias direcciones email por formulario (separados por coma, UI de chips)
- **Notificaciones por email** - Plantillas HTML personalizadas con inyección dinámica de campos
- **Archivos adjuntos** - Recibe archivos (máx 5, 10 MB cada uno) y los reenvía por email, Discord y Telegram
- **Gestión de plantillas** - Crear, editar y eliminar plantillas desde el panel admin
- **Auto-respuesta** - Email de confirmación automático al remitente, con plantilla seleccionable
- **Formularios sin sender** - Los formularios pueden funcionar solo con notificaciones (Discord, Telegram, Webhook) sin sender SMTP

### Notificaciones
- **Discord** - Webhook opcional por formulario para alertas en tiempo real (con archivos adjuntos)
- **Telegram** - Notificaciones via bot con descubrimiento automático del Chat ID mediante botón "Obtener" (con archivos adjuntos)
- **Webhook genérico** - POST con JSON a cualquier URL en cada envío (Slack, Zapier, n8n, backends custom)

### Protección anti-bot
- **Cloudflare Turnstile / hCaptcha** - Captcha por formulario con selección de proveedor y toggle
- **Honeypot** - Campo oculto (`_hp_field`) que rechaza bots silenciosamente
- **Restricción de dominio** - Envíos solo desde dominios autorizados (por formulario)

### Panel de Administración
- **UI completa** - Gestionar formularios, senders, plantillas, estadísticas, envíos y contraseñas
- **Bandeja de entrada** - Feed en vivo de envíos recibidos via SSE
- **Bandeja de salida** - Feed en vivo de mails y notificaciones enviadas con estado (OK, error, omitido)
- **Log de salida** - Modal paginado con el historial completo de mails y notificaciones por formulario
- **Estadísticas y gráficos** - Contadores de envíos, mails y notificaciones con gráfico de áreas superpuestas
- **Búsqueda de envíos** - Buscar por nombre o email
- **Código de integración** - Código HTML listo para copiar en el modal de edición, con honeypot y captcha
- **Backup / restore** - Exportar e importar configuración completa (formularios, senders, plantillas) como JSON
- **Tema oscuro / claro** - Alternancia persistida en localStorage
- **Internacionalización** - Servidor y panel en Inglés y Español vía variable `LANG`

### Almacenamiento y exportación
- **Envíos** - Almacenamiento en JSON, hasta 1000 por formulario
- **Log de salida** - Registro de mails y notificaciones enviadas (hasta 500 por formulario)
- **Exportación** - CSV o JSON

### Seguridad
- **Limitación de tasa** - Límites separados para envíos, API admin e intentos de login
- **Headers de seguridad** - Helmet con CSP, protección XSS
- **Docker ready** - Build multi-etapa, usuario no-root, health checks

## Inicio Rápido

### Docker Compose (recomendado)

```bash
git clone https://github.com/beweb-ar/formPost.git
cd formPost

# Edita config.json con tu configuración SMTP y de formularios, luego:
docker-compose up -d

# Abre http://localhost:3000/admin
# Credenciales por defecto: admin / changeme123
```

### Desarrollo Local

```bash
npm install
npm run dev    # nodemon con auto-recarga
# o
npm start      # node directo
```

## Configuración

Toda la configuración está en `config.json`. El panel admin puede modificar la mayoría en tiempo real.

```json
{
    "recipients": {
        "mi-form": {
            "to": "tu@email.com, equipo@email.com",
            "subjectPrefix": "Formulario - ",
            "redirectUrl": "https://ejemplo.com/gracias",
            "templatePath": "templates/contact-form.html",
            "captchaEnabled": true,
            "captchaProvider": "turnstile",
            "allowedDomains": ["https://ejemplo.com"],
            "senderId": "default",
            "discordWebhook": "https://discord.com/api/webhooks/...",
            "telegramBotToken": "123456:ABC-DEF...",
            "telegramChatId": "-100123456789",
            "webhookUrl": "https://hooks.ejemplo.com/...",
            "autoReplyEnabled": true,
            "autoReplySubject": "Gracias por tu consulta",
            "autoReplyTemplate": "templates/auto-reply.html"
        }
    },
    "senders": {
        "default": {
            "name": "Default",
            "host": "smtp.ejemplo.com",
            "port": 587,
            "secure": false,
            "active": true,
            "from": "noreply@ejemplo.com",
            "user": "usuario_smtp",
            "pass": "contraseña_smtp"
        }
    },
    "captcha": {
        "mi-form": { "secretKey": "0x4AAAAA..." }
    },
    "cors": {
        "allowedOrigins": ["https://ejemplo.com"]
    },
    "admin": {
        "username": "admin",
        "password": "changeme123"
    }
}
```

### Opciones por formulario

| Campo | Tipo | Descripción |
|---|---|---|
| `to` | string | Email(s) destino, separados por coma para múltiples |
| `subjectPrefix` | string | Prefijo del asunto |
| `redirectUrl` | string | URL de redirección tras envío (opcional) |
| `templatePath` | string | Ruta a la plantilla HTML |
| `captchaEnabled` | boolean | Activar/desactivar captcha |
| `captchaProvider` | string | `"turnstile"` o `"hcaptcha"` |
| `allowedDomains` | string[] | Dominios permitidos. Vacío = todos |
| `senderId` | string | ID del sender a usar (default: `"default"`) |
| `discordWebhook` | string | URL webhook Discord (opcional) |
| `telegramBotToken` | string | Token del Bot de Telegram (opcional) |
| `telegramChatId` | string | Chat ID de Telegram (opcional) |
| `webhookUrl` | string | URL webhook genérico - recibe POST con JSON (opcional) |
| `autoReplyEnabled` | boolean | Enviar auto-respuesta al remitente |
| `autoReplySubject` | string | Asunto del email de auto-respuesta |
| `autoReplyTemplate` | string | Plantilla para la auto-respuesta |

### Opciones de sender

| Campo | Tipo | Descripción |
|---|---|---|
| `name` | string | Nombre / alias |
| `host` | string | Servidor SMTP |
| `port` | number | Puerto SMTP |
| `secure` | boolean | Usar TLS/SSL |
| `active` | boolean | Si es `false`, no se envían emails (config se mantiene) |
| `from` | string | Dirección from |
| `user` | string | Usuario SMTP |
| `pass` | string | Contraseña SMTP |

## Variables de Entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `DEBUG` | `false` | Omite verificación captcha |
| `LANG` | `es` | Idioma (`en` o `es`) |
| `ADMIN_USERNAME` | - | Sobreescribe usuario admin |
| `ADMIN_PASSWORD` | - | Sobreescribe contraseña admin |

## Panel de Administración

**URL:** `http://localhost:3000/admin`

### Dashboard
- **Barra de estado** - Estado, puerto, uptime, memoria, envíos, mails, notificaciones
- **Tarjetas** - Destino, asunto, captcha, dominios, sender, Discord, Telegram, webhook, auto-respuesta, stats
- **Bandeja de entrada** (izquierda) - Envíos recibidos en tiempo real
- **Bandeja de salida** (derecha) - Mails y notificaciones enviadas con estado
- **Gráfico** - Áreas superpuestas de envíos, mails y notificaciones

### Gestión de Formularios
- CRUD completo con múltiples destinatarios (chips)
- Captcha (Turnstile / hCaptcha), Discord, Telegram, webhook
- Auto-respuesta con selección de plantilla
- Sección de integración con código HTML copiable
- Backup y restore desde el modal de Senders

### Envíos
- Tabla paginada (10 por página) con búsqueda por nombre/email
- Detalle, exportar CSV/JSON, eliminar todo

### Log de Salida
- Click en items del outbox abre modal con log paginado completo
- Fecha, canal (Mail/Discord/Telegram), destino, asunto, estado (OK/Error/Omitido)

### Senders
- CRUD con toggle activo/desactivado
- Test de conexión
- Backup / Restore (exporta formularios, senders, plantillas)

## Plantillas de Email

```html
<!-- Modo dinámico -->
<h2>Nuevo envío de {{form_id}}</h2>
<ul>{{fields}}</ul>
```

> Tanto `{{form_id}}` como `{{website_id}}` son soportados por compatibilidad.

Incluye plantilla de auto-respuesta: `templates/auto-reply.html`

## Ejemplo de Formulario HTML

```html
<form action="https://tu-servidor.com/submit" method="POST" enctype="multipart/form-data">
    <input type="hidden" name="form_id" value="mi-form">
    <input type="text" name="_hp_field" style="display:none" tabindex="-1" autocomplete="off">

    <label>Nombre: <input type="text" name="nombre" required></label>
    <label>Email: <input type="email" name="email" required></label>
    <label>Teléfono: <input type="tel" name="telefono"></label>
    <label>Mensaje: <textarea name="mensaje"></textarea></label>

    <!-- Archivos adjuntos (opcional, máx 5 archivos, 10 MB cada uno) -->
    <label>Adjuntos: <input type="file" name="attachments" multiple></label>

    <div class="cf-turnstile" data-sitekey="TU_SITE_KEY"></div>
    <button type="submit">Enviar</button>
</form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

> El campo `website_id` sigue siendo aceptado por compatibilidad, pero se recomienda usar `form_id`.

## Seguridad

| Ámbito | Límite |
|---|---|
| Envíos | 5 por minuto por IP |
| Global por form | 100 por minuto |
| API admin | 30 por minuto por IP |
| Login | 20 por 7 minutos (solo fallos) |
| Archivos adjuntos | Máx 5 archivos, 10 MB cada uno |
| Tipos bloqueados | `.exe`, `.bat`, `.cmd`, `.sh`, `.ps1`, `.msi`, `.dll`, `.com`, `.scr`, `.pif`, `.vbs`, `.js`, `.jar`, `.cpl`, `.inf`, `.reg` |

## Estructura de Archivos

```
formPost/
├── server.js                       # Aplicación principal
├── config.json                     # Configuración
├── admin/
│   └── index.html                  # Panel admin (SPA)
├── templates/
│   ├── contact-form.html           # Plantilla email por defecto
│   └── auto-reply.html             # Plantilla auto-respuesta
└── data/
    ├── submissions-{formId}.json   # Envíos almacenados
    └── outbox-{formId}.json        # Log de mails/notificaciones
```

## Licencia

ISC
