# Multi-stage build for smaller final image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for potential build steps)
RUN npm ci --only=production

# Final stage
FROM node:20-alpine

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY server.js ./
COPY config.json ./
COPY email-template-website-a.html ./
COPY email-template-website-b.html ./
COPY email-template-website-c.html ./
COPY logo.png ./

# Copy admin directory
COPY admin ./admin

# Create data directory for submission storage
RUN mkdir -p /usr/src/app/data

# Change ownership to non-root user and ensure writable paths
RUN chown -R nodeuser:nodejs /usr/src/app && \
    chmod 664 config.json && \
    chmod 775 /usr/src/app/data

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start the application
CMD [ "node", "server.js" ]
