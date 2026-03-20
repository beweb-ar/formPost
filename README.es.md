<p align="center">
  <img src="logo.png" alt="formPost" height="80" />
</p>

<p align="center">
  Backend en Node.js listo para producción para procesar formularios de contacto.<br/>
  <strong><a href="README.md">Read in English</a></strong>
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
- [Solución de Problemas](#solución-de-problemas)
- [Licencia](#licencia)

## Características

- **Soporte multi-formulario** - Maneja formularios ilimitados, cada uno con su propia configuración
- **Notificaciones por email** - Plantillas HTML personalizadas por formulario con inyección dinámica de campos
- **Cloudflare Turnstile** - Protección anti-bot por formulario con switch de activación/desactivación
- **Restricción de dominio** - Permitir envíos solo desde dominios autorizados (por formulario)
- **Almacenamiento de envíos** - Almacenamiento en archivos JSON, hasta 1000 envíos por formulario
- **Exportación** - Descarga de envíos en CSV o JSON
- **Panel de administración** - Interfaz web completa para gestionar formularios, SMTP, estadísticas, envíos y contraseñas
- **Bandeja de entrada en tiempo real** - Feed en vivo de nuevos envíos via SSE
- **Internacionalización** - Servidor y panel disponibles en Inglés y Español vía variable `LANG`
- **Estadísticas** - Contadores por formulario y total global de envíos
- **Tema oscuro / claro** - Alternancia en el panel, persistido en localStorage
- **Limitación de tasa** - Límites separados para envíos, API de admin e intentos de login
- **Headers de seguridad** - Middleware Helmet con CSP, protección XSS
- **Listo para Docker** - Build multi-etapa, usuario no-root, health checks, límites de recursos

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

El panel de administración está disponible en `http://localhost:3000/admin`.

## Configuración

Toda la configuración está en `config.json`. El panel de admin puede modificar la mayoría en tiempo real.

```json
{
    "recipients": {
        "mi-formulario": {
            "to": "tu@email.com",
            "subjectPrefix": "Formulario de Contacto - ",
            "redirectUrl": "https://ejemplo.com/gracias",
            "templatePath": "email-template.html",
            "turnstileEnabled": true,
            "allowedDomains": ["https://ejemplo.com", "https://www.ejemplo.com"]
        }
    },
    "statistics": {
        "mi-formulario": {
            "successfulSubmissions": 0,
            "lastSubmission": null
        }
    },
    "smtp": {
        "host": "smtp.ejemplo.com",
        "port": 587,
        "secure": false,
        "from": "noreply@ejemplo.com",
        "user": "usuario_smtp",
        "pass": "contraseña_smtp"
    },
    "turnstile": {
        "mi-formulario": {
            "secretKey": "0x4AAAAA..."
        }
    },
    "cors": {
        "allowedOrigins": [
            "https://ejemplo.com"
        ]
    },
    "admin": {
        "username": "admin",
        "password": "changeme123"
    }
}
```

### Secciones

| Sección | Descripción |
|---|---|
| `recipients` | Una entrada por formulario: email destino, prefijo de asunto, URL de redirección, ruta de plantilla, toggle de turnstile, dominios permitidos |
| `statistics` | Contadores y timestamps de envíos por formulario (gestionado automáticamente) |
| `smtp` | Configuración del servidor SMTP (host, port, secure, from, user, pass) |
| `turnstile` | Clave secreta de Cloudflare Turnstile por formulario (opcional) |
| `cors` | Array de orígenes permitidos para CORS (debe incluir protocolo) |
| `admin` | Credenciales del panel de administración |

### Opciones por formulario

| Campo | Tipo | Descripción |
|---|---|---|
| `to` | string | Email de destino |
| `subjectPrefix` | string | Prefijo del asunto del email |
| `redirectUrl` | string | URL de redirección tras envío exitoso (opcional) |
| `templatePath` | string | Ruta al archivo HTML de plantilla de email |
| `turnstileEnabled` | boolean | Activar/desactivar verificación Turnstile (default: `true` si existe la clave) |
| `allowedDomains` | string[] | Lista de dominios de origen permitidos. Vacío = permitir todos |

## Variables de Entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `DEBUG` | `false` | Cuando es `true`, omite verificación Turnstile (para pruebas) |
| `LANG` | `es` | Idioma de la interfaz y mensajes del servidor (`en` o `es`) |
| `ADMIN_USERNAME` | - | Sobreescribe el usuario admin de config.json |
| `ADMIN_PASSWORD` | - | Sobreescribe la contraseña admin de config.json |
| `SMTP_HOST` | - | Sobreescribe host SMTP |
| `SMTP_PORT` | - | Sobreescribe puerto SMTP |
| `SMTP_SECURE` | - | Sobreescribe flag secure SMTP |
| `SMTP_FROM` | - | Sobreescribe dirección from SMTP |
| `SMTP_USER` | - | Sobreescribe usuario SMTP |
| `SMTP_PASS` | - | Sobreescribe contraseña SMTP |

## Internacionalización (i18n)

La aplicación soporta **Inglés** (`en`) y **Español** (`es`).

```bash
# Español (por defecto)
LANG=es

# Inglés
LANG=en
```

- **Si `LANG` no está definida, se usa Español por defecto.**
- El servidor traduce todos los mensajes de respuesta (errores de validación, respuestas de API, mensajes de autenticación).
- El panel de admin detecta el idioma desde el servidor y aplica traducciones a todos los labels, botones, toasts, diálogos de confirmación y elementos de la barra de estado.

En Docker Compose, agrégalo a `environment`:

```yaml
environment:
  - LANG=es
```

## Panel de Administración

**URL:** `http://localhost:3000/admin`

### Dashboard

- **Barra de estado** - Estado del servidor, puerto, tiempo activo, memoria, cantidad de formularios, **total de envíos** (global)
- **Tarjetas de formularios** - Cada formulario muestra: email destino, asunto, redirección, plantilla, estado de Turnstile, dominios permitidos, cantidad de envíos, fecha del último envío
- **Bandeja de entrada en tiempo real** - Feed en vivo de nuevos envíos via SSE
- **Tema oscuro/claro** alternante

### Gestión de Formularios

- Agregar, editar y eliminar configuraciones de formularios
- Activar/desactivar verificación Turnstile por formulario
- Configurar dominios permitidos por formulario (restringir qué orígenes pueden enviar)
- Los cambios se guardan en `config.json` inmediatamente

### Envíos (Submissions)

- Tabla paginada por formulario (50 por página)
- Click en cualquier fila para ver el detalle completo
- **Exportar CSV** o **Exportar JSON**
- **Eliminar todos** los envíos de un formulario
- Direcciones IP anonimizadas (último octeto enmascarado)

### Estadísticas

- Conteo de envíos y fecha del último envío por formulario
- **Total de envíos** de todos los formularios en la barra de estado
- Reiniciar estadísticas por formulario

### Configuración

- Editar configuración SMTP (credenciales enmascaradas en la visualización)
- Cambiar contraseña de admin (requiere contraseña actual, mínimo 8 caracteres)

## Plantillas de Email

Las plantillas son archivos HTML con marcadores. Dos modos:

### Modo dinámico (recomendado)

Usa `{{fields}}` para auto-generar una lista de todos los campos enviados:

```html
<h2>Nuevo envío de {{website_id}}</h2>
<div>{{fields}}</div>
```

### Modo legacy

Usa marcadores individuales `{{nombre_campo}}`:

```html
<p><strong>Nombre:</strong> {{nombre}}</p>
<p><strong>Email:</strong> {{email}}</p>
<p><strong>Mensaje:</strong> {{mensaje}}</p>
```

Los nombres de campos se convierten automáticamente a labels: `correo_electronico` se muestra como `Correo Electronico`.

Si una plantilla no existe o no se puede leer, el servidor genera un email HTML básico automáticamente.

## Ejemplo de Formulario HTML

```html
<form action="https://tu-servidor.com/submit" method="POST">
    <input type="hidden" name="website_id" value="mi-formulario">
    <label>Nombre: <input type="text" name="nombre" required></label>
    <label>Email: <input type="email" name="email" required></label>
    <label>Mensaje: <textarea name="mensaje"></textarea></label>

    <!-- Cloudflare Turnstile (opcional, solo si está configurado y activado) -->
    <div class="cf-turnstile" data-sitekey="TU_SITE_KEY"></div>

    <button type="submit">Enviar</button>
</form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

### Restricciones del formulario

- `website_id` (requerido) - Debe coincidir con una clave en `config.recipients`
- Máximo 30 campos por envío
- Máximo 100 caracteres por nombre de campo
- Máximo 5000 caracteres por valor de campo
- Los campos de email se validan (email, correo, e_mail)

## Referencia de API

### Públicos

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/submit` | Procesar un envío de formulario |
| `GET` | `/health` | Health check (sin autenticación) |

### Admin (requiere Basic Auth)

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/admin/api/status` | Estado del servidor, uptime, memoria, total envíos, idioma |
| `GET` | `/admin/api/websites` | Listar todas las configuraciones de formularios |
| `POST` | `/admin/api/websites` | Crear un nuevo formulario |
| `PUT` | `/admin/api/websites/:id` | Actualizar un formulario |
| `DELETE` | `/admin/api/websites/:id` | Eliminar un formulario |
| `GET` | `/admin/api/smtp` | Obtener config SMTP (credenciales enmascaradas) |
| `PUT` | `/admin/api/smtp` | Actualizar config SMTP |
| `GET` | `/admin/api/statistics` | Estadísticas de todos los formularios |
| `GET` | `/admin/api/statistics/:id` | Estadísticas de un formulario |
| `PUT` | `/admin/api/statistics/:id/reset` | Reiniciar estadísticas de un formulario |
| `GET` | `/admin/api/submissions/:id` | Envíos paginados (`?page=1&limit=50`) |
| `DELETE` | `/admin/api/submissions/:id` | Eliminar todos los envíos de un formulario |
| `GET` | `/admin/api/submissions/:id/export` | Exportar envíos (`?format=json` o `csv`) |
| `PUT` | `/admin/api/admin/reset-password` | Cambiar contraseña de admin |

## Despliegue con Docker

### docker-compose.yml

```bash
docker-compose up -d       # Iniciar
docker-compose logs -f     # Ver logs
docker-compose down        # Detener
docker-compose restart     # Reiniciar (necesario al editar config.json manualmente)
```

### Docker Manual

```bash
docker build -t formpost .

docker run -d \
  --name formpost \
  -p 3000:3000 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=contraseña_segura \
  -e LANG=es \
  -v ./config.json:/app/config.json \
  -v ./data:/app/data \
  --restart always \
  formpost
```

### Características Docker

- **Build multi-etapa** - Imagen final ~150MB (Alpine + dependencias de producción)
- **Usuario no-root** - Ejecuta como `nodeuser` (UID 1001)
- **Health check** - `/health` cada 30s, reinicio automático en falla
- **Límites de recursos** - 512MB máximo, 128MB reservados
- **no-new-privileges** - Previene escalación de privilegios
- **Volúmenes** - `config.json`, `data/` (envíos)

## Seguridad

### Limitación de Tasa

| Ámbito | Límite |
|---|---|
| Envíos de formularios | 5 por minuto por IP |
| API de admin | 30 por minuto por IP |
| Intentos de login | 10 por 15 minutos (solo fallos) |

### Validación de Entrada

- Cuerpo de request limitado a 100KB
- Máximo 30 campos, 5000 chars por valor, 100 chars por clave
- Validación de email con límite de 254 caracteres
- Escape de HTML en plantillas y envíos (prevención XSS)

### Restricción de Dominio

- `allowedDomains` por formulario valida el header `Origin` en los envíos
- Rechaza peticiones de dominios no autorizados con 403

### Headers y Protecciones

- Helmet con CSP, filtro XSS, HSTS, frameguard
- CORS con orígenes permitidos configurables
- Anonimización de IP en envíos almacenados (último octeto enmascarado)
- Credenciales de admin nunca expuestas en respuestas de API
- Credenciales SMTP enmascaradas en endpoint de estado

## Estructura de Archivos

```
formPost/
├── server.js                       # Aplicación principal
├── config.json                     # Configuración (gestionada por el panel admin)
├── package.json                    # Dependencias
├── Dockerfile                      # Build Docker multi-etapa
├── docker-compose.yml              # Configuración Docker Compose
├── README.md                       # Documentación (Inglés)
├── README.es.md                    # Documentación (Español)
├── LICENSE                         # Licencia ISC
├── logo.png                        # Logo de la aplicación
├── fav-icon.png                    # Favicon
├── email-template.html             # Plantilla de email por defecto
├── email-template-*.html           # Plantillas por formulario
├── admin/
│   └── index.html                  # Panel de administración (SPA single-file)
└── data/
    └── submissions-{formId}.json   # Envíos almacenados por formulario
```

## Solución de Problemas

### Los emails no se envían

1. Verifica las credenciales SMTP en config.json o vía el panel admin
2. Verifica que el firewall permite conexiones SMTP salientes
3. Revisa los logs: `docker-compose logs -f`

### Verificación Turnstile fallando

1. Verifica que el site key coincide con el dominio en Cloudflare
2. Verifica que el secret key en config.json sea correcto
3. Asegúrate que `turnstileEnabled` esté en `true` para el formulario
4. Usa `DEBUG=true` para omitir Turnstile durante pruebas

### Errores CORS

1. Agrega el origen exacto a `cors.allowedOrigins` (incluye `https://`)
2. Reinicia el contenedor después de editar config.json manualmente

### Restricción de dominio bloqueando envíos

1. Verifica que `allowedDomains` en la config del formulario incluya el origen
2. Asegúrate que el origen incluya el protocolo (ej: `https://ejemplo.com`)
3. Elimina `allowedDomains` o déjalo vacío para permitir todos los orígenes
