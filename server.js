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
const LANG = (process.env.LANG || 'es').substring(0, 2).toLowerCase();

// Server-side translations
const serverMessages = {
    en: {
        invalidFormId: 'Invalid form submission ID.',
        tooManyFields: 'Too many form fields.',
        invalidFieldName: 'Invalid field name.',
        fieldTooLong: (label) => `Field "${label}" is too long.`,
        invalidEmail: 'Invalid email address.',
        completeCaptcha: 'Please complete the security verification.',
        invalidSubmission: 'Invalid form submission.',
        captchaFailed: 'Security verification failed. Please try again.',
        captchaError: 'Security verification error. Please try again later.',
        templateError: 'Template configuration error.',
        formSuccess: 'Form submitted successfully.',
        serverError: 'Something went wrong on the server.',
        templateReadError: 'Template error on the server.',
        authRequired: 'Authentication required',
        forbidden: 'Forbidden',
        missingIdOrConfig: 'Missing id or config',
        websiteExists: 'Website ID already exists',
        websiteAdded: 'Website added',
        websiteNotFound: 'Website not found',
        websiteUpdated: 'Website updated',
        websiteRemoved: 'Website removed',
        invalidSmtp: 'Invalid SMTP config',
        smtpUpdated: 'SMTP config updated',
        failedSaveConfig: 'Failed to save config',
        statsReset: 'Statistics reset',
        failedResetStats: 'Failed to reset statistics',
        submissionsDeleted: 'All submissions deleted',
        failedDeleteSubs: 'Failed to delete submissions',
        passwordRequired: 'Current password and new password are required',
        passwordTooShort: 'New password must be at least 8 characters',
        passwordIncorrect: 'Current password is incorrect',
        passwordUpdated: 'Password updated successfully',
        failedUpdatePassword: 'Failed to update password',
        failedRetrieveStatus: 'Failed to retrieve status'
    },
    es: {
        invalidFormId: 'ID de formulario no v\u00e1lido.',
        tooManyFields: 'Demasiados campos en el formulario.',
        invalidFieldName: 'Nombre de campo no v\u00e1lido.',
        fieldTooLong: (label) => `El campo "${label}" es demasiado largo.`,
        invalidEmail: 'Direcci\u00f3n de email no v\u00e1lida.',
        completeCaptcha: 'Por favor complete la verificaci\u00f3n de seguridad.',
        invalidSubmission: 'Env\u00edo de formulario no v\u00e1lido.',
        captchaFailed: 'Verificaci\u00f3n de seguridad fallida. Intente nuevamente.',
        captchaError: 'Error de verificaci\u00f3n de seguridad. Intente m\u00e1s tarde.',
        templateError: 'Error de configuraci\u00f3n de template.',
        formSuccess: 'Formulario enviado correctamente.',
        serverError: 'Ocurri\u00f3 un error en el servidor.',
        templateReadError: 'Error de template en el servidor.',
        authRequired: 'Autenticaci\u00f3n requerida',
        forbidden: 'Acceso denegado',
        missingIdOrConfig: 'Falta id o configuraci\u00f3n',
        websiteExists: 'El ID del website ya existe',
        websiteAdded: 'Website agregado',
        websiteNotFound: 'Website no encontrado',
        websiteUpdated: 'Website actualizado',
        websiteRemoved: 'Website eliminado',
        invalidSmtp: 'Configuraci\u00f3n SMTP no v\u00e1lida',
        smtpUpdated: 'Configuraci\u00f3n SMTP actualizada',
        failedSaveConfig: 'Error al guardar configuraci\u00f3n',
        statsReset: 'Estad\u00edsticas reiniciadas',
        failedResetStats: 'Error al reiniciar estad\u00edsticas',
        submissionsDeleted: 'Todos los env\u00edos eliminados',
        failedDeleteSubs: 'Error al eliminar env\u00edos',
        passwordRequired: 'Se requiere contrase\u00f1a actual y nueva',
        passwordTooShort: 'La nueva contrase\u00f1a debe tener al menos 8 caracteres',
        passwordIncorrect: 'La contrase\u00f1a actual es incorrecta',
        passwordUpdated: 'Contrase\u00f1a actualizada correctamente',
        failedUpdatePassword: 'Error al actualizar contrase\u00f1a',
        failedRetrieveStatus: 'Error al obtener estado'
    }
};
const t = serverMessages[LANG] || serverMessages.es;

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

