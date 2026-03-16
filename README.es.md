# Servidor de Formularios (Form Backend)

> **[Read in English](README.md)**

Backend en Node.js listo para producci\u00f3n para procesar formularios de contacto de sitios web. Soporta m\u00faltiples sitios, notificaciones por email con plantillas HTML personalizadas, protecci\u00f3n anti-bot con Cloudflare Turnstile, almacenamiento de env\u00edos con exportaci\u00f3n, panel de administraci\u00f3n completo e interfaz biling\u00fce (Ingl\u00e9s / Espa\u00f1ol).

[![Docker](https://img.shields.io/badge/Docker-Listo-blue?logo=docker)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/Licencia-ISC-yellow)](LICENSE)

## Tabla de Contenidos

- [Caracter\u00edsticas](#caracter\u00edsticas)
- [Inicio R\u00e1pido](#inicio-r\u00e1pido)
- [Configuraci\u00f3n](#configuraci\u00f3n)
- [Variables de Entorno](#variables-de-entorno)
- [Internacionalizaci\u00f3n (i18n)](#internacionalizaci\u00f3n-i18n)
- [Panel de Administraci\u00f3n](#panel-de-administraci\u00f3n)
- [Plantillas de Email](#plantillas-de-email)
- [Ejemplo de Formulario HTML](#ejemplo-de-formulario-html)
- [Referencia de API](#referencia-de-api)
- [Despliegue con Docker](#despliegue-con-docker)
- [Seguridad](#seguridad)
- [Estructura de Archivos](#estructura-de-archivos)
- [Soluci\u00f3n de Problemas](#soluci\u00f3n-de-problemas)
- [Licencia](#licencia)

## Caracter\u00edsticas

- **Soporte multi-sitio** - Maneja formularios de m\u00faltiples sitios web, cada uno con su propia configuraci\u00f3n
- **Notificaciones por email** - Plantillas HTML personalizadas por sitio con inyecci\u00f3n din\u00e1mica de campos
- **Cloudflare Turnstile** - Protecci\u00f3n anti-bot por sitio (opcional)
- **Almacenamiento de env\u00edos** - Almacenamiento en archivos JSON, hasta 1000 env\u00edos por sitio
- **Exportaci\u00f3n** - Descarga de env\u00edos en CSV o JSON
- **Panel de administraci\u00f3n** - Interfaz web completa para gestionar sitios, SMTP, estad\u00edsticas, env\u00edos y contrase\u00f1as
- **Internacionalizaci\u00f3n** - Servidor y panel disponibles en Ingl\u00e9s y Espa\u00f1ol v\u00eda variable `LANG`
- **Estad\u00edsticas** - Contadores por sitio y total global de env\u00edos
- **Tema oscuro / claro** - Alternancia en el panel, persistido en localStorage
- **Limitaci\u00f3n de tasa** - L\u00edmites separados para env\u00edos, API de admin e intentos de login
- **Headers de seguridad** - Middleware Helmet con CSP, protecci\u00f3n XSS
- **Listo para Docker** - Build multi-etapa, usuario no-root, health checks, l\u00edmites de recursos

## Inicio R\u00e1pido

### Docker Compose (recomendado)

```bash
git clone https://github.com/c0deirl/formbackend.git
cd formbackend

# Edita config.json con tu configuraci\u00f3n SMTP y de sitios, luego:
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

El panel de administraci\u00f3n est\u00e1 disponible en `http://localhost:3000/admin`.

## Configuraci\u00f3n

Toda la configuraci\u00f3n est\u00e1 en `config.json`. El panel de admin puede modificar la mayor\u00eda en tiempo real.

```json
{
    "recipients": {
        "mi-sitio": {
            "to": "tu@email.com",
            "subjectPrefix": "Formulario de Contacto - ",
            "redirectUrl": "https://ejemplo.com/gracias",
            "templatePath": "email-template.html"
        }
    },
    "statistics": {
        "mi-sitio": {
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
        "pass": "contrase\u00f1a_smtp"
    },
    "turnstile": {
        "mi-sitio": {
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

| Secci\u00f3n | Descripci\u00f3n |
|---|---|
| `recipients` | Una entrada por sitio: email destino, prefijo de asunto, URL de redirecci\u00f3n, ruta de plantilla |
| `statistics` | Contadores y timestamps de env\u00edos por sitio (gestionado autom\u00e1ticamente) |
| `smtp` | Configuraci\u00f3n del servidor SMTP (host, port, secure, from, user, pass) |
| `turnstile` | Clave secreta de Cloudflare Turnstile por sitio (opcional) |
| `cors` | Array de or\u00edgenes permitidos (debe incluir protocolo) |
| `admin` | Credenciales del panel de administraci\u00f3n |

## Variables de Entorno

| Variable | Default | Descripci\u00f3n |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `DEBUG` | `false` | Cuando es `true`, omite verificaci\u00f3n Turnstile (para pruebas) |
| `LANG` | `es` | Idioma de la interfaz y mensajes del servidor (`en` o `es`) |
| `ADMIN_USERNAME` | - | Sobreescribe el usuario admin de config.json |
| `ADMIN_PASSWORD` | - | Sobreescribe la contrase\u00f1a admin de config.json |
| `SMTP_HOST` | - | Sobreescribe host SMTP |
| `SMTP_PORT` | - | Sobreescribe puerto SMTP |
| `SMTP_SECURE` | - | Sobreescribe flag secure SMTP |
| `SMTP_FROM` | - | Sobreescribe direcci\u00f3n from SMTP |
| `SMTP_USER` | - | Sobreescribe usuario SMTP |
| `SMTP_PASS` | - | Sobreescribe contrase\u00f1a SMTP |

## Internacionalizaci\u00f3n (i18n)

La aplicaci\u00f3n soporta **Ingl\u00e9s** (`en`) y **Espa\u00f1ol** (`es`).

```bash
# Espa\u00f1ol (por defecto)
LANG=es

# Ingl\u00e9s
LANG=en
```

- **Si `LANG` no est\u00e1 definida, se usa Espa\u00f1ol por defecto.**
- El servidor traduce todos los mensajes de respuesta (errores de validaci\u00f3n, respuestas de API, mensajes de autenticaci\u00f3n).
- El panel de admin detecta el idioma desde el servidor y aplica traducciones a todos los labels, botones, toasts, di\u00e1logos de confirmaci\u00f3n y elementos de la barra de estado.

En Docker Compose, agr\u00e9galo a `environment`:

```yaml
environment:
  - LANG=es
```

## Panel de Administraci\u00f3n

**URL:** `http://localhost:3000/admin`

### Dashboard

- **Barra de estado** - Estado del servidor, puerto, tiempo activo, memoria, cantidad de sitios, **total de env\u00edos** (global)
- **Tarjetas de sitios** - Cada sitio muestra: email destino, asunto, redirecci\u00f3n, plantilla, estado de Turnstile, cantidad de env\u00edos, fecha del \u00faltimo env\u00edo
- **Tema oscuro/claro** alternante

### Gesti\u00f3n de Sitios

- Agregar, editar y eliminar configuraciones de sitios
- Los cambios se guardan en `config.json` inmediatamente

### Env\u00edos (Submissions)

- Tabla paginada por sitio (50 por p\u00e1gina)
- Click en cualquier fila para ver el detalle JSON completo
- **Exportar CSV** o **Exportar JSON**
- **Eliminar todos** los env\u00edos de un sitio
- Direcciones IP anonimizadas (\u00faltimo octeto enmascarado)

### Estad\u00edsticas

- Conteo de env\u00edos y fecha del \u00faltimo env\u00edo por sitio
- **Total de env\u00edos** de todos los sitios en la barra de estado
- Reiniciar estad\u00edsticas por sitio

### Configuraci\u00f3n

- Editar configuraci\u00f3n SMTP (credenciales enmascaradas en la visualizaci\u00f3n)
- Cambiar contrase\u00f1a de admin (requiere contrase\u00f1a actual, m\u00ednimo 8 caracteres)

## Plantillas de Email

Las plantillas son archivos HTML con marcadores. Dos modos:

### Modo din\u00e1mico (recomendado)

Usa `{{fields}}` para auto-generar una lista de todos los campos enviados:

```html
<h2>Nuevo env\u00edo de {{website_id}}</h2>
<div>{{fields}}</div>
```

### Modo legacy

Usa marcadores individuales `{{nombre_campo}}`:

```html
<p><strong>Nombre:</strong> {{nombre}}</p>
<p><strong>Email:</strong> {{email}}</p>
<p><strong>Mensaje:</strong> {{mensaje}}</p>
```

Los nombres de campos se convierten autom\u00e1ticamente a labels: `correo_electronico` se muestra como `Correo Electronico`.

Si una plantilla no existe o no se puede leer, el servidor genera un email HTML b\u00e1sico autom\u00e1ticamente.

## Ejemplo de Formulario HTML

```html
<form action="https://tu-servidor.com/submit" method="POST">
    <input type="hidden" name="website_id" value="mi-sitio">
    <label>Nombre: <input type="text" name="nombre" required></label>
    <label>Email: <input type="email" name="email" required></label>
    <label>Mensaje: <textarea name="mensaje"></textarea></label>

    <!-- Cloudflare Turnstile (opcional, solo si est\u00e1 configurado) -->
    <div class="cf-turnstile" data-sitekey="TU_SITE_KEY"></div>

    <button type="submit">Enviar</button>
</form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

### Restricciones del formulario

- `website_id` (requerido) - Debe coincidir con una clave en `config.recipients`
- M\u00e1ximo 30 campos por env\u00edo
- M\u00e1ximo 100 caracteres por nombre de campo
- M\u00e1ximo 5000 caracteres por valor de campo
- Los campos de email se validan (email, correo, e_mail)

## Referencia de API

### P\u00fablicos

| M\u00e9todo | Endpoint | Descripci\u00f3n |
|---|---|---|
| `POST` | `/submit` | Procesar un env\u00edo de formulario |
| `GET` | `/health` | Health check (sin autenticaci\u00f3n) |

### Admin (requiere Basic Auth)

| M\u00e9todo | Endpoint | Descripci\u00f3n |
|---|---|---|
| `GET` | `/admin/api/status` | Estado del servidor, uptime, memoria, total env\u00edos, idioma |
| `GET` | `/admin/api/websites` | Listar todas las configuraciones de sitios |
| `POST` | `/admin/api/websites` | Crear un nuevo sitio |
| `PUT` | `/admin/api/websites/:id` | Actualizar un sitio |
| `DELETE` | `/admin/api/websites/:id` | Eliminar un sitio |
| `GET` | `/admin/api/smtp` | Obtener config SMTP (credenciales enmascaradas) |
| `PUT` | `/admin/api/smtp` | Actualizar config SMTP |
| `GET` | `/admin/api/statistics` | Estad\u00edsticas de todos los sitios |
| `GET` | `/admin/api/statistics/:id` | Estad\u00edsticas de un sitio |
| `PUT` | `/admin/api/statistics/:id/reset` | Reiniciar estad\u00edsticas de un sitio |
| `GET` | `/admin/api/submissions/:id` | Env\u00edos paginados (`?page=1&limit=50`) |
| `DELETE` | `/admin/api/submissions/:id` | Eliminar todos los env\u00edos de un sitio |
| `GET` | `/admin/api/submissions/:id/export` | Exportar env\u00edos (`?format=json` o `csv`) |
| `PUT` | `/admin/api/admin/reset-password` | Cambiar contrase\u00f1a de admin |

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
docker build -t form-processor .

docker run -d \
  --name form-processor \
  -p 3000:3000 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=contrase\u00f1a_segura \
  -e LANG=es \
  -v ./config.json:/app/config.json \
  -v ./data:/app/data \
  --restart always \
  form-processor
```

### Caracter\u00edsticas Docker

- **Build multi-etapa** - Imagen final ~150MB (Alpine + dependencias de producci\u00f3n)
- **Usuario no-root** - Ejecuta como `nodeuser` (UID 1001)
- **Health check** - `/health` cada 30s, reinicio autom\u00e1tico en falla
- **L\u00edmites de recursos** - 512MB m\u00e1ximo, 128MB reservados
- **no-new-privileges** - Previene escalaci\u00f3n de privilegios
- **Vol\u00famenes** - `config.json`, `data/` (env\u00edos), `templates/` (opcional)

## Seguridad

### Limitaci\u00f3n de Tasa

| \u00c1mbito | L\u00edmite |
|---|---|
| Env\u00edos de formularios | 5 por minuto por IP |
| API de admin | 30 por minuto por IP |
| Intentos de login | 10 por 15 minutos (solo fallos) |

### Validaci\u00f3n de Entrada

- Cuerpo de request limitado a 100KB
- M\u00e1ximo 30 campos, 5000 chars por valor, 100 chars por clave
- Validaci\u00f3n de email con l\u00edmite de 254 caracteres
- Escape de HTML en plantillas y env\u00edos (prevenci\u00f3n XSS)

### Headers y Protecciones

- Helmet con CSP, filtro XSS, HSTS, frameguard
- CORS con or\u00edgenes permitidos configurables
- Anonimizaci\u00f3n de IP en env\u00edos almacenados (\u00faltimo octeto enmascarado)
- Credenciales de admin nunca expuestas en respuestas de API
- Credenciales SMTP enmascaradas en endpoint de estado

## Estructura de Archivos

```
formbackend/
\u251c\u2500\u2500 server.js                       # Aplicaci\u00f3n principal
\u251c\u2500\u2500 config.json                     # Configuraci\u00f3n (gestionada por el panel admin)
\u251c\u2500\u2500 package.json                    # Dependencias
\u251c\u2500\u2500 Dockerfile                      # Build Docker multi-etapa
\u251c\u2500\u2500 docker-compose.yml              # Configuraci\u00f3n Docker Compose
\u251c\u2500\u2500 README.md                       # Documentaci\u00f3n (Ingl\u00e9s)
\u251c\u2500\u2500 README.es.md                    # Documentaci\u00f3n (Espa\u00f1ol)
\u251c\u2500\u2500 LICENSE                         # Licencia ISC
\u251c\u2500\u2500 logo.png                        # Logo de la aplicaci\u00f3n
\u251c\u2500\u2500 email-template.html             # Plantilla de email por defecto
\u251c\u2500\u2500 email-template-website-*.html   # Plantillas por sitio
\u251c\u2500\u2500 admin/
\u2502   \u2514\u2500\u2500 index.html                  # Panel de administraci\u00f3n (SPA single-file)
\u2514\u2500\u2500 data/
    \u2514\u2500\u2500 submissions-{websiteId}.json # Env\u00edos almacenados por sitio
```

## Soluci\u00f3n de Problemas

### Los emails no se env\u00edan

1. Verifica las credenciales SMTP en config.json o v\u00eda el panel admin
2. Verifica que el firewall permite conexiones SMTP salientes
3. Revisa los logs: `docker-compose logs -f`

### Verificaci\u00f3n Turnstile fallando

1. Verifica que el site key coincide con el dominio en Cloudflare
2. Verifica que el secret key en config.json sea correcto
3. Usa `DEBUG=true` para omitir Turnstile durante pruebas

### Errores CORS

1. Agrega el origen exacto a `cors.allowedOrigins` (incluye `https://`)
2. Reinicia el contenedor despu\u00e9s de editar config.json manualmente

### Estad\u00edsticas no se actualizan

1. Aseg\u00farate que Turnstile pasa (o `DEBUG=true`)
2. Verifica permisos de archivos en `config.json` y `data/`
3. Usa el bot\u00f3n de refresh del panel admin

### Estado del contenedor

```bash
docker-compose ps
curl http://localhost:3000/health
```

## Licencia

Licencia ISC - Ver [LICENSE](LICENSE) para detalles.

---

Construido para manejar env\u00edos de formularios de forma segura y eficiente.
