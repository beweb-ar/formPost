const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config.json');

const app = express();
const PORT = process.env.PORT || 3000;
const DEBUG = process.env.DEBUG === 'true';

// Override config with environment variables if provided
if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    if (!config.admin) config.admin = {};
    config.admin.username = process.env.ADMIN_USERNAME;
    config.admin.password = process.env.ADMIN_PASSWORD;
}

// Override SMTP config with environment variables if provided
if (process.env.SMTP_HOST) config.smtp.host = process.env.SMTP_HOST;
if (process.env.SMTP_PORT) config.smtp.port = parseInt(process.env.SMTP_PORT, 10);
if (process.env.SMTP_SECURE) config.smtp.secure = process.env.SMTP_SECURE === 'true';
if (process.env.SMTP_FROM) config.smtp.from = process.env.SMTP_FROM;
if (process.env.SMTP_USER) config.smtp.user = process.env.SMTP_USER;
if (process.env.SMTP_PASS) config.smtp.pass = process.env.SMTP_PASS;

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
        }
    }
}));

// Rate limiting for form submissions
const submitLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: 'Too many submissions. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting for admin API
const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting for auth failures
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Too many login attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

// Middleware to parse form data with size limits
app.use(bodyParser.urlencoded({ extended: true, limit: '100kb' }));
app.use(bodyParser.json({ limit: '100kb' }));

// CORS Configuration
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (config.cors && config.cors.allowedOrigins && config.cors.allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Configure the Nodemailer transporter
const transporterConfig = { ...config.smtp };
if (transporterConfig.user && transporterConfig.pass) {
    transporterConfig.auth = {
        type: 'LOGIN',
        user: transporterConfig.user,
        pass: transporterConfig.pass
    };
}
delete transporterConfig.user;
delete transporterConfig.pass;
const transporter = nodemailer.createTransport(transporterConfig);

// HTML escape function to prevent XSS in email templates
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Email validation
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (e) {
        // ignore if exists
    }
}
ensureDataDir();

// Save submission to file storage
async function saveSubmission(websiteId, submission) {
    await ensureDataDir();
    const filePath = path.join(DATA_DIR, `submissions-${websiteId}.json`);
    let submissions = [];
    try {
        const data = await fs.readFile(filePath, 'utf8');
        submissions = JSON.parse(data);
    } catch (e) {
        // file doesn't exist yet
    }
    submissions.unshift(submission); // newest first
    // Keep max 1000 submissions per website
    if (submissions.length > 1000) {
        submissions = submissions.slice(0, 1000);
    }
    await fs.writeFile(filePath, JSON.stringify(submissions, null, 2));
}

