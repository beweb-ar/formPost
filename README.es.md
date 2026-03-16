# Servidor de Formularios (Form Backend)

> **[Read in English](README.md)**

Backend en Node.js listo para produccion para procesar formularios de contacto de sitios web. Soporta multiples sitios, notificaciones por email con plantillas HTML personalizadas, proteccion anti-bot con Cloudflare Turnstile, almacenamiento de envios con exportacion, panel de administracion completo e interfaz bilingue (Ingles / Espanol).

[![Docker](https://img.shields.io/badge/Docker-Listo-blue?logo=docker)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/Licencia-ISC-yellow)](LICENSE)

## Tabla de Contenidos

- [Caracteristicas](#caracteristicas)
- [Inicio Rapido](#inicio-rapido)
- [Configuracion](#configuracion)
- [Variables de Entorno](#variables-de-entorno)
- [Internacionalizacion (i18n)](#internacionalizacion-i18n)
- [Panel de Administracion](#panel-de-administracion)
- [Plantillas de Email](#plantillas-de-email)
- [Ejemplo de Formulario HTML](#ejemplo-de-formulario-html)
- [Referencia de API](#referencia-de-api)
- [Despliegue con Docker](#despliegue-con-docker)
- [Seguridad](#seguridad)
- [Estructura de Archivos](#estructura-de-archivos)
- [Solucion de Problemas](#solucion-de-problemas)
- [Licencia](#licencia)

## Caracteristicas

- **Soporte multi-sitio** - Maneja formularios de multiples sitios web, cada uno con su propia configuracion
- **Notificaciones por email** - Plantillas HTML personalizadas por sitio con inyeccion dinamica de campos
- **Cloudflare Turnstile** - Proteccion anti-bot por sitio (opcional)
- **Almacenamiento de envios** - Almacenamiento en archivos JSON, hasta 1000 envios por sitio
- **Exportacion** - Descarga de envios en CSV o JSON
- **Panel de administracion** - Interfaz web completa para gestionar sitios, SMTP, estadisticas, envios y contrasenas
- **Internacionalizacion** - Servidor y panel disponibles en Ingles y Espanol via variable `LANG`
- **Estadisticas** - Contadores por sitio y total global de envios
- **Tema oscuro / claro** - Alternancia en el panel, persistido en localStorage
- **Limitacion de tasa** - Limites separados para envios, API de admin e intentos de login
- **Headers de seguridad** - Middleware Helmet con CSP, proteccion XSS
- **Listo para Docker** - Build multi-etapa, usuario no-root, health checks, limites de recursos

## Inicio Rapido

### Docker Compose (recomendado)

```bash
git clone https://github.com/c0deirl/formbackend.git
cd formbackend

# Edita config.json con tu configuracion SMTP y de sitios, luego:
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

El panel de administracion esta disponible en `http://localhost:3000/admin`.

## Configuracion

Toda la configuracion esta en `config.json`. El panel de admin puede modificar la mayoria en tiempo real.

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
        "pass": "contrasena_smtp"
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

| Seccion | Descripcion |
|---|---|
| `recipients` | Una entrada por sitio: email destino, prefijo de asunto, URL de redireccion, ruta de plantilla |
| `statistics` | Contadores y timestamps de envios por sitio (gestionado automaticamente) |
| `smtp` | Configuracion del servidor SMTP (host, port, secure, from, user, pass) |
| `turnstile` | Clave secreta de Cloudflare Turnstile por sitio (opcional) |
| `cors` | Array de origenes permitidos (debe incluir protocolo) |
| `admin` | Credenciales del panel de administracion |

## Variables de Entorno

| Variable | Default | Descripcion |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `DEBUG` | `false` | Cuando es `true`, omite verificacion Turnstile (para pruebas) |
| `LANG` | `es` | Idioma de la interfaz y mensajes del servidor (`en` o `es`) |
| `ADMIN_USERNAME` | - | Sobreescribe el usuario admin de config.json |
| `ADMIN_PASSWORD` | - | Sobreescribe la contrasena admin de config.json |
| `SMTP_HOST` | - | Sobreescribe host SMTP |
| `SMTP_PORT` | - | Sobreescribe puerto SMTP |
| `SMTP_SECURE` | - | Sobreescribe flag secure SMTP |
| `SMTP_FROM` | - | Sobreescribe direccion from SMTP |
| `SMTP_USER` | - | Sobreescribe usuario SMTP |
| `SMTP_PASS` | - | Sobreescribe contrasena SMTP |

## Internacionalizacion (i18n)

La aplicacion soporta **Ingles** (`en`) y **Espanol** (`es`).

```bash
# Espanol (por defecto)
LANG=es

# Ingles
LANG=en
```

- **Si `LANG` no esta definida, se usa Espanol por defecto.**
- El servidor traduce todos los mensajes de respuesta (errores de validacion, respuestas de API, mensajes de autenticacion).
- El panel de admin detecta el idioma desde el servidor y aplica traducciones a todos los labels, botones, toasts, dialogos de confirmacion y elementos de la barra de estado.

En Docker Compose, agregalo a `environment`:

```yaml
environment:
  - LANG=es
```

## Panel de Administracion

**URL:** `http://localhost:3000/admin`

### Dashboard

- **Barra de estado** - Estado del servidor, puerto, tiempo activo, memoria, cantidad de sitios, **total de envios** (global)
- **Tarjetas de sitios** - Cada sitio muestra: email destino, asunto, redireccion, plantilla, estado de Turnstile, cantidad de envios, fecha del ultimo envio
- **Tema oscuro/claro** alternante

### Gestion de Sitios

- Agregar, editar y eliminar configuraciones de sitios
- Los cambios se guardan en `config.json` inmediatamente

### Envios (Submissions)

- Tabla paginada por sitio (50 por pagina)
- Click en cualquier fila para ver el detalle JSON completo
- **Exportar CSV** o **Exportar JSON**
- **Eliminar todos** los envios de un sitio
- Direcciones IP anonimizadas (ultimo octeto enmascarado)

### Estadisticas

- Conteo de envios y fecha del ultimo envio por sitio
- **Total de envios** de todos los sitios en la barra de estado
- Reiniciar estadisticas por sitio

### Configuracion

- Editar configuracion SMTP (credenciales enmascaradas en la visualizacion)
- Cambiar contrasena de admin (requiere contrasena actual, minimo 8 caracteres)

## Plantillas de Email

Las plantillas son archivos HTML con marcadores. Dos modos:

### Modo dinamico (recomendado)

Usa `{{fields}}` para auto-generar una lista de todos los campos enviados:

```html
<h2>Nuevo envio de {{website_id}}</h2>
<div>{{fields}}</div>
```

### Modo legacy

Usa marcadores individuales `{{nombre_campo}}`:

```html
<p><strong>Nombre:</strong> {{nombre}}</p>
<p><strong>Email:</strong> {{email}}</p>
<p><strong>Mensaje:</strong> {{mensaje}}</p>
```

Los nombres de campos se convierten automaticamente a labels: `correo_electronico` se muestra como `Correo Electronico`.

Si una plantilla no existe o no se puede leer, el servidor genera un email HTML basico automaticamente.

## Ejemplo de Formulario HTML

```html
<form action="https://tu-servidor.com/submit" method="POST">
    <input type="hidden" name="website_id" value="mi-sitio">
    <label>Nombre: <input type="text" name="nombre" required></label>
    <label>Email: <input type="email" name="email" required></label>
    <label>Mensaje: <textarea name="mensaje"></textarea></label>

    <!-- Cloudflare Turnstile (opcional, solo si esta configurado) -->
    <div class="cf-turnstile" data-sitekey="TU_SITE_KEY"></div>

    <button type="submit">Enviar</button>
</form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

### Restricciones del formulario

- `website_id` (requerido) - Debe coincidir con una clave en `config.recipients`
- Maximo 30 campos por envio
- Maximo 100 caracteres por nombre de campo
- Maximo 5000 caracteres por valor de campo
- Los campos de email se validan (email, correo, e_mail)

## Referencia de API

### Publicos

| Metodo | Endpoint | Descripcion |
|---|---|---|
| `POST` | `/submit` | Procesar un envio de formulario |
| `GET` | `/health` | Health check (sin autenticacion) |

### Admin (requiere Basic Auth)

| Metodo | Endpoint | Descripcion |
|---|---|---|
| `GET` | `/admin/api/status` | Estado del servidor, uptime, memoria, total envios, idioma |
| `GET` | `/admin/api/websites` | Listar todas las configuraciones de sitios |
| `POST` | `/admin/api/websites` | Crear un nuevo sitio |
| `PUT` | `/admin/api/websites/:id` | Actualizar un sitio |
| `DELETE` | `/admin/api/websites/:id` | Eliminar un sitio |
| `GET` | `/admin/api/smtp` | Obtener config SMTP (credenciales enmascaradas) |
| `PUT` | `/admin/api/smtp` | Actualizar config SMTP |
| `GET` | `/admin/api/statistics` | Estadisticas de todos los sitios |
| `GET` | `/admin/api/statistics/:id` | Estadisticas de un sitio |
| `PUT` | `/admin/api/statistics/:id/reset` | Reiniciar estadisticas de un sitio |
| `GET` | `/admin/api/submissions/:id` | Envios paginados (`?page=1&limit=50`) |
| `DELETE` | `/admin/api/submissions/:id` | Eliminar todos los envios de un sitio |
| `GET` | `/admin/api/submissions/:id/export` | Exportar envios (`?format=json` o `csv`) |
| `PUT` | `/admin/api/admin/reset-password` | Cambiar contrasena de admin |

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
  -e ADMIN_PASSWORD=contrasena_segura \
  -e LANG=es \
  -v ./config.json:/app/config.json \
  -v ./data:/app/data \
  --restart always \
  form-processor
```

### Caracteristicas Docker

- **Build multi-etapa** - Imagen final ~150MB (Alpine + dependencias de produccion)
- **Usuario no-root** - Ejecuta como `nodeuser` (UID 1001)
- **Health check** - `/health` cada 30s, reinicio automatico en falla
- **Limites de recursos** - 512MB maximo, 128MB reservados
- **no-new-privileges** - Previene escalacion de privilegios
- **Volumenes** - `config.json`, `data/` (envios), `templates/` (opcional)

## Seguridad

### Limitacion de Tasa

| Ambito | Limite |
|---|---|
| Envios de formularios | 5 por minuto por IP |
| API de admin | 30 por minuto por IP |
| Intentos de login | 10 por 15 minutos (solo fallos) |

### Validacion de Entrada

- Cuerpo de request limitado a 100KB
- Maximo 30 campos, 5000 chars por valor, 100 chars por clave
- Validacion de email con limite de 254 caracteres
- Escape de HTML en plantillas y envios (prevencion XSS)

### Headers y Protecciones

- Helmet con CSP, filtro XSS, HSTS, frameguard
- CORS con origenes permitidos configurables
- Anonimizacion de IP en envios almacenados (ultimo octeto enmascarado)
- Credenciales de admin nunca expuestas en respuestas de API
- Credenciales SMTP enmascaradas en endpoint de estado

## Estructura de Archivos

```
formbackend/
├── server.js                       # Aplicacion principal
├── config.json                     # Configuracion (gestionada por el panel admin)
├── package.json                    # Dependencias
├── Dockerfile                      # Build Docker multi-etapa
├── docker-compose.yml              # Configuracion Docker Compose
├── README.md                       # Documentacion (Ingles)
├── README.es.md                    # Documentacion (Espanol)
├── LICENSE                         # Licencia ISC
├── logo.png                        # Logo de la aplicacion
├── email-template.html             # Plantilla de email por defecto
├── email-template-website-*.html   # Plantillas por sitio
├── admin/
│   └── index.html                  # Panel de administracion (SPA single-file)
└── data/
    └── submissions-{websiteId}.json # Envios almacenados por sitio
```

## Solucion de Problemas

### Los emails no se envian

1. Verifica las credenciales SMTP en config.json o via el panel admin
2. Verifica que el firewall permite conexiones SMTP salientes
3. Revisa los logs: `docker-compose logs -f`

### Verificacion Turnstile fallando

1. Verifica que el site key coincide con el dominio en Cloudflare
2. Verifica que el secret key en config.json sea correcto
3. Usa `DEBUG=true` para omitir Turnstile durante pruebas

### Errores CORS

1. Agrega el origen exacto a `cors.allowedOrigins` (incluye `https://`)
2. Reinicia el contenedor despues de editar config.json manualmente

### Estadisticas no se actualizan

1. Asegurate que Turnstile pasa (o `DEBUG=true`)
2. Verifica permisos de archivos en `config.json` y `data/`
3. Usa el boton de refresh del panel admin

### Estado del contenedor

```bash
docker-compose ps
curl http://localhost:3000/health
```

## Licencia

Licencia ISC - Ver [LICENSE](LICENSE) para detalles.

---

Construido para manejar envios de formularios de forma segura y eficiente.
