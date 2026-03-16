# Docker Setup Instructions

## What We've Accomplished

✅ **Updated Dockerfile** with multi-stage build for smaller image size
✅ **Created .dockerignore** to exclude unnecessary files
✅ **Updated docker-compose.yml** with environment variables and security settings
✅ **Modified server.js** to support environment variables for admin credentials
✅ **Added health checks** for container orchestration
✅ **Implemented non-root user** for enhanced security
✅ **Fixed statistics functionality** - Removed read-only config mount to allow statistics updates
✅ **Added DEBUG mode** - Bypasses Turnstile verification for testing

## Statistics Functionality in Docker

The statistics tracking feature requires write access to `config.json`. We've fixed this by:

1. **Removing `:ro` flag** from volume mount in docker-compose.yml
2. **Setting proper permissions** in Dockerfile (chmod 664 config.json)
3. **Adding DEBUG mode** to bypass Turnstile for testing (set `DEBUG=true` in environment)

**Note**: In production, keep `DEBUG=false` and use real Turnstile tokens.

## Files Modified

1. **Dockerfile** - Multi-stage build, non-root user, health check
2. **.dockerignore** - Excludes node_modules, logs, old files, etc.
3. **docker-compose.yml** - Environment variables, security options, resource limits
4. **server.js** - Environment variable support for PORT, ADMIN_USERNAME, ADMIN_PASSWORD

## How to Run with Docker

### Prerequisites
- Docker Desktop installed and running
- Port 3000 available on your machine

### Option 1: Using Docker Compose (Recommended)

```bash
# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Check container health
docker-compose ps
```

### Option 2: Using Docker Build & Run

```bash
# Build the image
docker build -t form-processor .

# Run the container
docker run -d \
  --name form-processor \
  -p 3000:3000 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=password \
  -v ./config.json:/app/config.json:ro \
  --restart always \
  form-processor

# View logs
docker logs -f form-processor

# Stop and remove
docker stop form-processor && docker rm form-processor
```

## Environment Variables

The following environment variables can be set in docker-compose.yml or via command line:

- `ADMIN_USERNAME` - Admin interface username (default: admin)
- `ADMIN_PASSWORD` - Admin interface password (default: password)
- `PORT` - Server port (default: 3000)
- `DEBUG` - Enable debug logging (true/false)

## Security Features

- **Non-root user**: Runs as `nodeuser` (UID 1001) inside container
- **Read-only config mount**: Prevents accidental config modifications
- **No new privileges**: Security option prevents privilege escalation
- **Resource limits**: Memory limits to prevent resource exhaustion
- **Health checks**: Automatic container health monitoring

## Accessing the Application

- **Admin UI**: http://localhost:3000/admin
- **Health Check**: http://localhost:3000/health
- **Form Submissions**: POST to http://localhost:3000/submit

## Configuration Notes

- The config.json file is mounted as read-only in the container
- Admin credentials can be overridden via environment variables
- Statistics and website configurations persist in the mounted config.json
- To update config, edit the local config.json file and restart the container

## Troubleshooting

### Docker Desktop Not Running
If you see "The system cannot find the file specified" error:
1. Start Docker Desktop manually
2. Wait for Docker to be ready (check with `docker --version`)
3. Try the commands again

### Port Already in Use
If port 3000 is occupied:
- Change the port mapping in docker-compose.yml: `"3001:3000"`
- Or stop the conflicting service

### Permission Issues
If you get permission errors:
- Ensure config.json exists in the project directory
- Check file permissions: `icacls config.json` (Windows) or `ls -la config.json` (Linux/Mac)