// Load submissions from file storage
async function loadSubmissions(websiteId) {
    const filePath = path.join(DATA_DIR, `submissions-${websiteId}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

app.post('/submit', submitLimiter, async (req, res) => {
    const { website_id, name, email, phone, rooms, service, message, 'cf-turnstile-response': turnstileToken } = req.body;

    // Dynamic routing check
    const recipientConfig = config.recipients[website_id];
    if (!recipientConfig) {
        console.error(`Unknown website_id: ${website_id}`);
        return res.status(400).send('Invalid form submission ID.');
    }

    // Input validation
    if (name && name.length > 200) return res.status(400).send('Name is too long.');
    if (email && !isValidEmail(email)) return res.status(400).send('Invalid email address.');
    if (phone && phone.length > 30) return res.status(400).send('Phone number is too long.');
    if (message && message.length > 5000) return res.status(400).send('Message is too long.');
    if (rooms && String(rooms).length > 200) return res.status(400).send('Rooms field is too long.');
    if (service && service.length > 200) return res.status(400).send('Service field is too long.');

    // Verify Cloudflare Turnstile token
    if (!DEBUG) {
        if (!turnstileToken) {
            console.error('No Turnstile token provided');
            return res.status(400).send('Please complete the security verification.');
        }

        const turnstileConfig = config.turnstile[website_id];
        if (!turnstileConfig) {
            console.error(`No Turnstile config found for website: ${website_id}`);
            return res.status(400).send('Invalid form submission.');
        }

        try {
            const verificationResponse = await axios.post(
                'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                new URLSearchParams({
                    secret: turnstileConfig.secretKey,
                    response: turnstileToken,
                    remoteip: req.ip
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const { success, 'error-codes': errorCodes } = verificationResponse.data;
            if (!success) {
                console.error('Turnstile verification failed:', errorCodes);
                return res.status(400).send('Security verification failed. Please try again.');
            }
        } catch (error) {
            console.error('Error verifying Turnstile token:', error.message);
            return res.status(500).send('Security verification error. Please try again later.');
        }
    } else {
        console.log('DEBUG mode: Skipping Turnstile verification');
    }

    // Read HTML template and replace placeholders with escaped values
    try {
        // Path traversal protection
        const templatePath = path.resolve(__dirname, recipientConfig.templatePath);
        if (!templatePath.startsWith(__dirname)) {
            console.error('Path traversal attempt detected:', recipientConfig.templatePath);
            return res.status(500).send('Template configuration error.');
        }

        let mailBody = await fs.readFile(templatePath, 'utf8');

        // Replace placeholders with HTML-escaped values
        mailBody = mailBody
            .replace(/{{website_id}}/g, escapeHtml(website_id) || 'Unknown')
            .replace(/{{name}}/g, escapeHtml(name) || 'Anonymous')
            .replace(/{{email}}/g, escapeHtml(email) || 'No email provided')
            .replace(/{{phone}}/g, escapeHtml(phone) || 'No phone provided')
            .replace(/{{rooms}}/g, escapeHtml(rooms) || 'Not specified')
            .replace(/{{service}}/g, escapeHtml(service) || 'Not specified')
            .replace(/{{message}}/g, escapeHtml(message) || 'No details provided.');

        const mailOptions = {
            from: `"${escapeHtml(name)}" <${config.smtp.from}>`,
            to: recipientConfig.to,
            subject: `${recipientConfig.subjectPrefix} New Lead from ${escapeHtml(name)}`,
            html: mailBody,
            replyTo: email
        };

        // Send email
        try {
            await transporter.sendMail(mailOptions);
            console.log(`Email successfully sent to ${recipientConfig.to} for ${website_id}`);

            // Save submission to storage
            try {
                const ip = req.ip || '';
                const anonIp = ip.replace(/\.\d+$/, '.xxx');
                await saveSubmission(website_id, {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    name: name || '',
                    email: email || '',
                    phone: phone || '',
                    rooms: rooms || '',
                    service: service || '',
                    message: message || '',
                    timestamp: new Date().toISOString(),
                    ip: anonIp
                });
            } catch (storageError) {
                console.error('Error saving submission:', storageError.message);
            }

            // Update statistics
            try {
                const currentConfig = JSON.parse(await fs.readFile('./config.json', 'utf8'));
                if (!currentConfig.statistics) currentConfig.statistics = {};
                if (!currentConfig.statistics[website_id]) {
                    currentConfig.statistics[website_id] = { successfulSubmissions: 0, lastSubmission: null };
                }
                currentConfig.statistics[website_id].successfulSubmissions++;
                currentConfig.statistics[website_id].lastSubmission = new Date().toISOString();
                await fs.writeFile('./config.json', JSON.stringify(currentConfig, null, 4));
                config.statistics = currentConfig.statistics;
            } catch (statsError) {
                console.error('Error updating statistics:', statsError.message);
            }

            // Redirect or respond with success
            if (recipientConfig.redirectUrl) {
                res.redirect(302, recipientConfig.redirectUrl);
            } else {
                res.status(200).json({ success: true, message: 'Form submitted successfully.' });
            }

        } catch (error) {
            console.error('Error sending email:', error.message);
            res.status(500).send('Something went wrong on the server.');
        }
    } catch (templateError) {
        console.error('Error reading email template:', templateError.message);
        res.status(500).send('Template error on the server.');
    }
});

// Health Check Endpoint - does NOT expose sensitive config
app.get('/health', async (req, res) => {
    try {
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
            },
            websiteCount: Object.keys(config.recipients).length
        });
    } catch (error) {
        console.error('Health check failed:', error.message);
        res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
    }
});

// Admin authentication middleware
function adminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Authentication required');
    }
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [user, ...passParts] = credentials.split(':');
    const pass = passParts.join(':'); // Handle passwords containing ':'

    if (DEBUG) {
        console.log('Admin auth attempt:', { user }); // Never log passwords
    }

    if (config.admin && user === config.admin.username && pass === config.admin.password) {
        return next();
    }
    return res.status(403).send('Forbidden');
}

// Serve admin UI (no Basic Auth - the frontend handles its own login)
app.use('/admin', authLimiter, (req, res, next) => {
    if (req.path === '/' || req.path === '') {
        return res.sendFile(path.join(__dirname, 'admin', 'index.html'));
    }
    express.static(path.join(__dirname, 'admin'))(req, res, next);
});

// Serve ONLY specific static files (not the entire directory!)
app.get('/logo.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'logo.png'));
});

// Admin API routes (protected)
const adminRouter = express.Router();
adminRouter.use(adminLimiter);
adminRouter.use(adminAuth);

// Get server status
adminRouter.get('/status', async (req, res) => {
    try {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            port: PORT,
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
            },
            config: {
                websites: Object.keys(config.recipients),
                smtp: {
                    host: config.smtp.host,
                    port: config.smtp.port,
                    secure: config.smtp.secure,
                    from: config.smtp.from
                },
                turnstile: Object.keys(config.turnstile || {})
            }
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to retrieve status' });
    }
});

// Get list of configured websites
adminRouter.get('/websites', (req, res) => {
    res.json(config.recipients);
});

// Add a new website configuration
adminRouter.post('/websites', async (req, res) => {
    const { id, config: siteConfig } = req.body;
    if (!id || !siteConfig) {
        return res.status(400).json({ error: 'Missing id or config' });
    }
    if (config.recipients[id]) {
        return res.status(409).json({ error: 'Website ID already exists' });
    }
    config.recipients[id] = siteConfig;
    if (siteConfig.turnstileKey) {
        config.turnstile[id] = { secretKey: siteConfig.turnstileKey };
    }
    await fs.writeFile(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
    res.status(201).json({ message: 'Website added' });
});

// Update existing website configuration
adminRouter.put('/websites/:id', async (req, res) => {
    const { id } = req.params;
    const siteConfig = req.body;
    if (!config.recipients[id]) {
        return res.status(404).json({ error: 'Website not found' });
    }
    config.recipients[id] = { ...config.recipients[id], ...siteConfig };
    if (siteConfig.turnstileKey) {
        if (!config.turnstile) config.turnstile = {};
        config.turnstile[id] = { secretKey: siteConfig.turnstileKey };
    }
    await fs.writeFile(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
    res.json({ message: 'Website updated' });
});

// Delete a website configuration
adminRouter.delete('/websites/:id', async (req, res) => {
    const { id } = req.params;
    if (!config.recipients[id]) {
        return res.status(404).json({ error: 'Website not found' });
    }
    delete config.recipients[id];
    if (config.turnstile && config.turnstile[id]) {
        delete config.turnstile[id];
    }
    await fs.writeFile(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
    res.json({ message: 'Website removed' });
});

// SMTP configuration routes
adminRouter.get('/smtp', (req, res) => {
    // Return SMTP config without credentials
    res.json({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        from: config.smtp.from,
        user: config.smtp.user ? '****' : '',
        pass: config.smtp.pass ? '****' : ''
    });
});

adminRouter.put('/smtp', async (req, res) => {
    const newSmtp = req.body;
    if (!newSmtp || typeof newSmtp !== 'object') {
        return res.status(400).json({ error: 'Invalid SMTP config' });
    }
    config.smtp = { ...config.smtp, ...newSmtp };
    try {
        await fs.writeFile(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
        res.json({ message: 'SMTP config updated' });
    } catch (e) {
        console.error('Failed to write config:', e.message);
        res.status(500).json({ error: 'Failed to save config' });
    }
});

// Statistics routes
adminRouter.get('/statistics', (req, res) => {
    const stats = config.statistics || {};
    const enhancedStats = {};
    for (const [websiteId, websiteConfig] of Object.entries(config.recipients)) {
        const websiteStats = stats[websiteId] || { successfulSubmissions: 0, lastSubmission: null };
        enhancedStats[websiteId] = {
            ...websiteStats,
            name: websiteConfig.subjectPrefix || websiteId,
            email: websiteConfig.to
        };
    }
    res.json(enhancedStats);
});

adminRouter.get('/statistics/:id', (req, res) => {
    const { id } = req.params;
    if (!config.recipients[id]) {
        return res.status(404).json({ error: 'Website not found' });
    }
    const stats = config.statistics || {};
    const websiteStats = stats[id] || { successfulSubmissions: 0, lastSubmission: null };
    res.json({
        websiteId: id,
        name: config.recipients[id].subjectPrefix || id,
        email: config.recipients[id].to,
        ...websiteStats
    });
});

adminRouter.put('/statistics/:id/reset', async (req, res) => {
    const { id } = req.params;
    if (!config.recipients[id]) {
        return res.status(404).json({ error: 'Website not found' });
    }
    try {
        const currentConfig = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        if (!currentConfig.statistics) currentConfig.statistics = {};
        currentConfig.statistics[id] = { successfulSubmissions: 0, lastSubmission: null };
        await fs.writeFile('./config.json', JSON.stringify(currentConfig, null, 4));
        config.statistics = currentConfig.statistics;
        res.json({ message: 'Statistics reset', websiteId: id });
    } catch (e) {
        console.error('Failed to reset statistics:', e.message);
        res.status(500).json({ error: 'Failed to reset statistics' });
    }
});

// Submissions routes
adminRouter.get('/submissions/:websiteId', async (req, res) => {
    const { websiteId } = req.params;
    if (!config.recipients[websiteId]) {
        return res.status(404).json({ error: 'Website not found' });
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const submissions = await loadSubmissions(websiteId);
    const start = (page - 1) * limit;
    const paged = submissions.slice(start, start + limit);
    res.json({
        submissions: paged,
        total: submissions.length,
        page,
        limit,
        totalPages: Math.ceil(submissions.length / limit)
    });
});

adminRouter.delete('/submissions/:websiteId', async (req, res) => {
    const { websiteId } = req.params;
    if (!config.recipients[websiteId]) {
        return res.status(404).json({ error: 'Website not found' });
    }
    const filePath = path.join(DATA_DIR, `submissions-${websiteId}.json`);
    try {
        await fs.writeFile(filePath, JSON.stringify([], null, 2));
        res.json({ message: 'All submissions deleted' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete submissions' });
    }
});

adminRouter.get('/submissions/:websiteId/export', async (req, res) => {
    const { websiteId } = req.params;
    if (!config.recipients[websiteId]) {
        return res.status(404).json({ error: 'Website not found' });
    }
    const format = req.query.format || 'json';
    const submissions = await loadSubmissions(websiteId);

    if (format === 'csv') {
        const headers = ['id', 'timestamp', 'name', 'email', 'phone', 'rooms', 'service', 'message', 'ip'];
        const csvRows = [headers.join(',')];
        for (const s of submissions) {
            const row = headers.map(h => {
                const val = String(s[h] || '').replace(/"/g, '""');
                return `"${val}"`;
            });
            csvRows.push(row.join(','));
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="submissions-${websiteId}.csv"`);
        return res.send(csvRows.join('\n'));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="submissions-${websiteId}.json"`);
    res.json(submissions);
});

// Reset admin password
adminRouter.put('/admin/reset-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (currentPassword !== config.admin.password) {
        return res.status(403).json({ error: 'Current password is incorrect' });
    }
    try {
        const configData = await fs.readFile('./config.json', 'utf8');
        const currentConfig = JSON.parse(configData);
        currentConfig.admin.password = newPassword;
        await fs.writeFile('./config.json', JSON.stringify(currentConfig, null, 4));
        config.admin.password = newPassword;
        res.json({ message: 'Password updated successfully' });
    } catch (e) {
        console.error('Failed to update password:', e.message);
        res.status(500).json({ error: 'Failed to update password' });
    }
});

app.use('/admin/api', adminRouter);

// Start the server
app.listen(PORT, () => {
    console.log(`Form processing server running on port ${PORT}`);
    console.log(`Health check available at: http://localhost:${PORT}/health`);
    console.log(`Admin UI available at: http://localhost:${PORT}/admin`);
});
