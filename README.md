# Form Backend Server

A production-ready Node.js application for processing website contact forms with support for multiple websites, email notifications, bot protection, statistics tracking, and a comprehensive admin interface.

[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

## ✨ Features

- ✅ **Multi-Website Support**: Handle forms from multiple websites with different configurations
- ✅ **Email Notifications**: Send styled HTML emails with custom templates per website
- ✅ **Bot Protection**: Cloudflare Turnstile integration for spam prevention
- ✅ **Statistics Tracking**: Monitor successful submissions per website with reset functionality
- ✅ **Admin Interface**: Web-based dashboard for managing settings and viewing statistics
- ✅ **Secure Authentication**: Configurable admin credentials stored in config.json
- ✅ **Docker Ready**: Production-ready Docker setup with multi-stage builds and health checks
- ✅ **CORS Support**: Configurable cross-origin resource sharing per domain
- ✅ **Environment Variables**: Flexible configuration via environment variables

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Admin Interface](#admin-interface)
- [Docker Deployment](#docker-deployment)
- [API Endpoints](#api-endpoints)
- [Security Features](#security-features)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## 🚀 Prerequisites

- **Node.js**: Version 18 or higher
- **Docker & Docker Compose**: For containerized deployment (recommended)
- **SMTP Server**: Credentials for email delivery
- **Cloudflare Turnstile**: Site key and secret key for bot protection

## ⚡ Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/c0deirl/formbackend.git
cd formbackend

# Start the application
docker-compose up -d

# Access the admin interface
# Open http://localhost:3000/admin in your browser
# Default credentials: admin / password
# This service must be exposed to the internet to work with external websites
# Configure the service with the config.json ahead of time, or use the web interface to add your website config
```
## Container must be restarted in order for changes to take effect.

```bash
docker compose down
docker compose up -d
```

### Local Development

```bash
# Install dependencies
npm install

# Start the server
npm start

# Access admin interface
# http://localhost:3000/admin
```


### Example email template structure:

```
<!DOCTYPE html>
<html>
<head>
    <title>New Form Submission</title>
    <style>
        /* Your CSS styles */
    </style>
</head>
<body>
    <h2>New Form Submission from {{website_id}}</h2>
    <p><strong>Name:</strong> {{name}}</p>
    <p><strong>Email:</strong> {{email}}</p>
    <!-- More fields -->
</body>
</html>
```
>  When making a template, the server.js will replace the bracketed variables for you.


### Website Contact Form HTML Example

Add this to your website forms:

```html

<form id="contactForm" action="https://your-server-domain.com/submit" method="POST">
    <input type="hidden" name="website_id" value="website-a">
    <label>Name: <input type="text" name="name" required></label>
    <label>Email: <input type="email" name="email" required></label>
    <label>Phone: <input type="tel" name="phone"></label>
    <label>Rooms: <input type="number" name="rooms"></label>
    <label>Message: <textarea name="message"></textarea></label>
    <!-- Cloudflare Turnstile widget -->
    <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
    <button type="submit">Submit</button>
</form>
<!-- Include Turnstile script -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

<script>
  // Form validation and submission
        document.addEventListener('DOMContentLoaded', function() {
            const contactForm = document.getElementById('contactForm');
            if (contactForm) {
                contactForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    const name = document.getElementById('name').value.trim();
                    const email = document.getElementById('email').value.trim();
                    const phone = document.getElementById('phone').value.trim();
                    const service = document.getElementById('service').value;
                    const message = document.getElementById('message').value.trim();

                    if (!name || !email || !phone || !message) {
                        alert('Please fill in all required fields.');
                        return false;
                    }

                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        alert('Please enter a valid email address.');
                        return false;
                    }

                    if (!/^\d{10,}$/.test(phone.replace(/[^0-9]/g, ''))) {
                        alert('Please enter a valid phone number (10 digits minimum).');
                        return false;
                    }

                    // Check if Turnstile challenge was completed
                    const turnstileResponse = document.querySelector('input[name="cf-turnstile-response"]');
                    const token = turnstileResponse ? turnstileResponse.value : '';
                    
                    if (!token) {
                        alert('Please complete the security verification.');
                        return false;
                    }
</script>
```

### Required Form Fields

- `website_id`: Identifier matching your config.json
- `name`: User's name
- `email`: User's email address
- `phone`: User's phone number (optional)
- `rooms`: This is a dropdown of "options", see below (optional)
- `message`: User's message (optional)
- `cf-turnstile-response`: Turnstile token (automatically added)  

> The "Rooms" variable is a numerical value, I used it for a dropdown selection list. You can customize this to any dropdown you would like, but keep in mind this will return a numerical value.

## Screenshots


<img width="1260" height="918" alt="Screenshot 2026-01-14 131054" src="https://github.com/user-attachments/assets/4e3fbbca-e321-495a-a1a7-b15082ee8473" />

## 🔧 Installation

### Option 1: Docker Deployment (Recommended)

1. **Ensure Docker is installed and running**
2. **Clone and setup**:
```bash
git clone https://github.com/c0deirl/formbackend.git
cd formbackend
docker-compose up -d
```

3. **Verify installation**:
```bash
docker-compose ps
# Should show form-processor container running

curl http://localhost:3000/health
# Should return {"status":"ok"}
```

### Option 2: Local Development

1. **Install Node.js 18+**
2. **Install dependencies**:
```bash
npm install
```

3. **Configure your settings** (see Configuration section below)
4. **Start the server**:
```bash
npm start
```

## ⚙️ Configuration

### config.json Structure

```json
{
    "recipients": {
        "website-a": {
            "to": "your-email@domain.com",
            "subjectPrefix": "Website A - ",
            "redirectUrl": "https://website-a.com/thanks.html",
            "templatePath": "email-template.html"
        }
    },
    "statistics": {
        "website-a": {
            "successfulSubmissions": 0,
            "lastSubmission": null
        }
    },
    "smtp": {
        "host": "smtp.example.com",
        "port": 587,
        "secure": false,
        "from": "noreply@domain.com",
        "user": "username",
        "pass": "password"
    },
    "turnstile": {
        "website-a": {
            "secretKey": "YOUR_TURNSTILE_SECRET_KEY"
        }
    },
    "cors": {
        "allowedOrigins": [
            "https://website-a.com",
            "https://website-b.com"
        ]
    },
    "admin": {
        "username": "admin",
        "password": "password"
    }
}
```

### Configuration Sections

#### Recipients
Each website configuration:
- `to`: Email address for form submissions
- `subjectPrefix`: Prefix for email subject
- `redirectUrl`: Post-submission redirect URL
- `templatePath`: Path to HTML email template

#### Statistics (Auto-generated)
- `successfulSubmissions`: Count of successful submissions
- `lastSubmission`: Timestamp of last submission

#### SMTP Settings
- `host`: SMTP server hostname
- `port`: SMTP port (587 for TLS, 465 for SSL, 25 for unencrypted)
- `secure`: Use TLS/SSL
- `from`: Sender email address
- `user`: SMTP username (optional)
- `pass`: SMTP password (optional)

#### Turnstile (Bot Protection)
- `secretKey`: Cloudflare Turnstile secret key per website

#### CORS Settings
- `allowedOrigins`: Array of allowed domain URLs (must include protocol)

#### Admin Settings
- `username`: Admin interface username
- `password`: Admin interface password

### Environment Variables

When using Docker, you can override config values:

```yaml
# docker-compose.yml
environment:
  - ADMIN_USERNAME=admin
  - ADMIN_PASSWORD=securepassword
  - PORT=3000
```

Available variables:
- `ADMIN_USERNAME`: Admin username
- `ADMIN_PASSWORD`: Admin password
- `PORT`: Server port (default: 3000)
- `DEBUG`: Enable debug logging (true/false)

## 🎛️ Admin Interface

### Access
- **URL**: `http://localhost:3000/admin`
- **Default Credentials**: `admin` / `password`

### Features

#### 1. Server Status
- Real-time server health status
- Current timestamp
- System information

#### 2. Websites Management
- View all configured websites
- See recipient emails and settings
- Quick access to website URLs

#### 3. Statistics Dashboard
- **Successful Submissions**: Count per website
- **Last Submission**: Timestamp of most recent submission
- **Website Metadata**: Subject prefix and recipient email
- **Refresh Button**: Real-time statistics updates
- **Reset Functionality**: Clear statistics for individual websites

#### 4. SMTP Configuration
- View current SMTP settings
- Note: SMTP credentials are not displayed for security

#### 5. Security Settings
- **Password Reset**: Change admin password
- **Current Password**: Required for verification
- **New Password**: Updated immediately and persisted to config.json

### Statistics Tracking

The system automatically tracks:
- ✅ Successful form submissions
- ✅ Timestamp of each submission
- ✅ Per-website statistics
- ✅ Persistent storage in config.json

**Reset Statistics**: Use the "Reset Statistics" button in the admin interface to clear counts for specific websites.

## 🐳 Docker Deployment

### Docker Compose (Recommended)

```bash
# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Restart
docker-compose restart
```

### Docker Build & Run

```bash
# Build image
docker build -t form-processor .

# Run container (for production - statistics will work)
docker run -d \
  --name form-processor \
  -p 3000:3000 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=password \
  -e DEBUG=false \
  -v ./config.json:/app/config.json \
  --restart always \
  form-processor

# Run container with DEBUG mode (bypasses Turnstile for testing)
docker run -d \
  --name form-processor \
  -p 3000:3000 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=password \
  -e DEBUG=true \
  -v ./config.json:/app/config.json \
  --restart always \
  form-processor
```

### Docker Features

#### Multi-stage Build
- **Builder stage**: Installs all dependencies
- **Final stage**: Minimal Alpine image with only production dependencies
- **Result**: ~150MB final image size (vs ~500MB+ with single stage)

#### Security
- **Non-root user**: Runs as `nodeuser` (UID 1001)
- **Writable config**: Allows statistics updates and config changes
- **No new privileges**: Security option prevents privilege escalation
- **Resource limits**: Memory capped at 512MB

#### Statistics Support
- **Fixed permissions**: config.json is writable by non-root user
- **Volume mount**: Removed read-only flag to allow updates
- **DEBUG mode**: Bypasses Turnstile verification for testing

#### Health Checks
- Automatic container health monitoring
- Checks `/health` endpoint every 30 seconds
- Restarts unhealthy containers automatically

#### .dockerignore
Excludes unnecessary files:
- `node_modules/`
- `.git/`
- `logs/`
- `old_server.js`
- Docker files from build context

## 🌐 API Endpoints

### POST /submit
Process form submissions.

**Request Body:**
```json
{
    "website_id": "website-a",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "555-1234",
    "rooms": 3,
    "message": "Interested in your services",
    "cf-turnstile-response": "turnstile_token_here"
}
```

**Response:**
- `200`: Success - redirects to configured URL
- `400`: Invalid request or Turnstile verification failed
- `500`: Server error

### GET /health
Health check endpoint.

**Response:**
```json
{
    "status": "ok",
    "timestamp": "2026-01-14T10:30:00.000Z",
    "uptime": 1234.56,
    "memory": {"rss": 45000000, "heapTotal": 32000000, "heapUsed": 28000000}
}
```

### Admin API (Protected)

All admin endpoints require Basic Authentication.

#### GET /admin/api/status
Server status and health information.

#### GET /admin/api/websites
List all configured websites with details.

#### GET /admin/api/statistics
Get statistics for all websites.

**Response:**
```json
{
    "website-a": {
        "successfulSubmissions": 5,
        "lastSubmission": "2026-01-14T10:30:00.000Z",
        "subjectPrefix": "PPS Web Form - ",
        "to": "ppspaintllc@gmail.com"
    }
}
```

#### GET /admin/api/statistics/:websiteId
Get statistics for a specific website.

#### PUT /admin/api/statistics/:websiteId/reset
Reset statistics for a specific website.

**Response:**
```json
{
    "message": "Statistics reset successfully for website-a"
}
```

#### PUT /admin/api/admin/reset-password
Change admin password.

**Request Body:**
```json
{
    "currentPassword": "oldpassword",
    "newPassword": "newpassword"
}
```

**Response:**
```json
{
    "message": "Password updated successfully"
}
```

## 🔒 Security Features

### Authentication
- **Basic Auth**: For admin interface access
- **Config-based**: Credentials stored in config.json
- **Environment Override**: Can be overridden with env variables
- **Password Reset**: Secure password change via admin interface

### Container Security
- **Non-root user**: Prevents container privilege escalation
- **Read-only mounts**: Protects configuration files
- **Resource limits**: Prevents resource exhaustion attacks
- **Health monitoring**: Automatic failure detection

### Application Security
- **CORS protection**: Only allowed origins can submit forms
- **Turnstile verification**: Blocks automated spam submissions
- **Input validation**: Validates all form inputs
- **Error handling**: Secure error messages (no sensitive data exposure)

### Best Practices
- ✅ Use HTTPS in production
- ✅ Strong, unique passwords per environment
- ✅ Regular dependency updates
- ✅ Monitor logs for suspicious activity
- ✅ Separate Turnstile keys per website

## 🚨 Troubleshooting

### Docker Issues

**Docker Desktop not running:**
```bash
# Start Docker Desktop manually, then verify:
docker --version
docker ps
```

**Port already in use:**
```yaml
# In docker-compose.yml, change:
ports:
  - "3001:3000"  # Use port 3001 on host
```

**Permission errors:**
```bash
# Check config.json exists and has correct permissions
ls -la config.json
```

### Application Issues

**Email not sending:**
1. Check SMTP credentials in config.json
2. Verify firewall allows SMTP connections
3. Check server logs: `docker-compose logs`
4. Test SMTP connection manually

**Turnstile verification failing:**
1. Verify site key matches domain in Cloudflare
2. Check secret key in config.json
3. Ensure Turnstile widget is loaded in HTML
4. Check browser console for JavaScript errors

**CORS errors:**
1. Add exact domain to `allowedOrigins` in config.json
2. Include protocol: `https://domain.com` (not just `domain.com`)
3. Restart server/container after changes

**Statistics not updating:**
1. Check config.json has "statistics" section
2. Verify successful submissions (Turnstile must pass)
3. Use admin interface refresh button
4. Check file permissions for config.json

### Logs

**View logs:**
```bash
# Docker Compose
docker-compose logs -f

# Docker container
docker logs -f form-processor

# Local development
npm start
```

**Check container health:**
```bash
docker-compose ps
docker inspect form-processor | grep -A 10 Health
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### Statistics
Access via admin interface or API:
```bash
curl -u admin:password http://localhost:3000/admin/api/statistics
```

### Logs
Monitor submission activity and errors in real-time.

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🆘 Support

For help and support:
- **Issues**: Create an issue in the repository
- **Documentation**: Check this README and inline code comments

---

**Built with ❤️ for handling form submissions securely and efficiently**)