// Convert field name to display label: "correo_electronico" -> "Correo Electronico"
function fieldToLabel(fieldName) {
    return fieldName
        .replace(/[_-]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

app.post('/submit', submitLimiter, async (req, res) => {
    const { website_id, 'cf-turnstile-response': turnstileToken, ...formFields } = req.body;

    // Dynamic routing check
    const recipientConfig = config.recipients[website_id];
    if (!recipientConfig) {
        console.error(`Unknown website_id: ${website_id}`);
        return res.status(400).send(t.invalidFormId);
    }

    // Input validation: max 30 fields, each max 5000 chars
    const fieldEntries = Object.entries(formFields);
    if (fieldEntries.length > 30) return res.status(400).send(t.tooManyFields);
    for (const [key, value] of fieldEntries) {
        if (typeof key !== 'string' || key.length > 100) return res.status(400).send(t.invalidFieldName);
        const strVal = String(value || '');
        if (strVal.length > 5000) return res.status(400).send(t.fieldTooLong(fieldToLabel(key)));
    }
    // Validate email if present
    const email = formFields.email || formFields.correo || formFields.e_mail || '';
    if (email && !isValidEmail(email)) return res.status(400).send(t.invalidEmail);

    // Verify Cloudflare Turnstile token
    if (!DEBUG) {
        if (!turnstileToken) {
            console.error('No Turnstile token provided');
            return res.status(400).send(t.completeCaptcha);
        }

        const turnstileConfig = config.turnstile[website_id];
        if (!turnstileConfig) {
            console.error(`No Turnstile config found for website: ${website_id}`);
            return res.status(400).send(t.invalidSubmission);
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
                return res.status(400).send(t.captchaFailed);
            }
        } catch (error) {
            console.error('Error verifying Turnstile token:', error.message);
            return res.status(500).send(t.captchaError);
        }
    } else {
        console.log('DEBUG mode: Skipping Turnstile verification');
    }

    // Build email from template or generate dynamic email
    try {
        let mailBody;
        const templatePath = path.resolve(__dirname, recipientConfig.templatePath);
        if (!templatePath.startsWith(__dirname)) {
            console.error('Path traversal attempt detected:', recipientConfig.templatePath);
            return res.status(500).send(t.templateError);
        }

        let templateContent;
        try {
            templateContent = await fs.readFile(templatePath, 'utf8');
        } catch (e) {
            templateContent = null;
        }

        if (templateContent && templateContent.includes('{{fields}}')) {
            // Dynamic template: replace {{fields}} with generated field rows
            let fieldsHtml = '';
            for (const [key, value] of fieldEntries) {
                if (value) {
                    fieldsHtml += `<li><strong>${escapeHtml(fieldToLabel(key))}:</strong> ${escapeHtml(String(value))}</li>\n`;
                }
            }
            mailBody = templateContent
                .replace(/{{website_id}}/g, escapeHtml(website_id) || 'Unknown')
                .replace(/{{fields}}/g, fieldsHtml);
        } else if (templateContent) {
            // Legacy template: replace individual {{field}} placeholders
            mailBody = templateContent.replace(/{{website_id}}/g, escapeHtml(website_id) || 'Unknown');
            for (const [key, value] of fieldEntries) {
                const regex = new RegExp(`{{${key}}}`, 'g');
                mailBody = mailBody.replace(regex, escapeHtml(String(value || '')) || 'Not specified');
            }
        } else {
            // No template: generate a simple email
            let fieldsHtml = '';
            for (const [key, value] of fieldEntries) {
                if (value) {
                    fieldsHtml += `<p><strong>${escapeHtml(fieldToLabel(key))}:</strong> ${escapeHtml(String(value))}</p>\n`;
                }
            }
            mailBody = `<h2>New submission from ${escapeHtml(website_id)}</h2>\n${fieldsHtml}`;
        }

        // Detect name and email for mail metadata
        const senderName = formFields.name || formFields.nombre || formFields.full_name || 'Contact';
        const senderEmail = email || '';

        const mailOptions = {
            from: `"${escapeHtml(String(senderName))}" <${config.smtp.from}>`,
            to: recipientConfig.to,
            subject: `${recipientConfig.subjectPrefix} ${escapeHtml(String(senderName))}`,
            html: mailBody,
            replyTo: senderEmail || undefined
        };

        // Send email
        try {
            await transporter.sendMail(mailOptions);
            console.log(`Email successfully sent to ${recipientConfig.to} for ${website_id}`);

            // Save submission to storage
            try {
                const ip = req.ip || '';
                const anonIp = ip.replace(/\.\d+$/, '.xxx');
                const submission = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    timestamp: new Date().toISOString(),
                    ip: anonIp
                };
                // Store all form fields dynamically
                for (const [key, value] of fieldEntries) {
                    submission[key] = String(value || '');
                }
                await saveSubmission(website_id, submission);
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
                res.status(200).json({ success: true, message: t.formSuccess });
            }

        } catch (error) {
            console.error('Error sending email:', error.message);
            res.status(500).send(t.serverError);
        }
    } catch (templateError) {
        console.error('Error reading email template:', templateError.message);
        res.status(500).send(t.templateReadError);
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
        return res.status(401).send(t.authRequired);
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
    return res.status(403).send(t.forbidden);
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
        // Calculate total submissions across all websites
        const stats = config.statistics || {};
        let totalSubmissions = 0;
        for (const ws of Object.values(stats)) {
            totalSubmissions += (ws.successfulSubmissions || 0);
        }
        res.json({
            status: 'ok',
            lang: LANG,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            port: PORT,
            totalSubmissions: totalSubmissions,
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
        res.status(500).json({ error: t.failedRetrieveStatus });
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
        return res.status(400).json({ error: t.missingIdOrConfig });
    }
    if (config.recipients[id]) {
        return res.status(409).json({ error: t.websiteExists });
    }
    config.recipients[id] = siteConfig;
    if (siteConfig.turnstileKey) {
        config.turnstile[id] = { secretKey: siteConfig.turnstileKey };
    }
    await fs.writeFile(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
    res.status(201).json({ message: t.websiteAdded });
});

// Update existing website configuration
adminRouter.put('/websites/:id', async (req, res) => {
    const { id } = req.params;
    const siteConfig = req.body;
    if (!config.recipients[id]) {
        return res.status(404).json({ error: t.websiteNotFound });
    }
    config.recipients[id] = { ...config.recipients[id], ...siteConfig };
    if (siteConfig.turnstileKey) {
        if (!config.turnstile) config.turnstile = {};
        config.turnstile[id] = { secretKey: siteConfig.turnstileKey };
    }
    await fs.writeFile(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
    res.json({ message: t.websiteUpdated });
});

// Delete a website configuration
adminRouter.delete('/websites/:id', async (req, res) => {
    const { id } = req.params;
    if (!config.recipients[id]) {
        return res.status(404).json({ error: t.websiteNotFound });
    }
    delete config.recipients[id];
    if (config.turnstile && config.turnstile[id]) {
        delete config.turnstile[id];
    }
    await fs.writeFile(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
    res.json({ message: t.websiteRemoved });
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
        return res.status(400).json({ error: t.invalidSmtp });
    }
    config.smtp = { ...config.smtp, ...newSmtp };
    try {
        await fs.writeFile(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
        res.json({ message: t.smtpUpdated });
    } catch (e) {
        console.error('Failed to write config:', e.message);
        res.status(500).json({ error: t.failedSaveConfig });
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
        return res.status(404).json({ error: t.websiteNotFound });
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
        return res.status(404).json({ error: t.websiteNotFound });
    }
    try {
        const currentConfig = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        if (!currentConfig.statistics) currentConfig.statistics = {};
        currentConfig.statistics[id] = { successfulSubmissions: 0, lastSubmission: null };
        await fs.writeFile('./config.json', JSON.stringify(currentConfig, null, 4));
        config.statistics = currentConfig.statistics;
        res.json({ message: t.statsReset, websiteId: id });
    } catch (e) {
        console.error('Failed to reset statistics:', e.message);
        res.status(500).json({ error: t.failedResetStats });
    }
});

// Submissions routes
adminRouter.get('/submissions/:websiteId', async (req, res) => {
    const { websiteId } = req.params;
    if (!config.recipients[websiteId]) {
        return res.status(404).json({ error: t.websiteNotFound });
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
        return res.status(404).json({ error: t.websiteNotFound });
    }
    const filePath = path.join(DATA_DIR, `submissions-${websiteId}.json`);
    try {
        await fs.writeFile(filePath, JSON.stringify([], null, 2));
        res.json({ message: t.submissionsDeleted });
    } catch (e) {
        res.status(500).json({ error: t.failedDeleteSubs });
    }
});

adminRouter.get('/submissions/:websiteId/export', async (req, res) => {
    const { websiteId } = req.params;
    if (!config.recipients[websiteId]) {
        return res.status(404).json({ error: t.websiteNotFound });
    }
    const format = req.query.format || 'json';
    const submissions = await loadSubmissions(websiteId);

    if (format === 'csv') {
        // Collect all unique field names across all submissions
        const headerSet = new Set();
        for (const s of submissions) {
            Object.keys(s).forEach(k => headerSet.add(k));
        }
        // Put id and timestamp first, ip last, rest alphabetical in between
        const meta = ['id', 'timestamp'];
        const trailing = ['ip'];
        const dynamicFields = Array.from(headerSet).filter(k => !meta.includes(k) && !trailing.includes(k)).sort();
        const headers = [...meta, ...dynamicFields, ...trailing].filter(h => headerSet.has(h));
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
        return res.status(400).json({ error: t.passwordRequired });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: t.passwordTooShort });
    }
    if (currentPassword !== config.admin.password) {
        return res.status(403).json({ error: t.passwordIncorrect });
    }
    try {
        const configData = await fs.readFile('./config.json', 'utf8');
        const currentConfig = JSON.parse(configData);
        currentConfig.admin.password = newPassword;
        await fs.writeFile('./config.json', JSON.stringify(currentConfig, null, 4));
        config.admin.password = newPassword;
        res.json({ message: t.passwordUpdated });
    } catch (e) {
        console.error('Failed to update password:', e.message);
        res.status(500).json({ error: t.failedUpdatePassword });
    }
});

app.use('/admin/api', adminRouter);

// Start the server
app.listen(PORT, () => {
    console.log(`Form processing server running on port ${PORT}`);
    console.log(`Health check available at: http://localhost:${PORT}/health`);
    console.log(`Admin UI available at: http://localhost:${PORT}/admin`);
});
