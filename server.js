const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const config = require('./config.json');
const pkg = require('./package.json');
const BCRYPT_ROUNDS = 10;

// Structured JSON logger
const log = {
    _emit(level, msg, meta = {}) {
        const entry = { ts: new Date().toISOString(), level, msg, ...meta };
        process.stdout.write(JSON.stringify(entry) + '\n');
    },
    info(msg, meta) { log._emit('info', msg, meta); },
    warn(msg, meta) { log._emit('warn', msg, meta); },
    error(msg, meta) { log._emit('error', msg, meta); }
};

// Simple async mutex for config.json writes with auto-backup
const CONFIG_PATH = path.join(__dirname, 'config.json');
const CONFIG_BACKUP_PATH = path.join(__dirname, 'config.backup.json');
let configWriteLock = Promise.resolve();
async function writeConfigSafe(mutator) {
    configWriteLock = configWriteLock.then(async () => {
        const raw = await fs.readFile(CONFIG_PATH, 'utf8');
        // Backup current config before writing
        await fs.writeFile(CONFIG_BACKUP_PATH, raw);
        const currentConfig = JSON.parse(raw);
        mutator(currentConfig);
        await fs.writeFile(CONFIG_PATH, JSON.stringify(currentConfig, null, 4));
        Object.assign(config, currentConfig);
    }).catch(e => {
        log.error('Config write error', { error: e.message });
        throw e;
    });
    return configWriteLock;
}

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
        formExists: 'Form ID already exists',
        formAdded: 'Form added',
        formNotFound: 'Form not found',
        formUpdated: 'Form updated',
        formRemoved: 'Form removed',
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
        failedRetrieveStatus: 'Failed to retrieve status',
        domainNotAllowed: 'Submissions from this domain are not allowed.'
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
        formExists: 'El ID del formulario ya existe',
        formAdded: 'Formulario agregado',
        formNotFound: 'Formulario no encontrado',
        formUpdated: 'Formulario actualizado',
        formRemoved: 'Formulario eliminado',
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
        failedRetrieveStatus: 'Error al obtener estado',
        domainNotAllowed: 'No se permiten envíos desde este dominio.'
    }
};
const t = serverMessages[LANG] || serverMessages.es;

// SSE client tracking for real-time inbox + outbox
const sseClients = new Set();

function broadcastSSE(payload) {
    const data = JSON.stringify(payload);
    for (const client of sseClients) {
        client.write(`data: ${data}\n\n`);
    }
}

// Override config with environment variables if provided
if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    if (!config.admin) config.admin = {};
    config.admin.username = process.env.ADMIN_USERNAME;
    config.admin.password = process.env.ADMIN_PASSWORD;
}

// Override SMTP config with environment variables if provided (applies to legacy smtp and default sender)
if (process.env.SMTP_HOST || process.env.SMTP_PORT || process.env.SMTP_FROM || process.env.SMTP_USER || process.env.SMTP_PASS || process.env.SMTP_SECURE) {
    if (!config.smtp) config.smtp = {};
    if (process.env.SMTP_HOST) config.smtp.host = process.env.SMTP_HOST;
    if (process.env.SMTP_PORT) config.smtp.port = parseInt(process.env.SMTP_PORT, 10);
    if (process.env.SMTP_SECURE) config.smtp.secure = process.env.SMTP_SECURE === 'true';
    if (process.env.SMTP_FROM) config.smtp.from = process.env.SMTP_FROM;
    if (process.env.SMTP_USER) config.smtp.user = process.env.SMTP_USER;
    if (process.env.SMTP_PASS) config.smtp.pass = process.env.SMTP_PASS;
}

// Auto-hash admin password if stored in plaintext (migration)
async function ensurePasswordHashed() {
    if (config.admin && config.admin.password && !config.admin.password.startsWith('$2b$')) {
        config.admin.password = await bcrypt.hash(config.admin.password, BCRYPT_ROUNDS);
        try {
            const currentConfig = JSON.parse(await fs.readFile('./config.json', 'utf8'));
            currentConfig.admin.password = config.admin.password;
            await fs.writeFile('./config.json', JSON.stringify(currentConfig, null, 4));
            log.info('Admin password auto-hashed on first run');
        } catch (e) {
            log.error('Failed to persist hashed password', { error: e.message });
        }
    }
}
ensurePasswordHashed();

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:"],
            frameSrc: ["'self'"],
        }
    }
}));

// Rate limiting for form submissions (per IP)
const submitLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many submissions. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting per form ID (global across all IPs)
const formSubmitCounts = new Map();
const FORM_RATE_LIMIT = 100; // max submissions per form per minute
const FORM_RATE_WINDOW = 60 * 1000;
setInterval(() => formSubmitCounts.clear(), FORM_RATE_WINDOW);

function checkFormRateLimit(formId) {
    const count = formSubmitCounts.get(formId) || 0;
    if (count >= FORM_RATE_LIMIT) return false;
    formSubmitCounts.set(formId, count + 1);
    return true;
}

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
    windowMs: 7 * 60 * 1000, // 7 minutes
    max: 20,
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

// Migrate legacy single smtp to senders map
if (config.smtp && !config.senders) {
    config.senders = { default: { name: 'Default', ...config.smtp } };
    // Persist migration
    const rawCfg = JSON.parse(require('fs').readFileSync(CONFIG_PATH, 'utf8'));
    if (!rawCfg.senders) {
        rawCfg.senders = { default: { name: 'Default', ...rawCfg.smtp } };
        require('fs').writeFileSync(CONFIG_PATH, JSON.stringify(rawCfg, null, 4));
    }
}
if (!config.senders) config.senders = {};

// Configure Nodemailer transporters (one per sender)
const transporters = {};
function buildTransporter(smtpConfig) {
    const tc = { ...smtpConfig };
    delete tc.name; // alias field, not for nodemailer
    if (tc.user && tc.pass) {
        tc.auth = { type: 'LOGIN', user: tc.user, pass: tc.pass };
    }
    delete tc.user;
    delete tc.pass;
    return nodemailer.createTransport(tc);
}
function rebuildAllTransporters() {
    for (const id of Object.keys(transporters)) delete transporters[id];
    for (const [id, cfg] of Object.entries(config.senders || {})) {
        transporters[id] = buildTransporter(cfg);
    }
}
rebuildAllTransporters();

// Get transporter for a form (by senderId, fallback to 'default' or first)
function getTransporterForForm(recipientCfg) {
    const senderId = recipientCfg.senderId || 'default';
    if (transporters[senderId]) {
        const senderCfg = config.senders[senderId];
        if (senderCfg && senderCfg.active === false) return { inactive: true, senderId };
        return { transporter: transporters[senderId], senderCfg };
    }
    // Fallback to first available
    const firstId = Object.keys(transporters)[0];
    if (firstId) {
        const senderCfg = config.senders[firstId];
        if (senderCfg && senderCfg.active === false) return { inactive: true, senderId: firstId };
        return { transporter: transporters[firstId], senderCfg };
    }
    return null;
}

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

// Save outbox entry (mail or notification log)
async function saveOutboxEntry(websiteId, entry) {
    await ensureDataDir();
    const filePath = path.join(DATA_DIR, `outbox-${websiteId}.json`);
    let entries = [];
    try {
        const data = await fs.readFile(filePath, 'utf8');
        entries = JSON.parse(data);
    } catch (e) {}
    entries.unshift(entry);
    if (entries.length > 500) entries = entries.slice(0, 500);
    await fs.writeFile(filePath, JSON.stringify(entries, null, 2));
}

// Load outbox entries
async function loadOutboxEntries(websiteId) {
    const filePath = path.join(DATA_DIR, `outbox-${websiteId}.json`);
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
    const { website_id, 'cf-turnstile-response': turnstileToken, 'h-captcha-response': hcaptchaToken, 'g-recaptcha-response': gRecaptchaToken, _hp_field: honeypot, ...formFields } = req.body;

    // Honeypot check: if the hidden field has a value, silently reject (bot filled it)
    if (honeypot) {
        log.warn('Honeypot triggered', { formId: website_id, ip: req.ip });
        return res.status(200).json({ success: true, message: t.formSuccess }); // Fake success to fool bots
    }

    // Validate and route
    if (!website_id || typeof website_id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(website_id)) {
        return res.status(400).send(t.invalidFormId);
    }
    const recipientConfig = config.recipients[website_id];
    if (!recipientConfig) {
        return res.status(400).send(t.invalidFormId);
    }

    // Per-form global rate limit
    if (!checkFormRateLimit(website_id)) {
        return res.status(429).send('Too many submissions for this form. Please try again later.');
    }

    // Domain validation: check Origin against form's allowedDomains
    if (recipientConfig.allowedDomains && recipientConfig.allowedDomains.length > 0) {
        const origin = req.headers.origin || req.headers.referer || '';
        const originHost = (() => {
            try { return new URL(origin).origin; } catch { return ''; }
        })();
        const allowed = recipientConfig.allowedDomains.some(d => {
            try { return new URL(d).origin === originHost; } catch { return d === originHost; }
        });
        if (!allowed) {
            log.warn('Origin rejected', { formId: website_id, origin });
            return res.status(403).send(t.domainNotAllowed);
        }
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

    // Verify captcha token (skip if DEBUG or captcha disabled for this form)
    // Backward compat: support both config.captcha and config.turnstile, and both captchaEnabled and turnstileEnabled
    const captchaSecrets = config.captcha || config.turnstile || {};
    const captchaEnabled = (recipientConfig.captchaEnabled !== undefined ? recipientConfig.captchaEnabled : recipientConfig.turnstileEnabled) !== false && !!captchaSecrets[website_id];
    if (!DEBUG && captchaEnabled) {
        const provider = recipientConfig.captchaProvider || 'turnstile';
        const captchaToken = provider === 'hcaptcha' ? (hcaptchaToken || gRecaptchaToken) : turnstileToken;

        if (!captchaToken) {
            log.warn('No captcha token provided', { formId: website_id, provider });
            return res.status(400).send(t.completeCaptcha);
        }

        const captchaConfig = captchaSecrets[website_id];
        if (!captchaConfig) {
            log.error('No captcha config found', { formId: website_id, provider });
            return res.status(400).send(t.invalidSubmission);
        }

        const verifyUrl = provider === 'hcaptcha'
            ? 'https://api.hcaptcha.com/siteverify'
            : 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

        try {
            const verificationResponse = await axios.post(
                verifyUrl,
                new URLSearchParams({
                    secret: captchaConfig.secretKey,
                    response: captchaToken,
                    remoteip: req.ip
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const { success, 'error-codes': errorCodes } = verificationResponse.data;
            if (!success) {
                log.warn('Captcha verification failed', { formId: website_id, provider, errorCodes });
                return res.status(400).send(t.captchaFailed);
            }
        } catch (error) {
            log.error('Error verifying captcha token', { formId: website_id, provider, error: error.message });
            return res.status(500).send(t.captchaError);
        }
    } else if (DEBUG) {
        log.info('DEBUG mode: Skipping captcha verification', { formId: website_id });
    } else {
        log.info('Captcha disabled, skipping verification', { formId: website_id });
    }

    // Build email from template or generate dynamic email
    try {
        let mailBody;
        const templatePath = path.resolve(__dirname, recipientConfig.templatePath);
        if (!templatePath.startsWith(__dirname)) {
            log.error('Path traversal attempt detected', { formId: website_id, path: recipientConfig.templatePath });
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
                // Use string split+join to avoid regex injection from user-supplied keys
                const placeholder = `{{${key}}}`;
                mailBody = mailBody.split(placeholder).join(escapeHtml(String(value || '')) || 'Not specified');
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

        // Get the correct transporter for this form's sender
        const senderInfo = getTransporterForForm(recipientConfig);
        const skipEmail = !senderInfo || senderInfo.inactive;
        if (skipEmail && senderInfo && senderInfo.inactive) {
            log.info('Sender disabled, skipping email', { formId: website_id, senderId: senderInfo.senderId });
            const skipEntry = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                timestamp: new Date().toISOString(),
                channel: 'email',
                to: recipientConfig.to,
                subject: `${recipientConfig.subjectPrefix} ${escapeHtml(String(senderName))}`,
                status: 'skipped'
            };
            saveOutboxEntry(website_id, skipEntry).catch(() => {});
            broadcastSSE({ type: 'outbox', websiteId: website_id, ...skipEntry });
        } else if (!senderInfo) {
            log.info('No sender configured, skipping email', { formId: website_id });
        }

        const emailSubject = `${recipientConfig.subjectPrefix} ${escapeHtml(String(senderName))}`;
        const emailTimestamp = new Date().toISOString();
        let emailOk = false;

        // Send email (only if sender exists and is active)
        if (!skipEmail) {
            const mailOptions = {
                from: `"${escapeHtml(String(senderName))}" <${senderInfo.senderCfg.from}>`,
                to: recipientConfig.to,
                subject: emailSubject,
                html: mailBody,
                replyTo: senderEmail || undefined
            };

            try {
                await senderInfo.transporter.sendMail(mailOptions);
                log.info('Email sent', { formId: website_id, to: recipientConfig.to });
                emailOk = true;

                const mailEntry = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    timestamp: emailTimestamp,
                    channel: 'email',
                    to: recipientConfig.to,
                    subject: emailSubject,
                    status: 'ok'
                };
                saveOutboxEntry(website_id, mailEntry).catch(e => log.error('Error saving outbox entry', { error: e.message }));
                broadcastSSE({ type: 'outbox', websiteId: website_id, ...mailEntry });
            } catch (error) {
                log.error('Error sending email', { formId: website_id, error: error.message });

                const mailFailEntry = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    timestamp: emailTimestamp,
                    channel: 'email',
                    to: recipientConfig.to,
                    subject: emailSubject,
                    status: 'error',
                    error: error.message
                };
                saveOutboxEntry(website_id, mailFailEntry).catch(() => {});
                broadcastSSE({ type: 'outbox', websiteId: website_id, ...mailFailEntry });

                return res.status(500).send(t.serverError);
            }
        }

            // Save submission to storage
            try {
                const ip = req.ip || '';
                // Anonymize: IPv4 last octet, IPv6 last 80 bits
                const anonIp = ip.includes(':')
                    ? ip.replace(/(:[0-9a-fA-F]*){5}$/, ':xxxx:xxxx:xxxx:xxxx:xxxx')
                    : ip.replace(/\.\d+$/, '.xxx');
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

                // Broadcast to SSE inbox clients
                broadcastSSE({
                    type: 'submission',
                    websiteId: website_id,
                    id: submission.id,
                    timestamp: submission.timestamp,
                    name: formFields.name || formFields.nombre || formFields.full_name || '',
                    email: formFields.email || formFields.correo || formFields.e_mail || '',
                    preview: fieldEntries
                        .filter(([k]) => !['name','nombre','full_name','email','correo','e_mail','website_id','cf-turnstile-response','h-captcha-response','g-recaptcha-response'].includes(k))
                        .slice(0, 5)
                        .map(([k, v]) => ({ label: fieldToLabel(k), value: String(v || '').substring(0, 100) }))
                });
            } catch (storageError) {
                log.error('Error saving submission', { formId: website_id, error: storageError.message });
            }

            // Update statistics
            try {
                await writeConfigSafe(cfg => {
                    if (!cfg.statistics) cfg.statistics = {};
                    if (!cfg.statistics[website_id]) {
                        cfg.statistics[website_id] = { successfulSubmissions: 0, lastSubmission: null, mailsSent: 0, notificationsSent: 0 };
                    }
                    cfg.statistics[website_id].successfulSubmissions++;
                    if (emailOk) cfg.statistics[website_id].mailsSent = (cfg.statistics[website_id].mailsSent || 0) + 1;
                    cfg.statistics[website_id].lastSubmission = new Date().toISOString();
                });
            } catch (statsError) {
                log.error('Error updating statistics', { formId: website_id, error: statsError.message });
            }

            // Send Discord webhook notification if configured
            if (recipientConfig.discordWebhook) {
                const discordTimestamp = new Date().toISOString();
                try {
                    const sName = formFields.name || formFields.nombre || formFields.full_name || 'Unknown';
                    const sEmail = email || 'N/A';
                    const fieldsForDiscord = fieldEntries
                        .filter(([k]) => !['website_id','cf-turnstile-response','h-captcha-response','g-recaptcha-response','_hp_field'].includes(k))
                        .slice(0, 10)
                        .map(([k, v]) => ({ name: fieldToLabel(k), value: String(v || '').substring(0, 200) || '-', inline: true }));
                    await axios.post(recipientConfig.discordWebhook, {
                        embeds: [{
                            title: `New submission: ${website_id}`,
                            color: 0xe8713a,
                            fields: fieldsForDiscord,
                            footer: { text: 'formPost' },
                            timestamp: discordTimestamp
                        }]
                    }, { timeout: 5000 });
                    log.info('Discord webhook sent', { formId: website_id });

                    // Log to outbox
                    const discordEntry = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        timestamp: discordTimestamp,
                        channel: 'discord',
                        status: 'ok'
                    };
                    saveOutboxEntry(website_id, discordEntry).catch(e => log.error('Error saving outbox entry', { error: e.message }));
                    broadcastSSE({ type: 'outbox', websiteId: website_id, ...discordEntry });

                    // Update notification count
                    writeConfigSafe(cfg => {
                        if (cfg.statistics && cfg.statistics[website_id]) {
                            cfg.statistics[website_id].notificationsSent = (cfg.statistics[website_id].notificationsSent || 0) + 1;
                        }
                    }).catch(() => {});
                } catch (webhookErr) {
                    log.error('Discord webhook failed', { formId: website_id, error: webhookErr.message });

                    // Log failure to outbox
                    const discordFailEntry = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        timestamp: discordTimestamp,
                        channel: 'discord',
                        status: 'error',
                        error: webhookErr.message
                    };
                    saveOutboxEntry(website_id, discordFailEntry).catch(() => {});
                    broadcastSSE({ type: 'outbox', websiteId: website_id, ...discordFailEntry });
                }
            }

            // Send Telegram notification if configured
            if (recipientConfig.telegramBotToken && recipientConfig.telegramChatId) {
                const telegramTimestamp = new Date().toISOString();
                try {
                    const tName = formFields.name || formFields.nombre || formFields.full_name || 'Unknown';
                    const tFields = fieldEntries
                        .filter(([k]) => !['website_id','cf-turnstile-response','h-captcha-response','g-recaptcha-response','_hp_field'].includes(k))
                        .slice(0, 10)
                        .map(([k, v]) => `<b>${escapeHtml(fieldToLabel(k))}:</b> ${escapeHtml(String(v || '-').substring(0, 200))}`)
                        .join('\n');
                    const telegramText = `📩 <b>New submission: ${escapeHtml(website_id)}</b>\n\n${tFields}\n\n<i>formPost</i>`;
                    await axios.post(
                        `https://api.telegram.org/bot${recipientConfig.telegramBotToken}/sendMessage`,
                        { chat_id: recipientConfig.telegramChatId, text: telegramText, parse_mode: 'HTML' },
                        { timeout: 5000 }
                    );
                    log.info('Telegram notification sent', { formId: website_id });

                    const telegramEntry = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        timestamp: telegramTimestamp,
                        channel: 'telegram',
                        status: 'ok'
                    };
                    saveOutboxEntry(website_id, telegramEntry).catch(() => {});
                    broadcastSSE({ type: 'outbox', websiteId: website_id, ...telegramEntry });

                    writeConfigSafe(cfg => {
                        if (cfg.statistics && cfg.statistics[website_id]) {
                            cfg.statistics[website_id].notificationsSent = (cfg.statistics[website_id].notificationsSent || 0) + 1;
                        }
                    }).catch(() => {});
                } catch (telegramErr) {
                    log.error('Telegram notification failed', { formId: website_id, error: telegramErr.message });

                    const telegramFailEntry = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        timestamp: telegramTimestamp,
                        channel: 'telegram',
                        status: 'error',
                        error: telegramErr.message
                    };
                    saveOutboxEntry(website_id, telegramFailEntry).catch(() => {});
                    broadcastSSE({ type: 'outbox', websiteId: website_id, ...telegramFailEntry });
                }
            }

            // Send generic webhook if configured
            if (recipientConfig.webhookUrl) {
                try {
                    const webhookPayload = {
                        formId: website_id,
                        timestamp: new Date().toISOString(),
                        fields: {}
                    };
                    for (const [k, v] of fieldEntries) {
                        webhookPayload.fields[k] = String(v || '');
                    }
                    await axios.post(recipientConfig.webhookUrl, webhookPayload, {
                        timeout: 5000,
                        headers: { 'Content-Type': 'application/json', 'User-Agent': 'formPost/' + pkg.version }
                    });
                    log.info('Webhook sent', { formId: website_id, url: recipientConfig.webhookUrl });
                } catch (webhookErr) {
                    log.error('Webhook failed', { formId: website_id, error: webhookErr.message });
                }
            }

            // Auto-responder: send confirmation email to the submitter
            if (recipientConfig.autoReplyEnabled && senderEmail && !skipEmail) {
                try {
                    const autoReplyTemplatePath = path.resolve(__dirname, recipientConfig.autoReplyTemplate || 'templates/auto-reply.html');
                    let autoReplyBody;
                    try {
                        const arTemplate = await fs.readFile(autoReplyTemplatePath, 'utf8');
                        let arFields = '';
                        for (const [key, value] of fieldEntries) {
                            if (value) arFields += `<li><strong>${escapeHtml(fieldToLabel(key))}:</strong> ${escapeHtml(String(value))}</li>\n`;
                        }
                        autoReplyBody = arTemplate
                            .replace(/{{website_id}}/g, escapeHtml(website_id))
                            .replace(/{{fields}}/g, arFields);
                    } catch (e) {
                        autoReplyBody = '<h2>Thank you for your submission</h2><p>We have received your message and will get back to you soon.</p>';
                    }
                    const arSubject = recipientConfig.autoReplySubject || 'Thank you for your submission';
                    await senderInfo.transporter.sendMail({
                        from: `"${escapeHtml(String(senderInfo.senderCfg.name || 'No Reply'))}" <${senderInfo.senderCfg.from}>`,
                        to: senderEmail,
                        subject: arSubject,
                        html: autoReplyBody
                    });
                    log.info('Auto-reply sent', { formId: website_id, to: senderEmail });

                    const arEntry = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        timestamp: new Date().toISOString(),
                        channel: 'email',
                        to: senderEmail,
                        subject: arSubject,
                        status: 'ok',
                        autoReply: true
                    };
                    saveOutboxEntry(website_id, arEntry).catch(() => {});
                    broadcastSSE({ type: 'outbox', websiteId: website_id, ...arEntry });

                    writeConfigSafe(cfg => {
                        if (cfg.statistics && cfg.statistics[website_id]) {
                            cfg.statistics[website_id].mailsSent = (cfg.statistics[website_id].mailsSent || 0) + 1;
                        }
                    }).catch(() => {});
                } catch (arErr) {
                    log.error('Auto-reply failed', { formId: website_id, error: arErr.message });
                }
            }

            // Redirect or respond with success
            if (recipientConfig.redirectUrl) {
                res.redirect(302, recipientConfig.redirectUrl);
            } else {
                res.status(200).json({ success: true, message: t.formSuccess });
            }
    } catch (templateError) {
        log.error('Error reading email template', { formId: website_id, error: templateError.message });
        res.status(500).send(t.templateReadError);
    }
});

// Health Check Endpoint - minimal info, no internals exposed
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Admin authentication middleware
async function adminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send(t.authRequired);
    }
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [user, ...passParts] = credentials.split(':');
    const pass = passParts.join(':');

    if (DEBUG) {
        log.info('Admin auth attempt', { user });
    }

    if (config.admin && user === config.admin.username) {
        const match = await bcrypt.compare(pass, config.admin.password);
        if (match) return next();
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

app.get('/fav-icon.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'fav-icon.png'));
});

app.get('/logo_beweb.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'logo_beweb.png'));
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
        let totalSubmissions = 0, totalMails = 0, totalNotifications = 0;
        for (const ws of Object.values(stats)) {
            totalSubmissions += (ws.successfulSubmissions || 0);
            totalMails += (ws.mailsSent || 0);
            totalNotifications += (ws.notificationsSent || 0);
        }
        res.json({
            status: 'ok',
            version: pkg.version,
            lang: LANG,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            port: PORT,
            totalSubmissions,
            totalMails,
            totalNotifications,
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
            },
            config: {
                websites: Object.keys(config.recipients),
                senders: Object.keys(config.senders || {}),
                captcha: Object.keys(config.captcha || config.turnstile || {})
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
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
        return res.status(400).json({ error: t.invalidFormId });
    }
    if (config.recipients[id]) {
        return res.status(409).json({ error: t.formExists });
    }
    try {
        await writeConfigSafe(cfg => {
            cfg.recipients[id] = siteConfig;
            if (siteConfig.captchaKey) {
                if (!cfg.captcha) cfg.captcha = {};
                cfg.captcha[id] = { secretKey: siteConfig.captchaKey };
            }
        });
        res.status(201).json({ message: t.formAdded });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// Update existing website configuration
adminRouter.put('/websites/:id', async (req, res) => {
    const { id } = req.params;
    const siteConfig = req.body;
    if (!config.recipients[id]) {
        return res.status(404).json({ error: t.formNotFound });
    }
    try {
        await writeConfigSafe(cfg => {
            cfg.recipients[id] = { ...cfg.recipients[id], ...siteConfig };
            if (siteConfig.captchaKey) {
                if (!cfg.captcha) cfg.captcha = {};
                cfg.captcha[id] = { secretKey: siteConfig.captchaKey };
            }
            if (siteConfig.captchaEnabled === false) {
                cfg.recipients[id].captchaEnabled = false;
            } else if (siteConfig.captchaEnabled === true) {
                cfg.recipients[id].captchaEnabled = true;
            }
            if (siteConfig.captchaProvider) {
                cfg.recipients[id].captchaProvider = siteConfig.captchaProvider;
            }
        });
        res.json({ message: t.formUpdated });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// Delete a website configuration
adminRouter.delete('/websites/:id', async (req, res) => {
    const { id } = req.params;
    if (!config.recipients[id]) {
        return res.status(404).json({ error: t.formNotFound });
    }
    try {
        await writeConfigSafe(cfg => {
            delete cfg.recipients[id];
            if (cfg.captcha && cfg.captcha[id]) {
                delete cfg.captcha[id];
            }
            // Backward compat cleanup
            if (cfg.turnstile && cfg.turnstile[id]) {
                delete cfg.turnstile[id];
            }
        });
        res.json({ message: t.formRemoved });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// Senders (SMTP relays) CRUD routes
adminRouter.get('/senders', (req, res) => {
    const sanitized = {};
    for (const [id, cfg] of Object.entries(config.senders || {})) {
        sanitized[id] = {
            name: cfg.name || id,
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            active: cfg.active !== false,
            from: cfg.from,
            user: cfg.user || '',
            pass: cfg.pass ? '••••' : ''
        };
    }
    res.json(sanitized);
});

adminRouter.post('/senders', async (req, res) => {
    const { id, config: senderConfig } = req.body;
    if (!id || !senderConfig) return res.status(400).json({ error: t.missingIdOrConfig });
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) return res.status(400).json({ error: 'Invalid sender ID' });
    if (config.senders[id]) return res.status(409).json({ error: 'Sender ID already exists' });
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.senders) cfg.senders = {};
            cfg.senders[id] = senderConfig;
        });
        rebuildAllTransporters();
        res.status(201).json({ message: 'Sender added' });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.put('/senders/:id', async (req, res) => {
    const { id } = req.params;
    if (!config.senders || !config.senders[id]) return res.status(404).json({ error: 'Sender not found' });
    const update = req.body;
    try {
        await writeConfigSafe(cfg => {
            cfg.senders[id] = { ...cfg.senders[id], ...update };
        });
        rebuildAllTransporters();
        res.json({ message: t.smtpUpdated });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.delete('/senders/:id', async (req, res) => {
    const { id } = req.params;
    if (!config.senders || !config.senders[id]) return res.status(404).json({ error: 'Sender not found' });
    try {
        await writeConfigSafe(cfg => {
            delete cfg.senders[id];
        });
        delete transporters[id];
        res.json({ message: 'Sender removed' });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// Test sender connection
adminRouter.post('/senders/:id/test', async (req, res) => {
    const { id } = req.params;
    const senderCfg = config.senders && config.senders[id];
    if (!senderCfg) return res.status(404).json({ error: 'Sender not found' });
    const testTo = (req.body && req.body.to) || senderCfg.from;
    if (!testTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }
    try {
        const testTransporter = buildTransporter(senderCfg);
        await testTransporter.verify();
        await testTransporter.sendMail({
            from: senderCfg.from,
            to: testTo,
            subject: 'formPost - Test Connection',
            html: '<h2>formPost SMTP Test</h2><p>This is a test email from formPost to verify that the SMTP sender <strong>' + escapeHtml(senderCfg.name || id) + '</strong> is working correctly.</p><p>If you received this email, the configuration is correct.</p>'
        });
        res.json({ message: 'Test email sent to ' + testTo });
    } catch (e) {
        log.error('Sender test failed', { senderId: id, error: e.message });
        res.status(500).json({ error: 'Connection failed: ' + e.message });
    }
});

// Legacy SMTP endpoint (backward compat — redirects to default sender)
adminRouter.get('/smtp', (req, res) => {
    const def = config.senders && config.senders.default;
    if (!def) return res.json({});
    res.json({ host: def.host, port: def.port, secure: def.secure, from: def.from, user: def.user ? '****' : '', pass: def.pass ? '****' : '' });
});

adminRouter.put('/smtp', async (req, res) => {
    const newSmtp = req.body;
    if (!newSmtp || typeof newSmtp !== 'object') return res.status(400).json({ error: t.invalidSmtp });
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.senders) cfg.senders = {};
            cfg.senders.default = { ...cfg.senders.default, name: 'Default', ...newSmtp };
        });
        rebuildAllTransporters();
        res.json({ message: t.smtpUpdated });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// Submissions chart data: aggregated by day per form (must be before :id route)
adminRouter.get('/statistics/chart', async (req, res) => {
    const period = req.query.period || 'month';
    const now = new Date();
    let since;
    if (period === 'today') since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (period === 'week') { since = new Date(now); since.setDate(since.getDate() - 7); }
    else if (period === 'year') { since = new Date(now); since.setFullYear(since.getFullYear() - 1); }
    else { since = new Date(now); since.setDate(since.getDate() - 30); }

    const submissions = {};
    const mails = {};
    const notifications = {};
    for (const formId of Object.keys(config.recipients)) {
        // Submissions per day
        const subs = await loadSubmissions(formId);
        const subCounts = {};
        for (const sub of subs) {
            if (!sub.timestamp) continue;
            const d = new Date(sub.timestamp);
            if (d < since) continue;
            const key = d.toISOString().substring(0, 10);
            subCounts[key] = (subCounts[key] || 0) + 1;
        }
        submissions[formId] = subCounts;

        // Outbox entries per day (mails and notifications)
        const outbox = await loadOutboxEntries(formId);
        const mailCounts = {};
        const notifCounts = {};
        for (const entry of outbox) {
            if (!entry.timestamp) continue;
            const d = new Date(entry.timestamp);
            if (d < since) continue;
            const key = d.toISOString().substring(0, 10);
            if (entry.channel === 'email') {
                mailCounts[key] = (mailCounts[key] || 0) + 1;
            } else if (entry.channel === 'discord') {
                notifCounts[key] = (notifCounts[key] || 0) + 1;
            }
        }
        mails[formId] = mailCounts;
        notifications[formId] = notifCounts;
    }
    res.json({ submissions, mails, notifications });
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
        return res.status(404).json({ error: t.formNotFound });
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
        return res.status(404).json({ error: t.formNotFound });
    }
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.statistics) cfg.statistics = {};
            cfg.statistics[id] = { successfulSubmissions: 0, lastSubmission: null, mailsSent: 0, notificationsSent: 0 };
        });
        res.json({ message: t.statsReset, websiteId: id });
    } catch (e) {
        log.error('Failed to reset statistics', { error: e.message });
        res.status(500).json({ error: t.failedResetStats });
    }
});

// Submissions routes
adminRouter.get('/submissions/:websiteId', async (req, res) => {
    const { websiteId } = req.params;
    if (!config.recipients[websiteId]) {
        return res.status(404).json({ error: t.formNotFound });
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const q = (req.query.q || '').toLowerCase().trim();
    let submissions = await loadSubmissions(websiteId);
    if (q) {
        submissions = submissions.filter(s => {
            const name = (s.name || s.nombre || s.full_name || '').toLowerCase();
            const email = (s.email || s.correo || s.e_mail || '').toLowerCase();
            return name.includes(q) || email.includes(q);
        });
    }
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
        return res.status(404).json({ error: t.formNotFound });
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
        return res.status(404).json({ error: t.formNotFound });
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

// Template management routes
const TEMPLATES_DIR = path.join(__dirname, 'templates');
async function ensureTemplatesDir() {
    try { await fs.mkdir(TEMPLATES_DIR, { recursive: true }); } catch (e) {}
}
ensureTemplatesDir();

// List all available templates (from templates/ dir + root email-template*.html files)
adminRouter.get('/templates', async (req, res) => {
    const templates = [];
    // Scan templates/ directory
    try {
        const files = await fs.readdir(TEMPLATES_DIR);
        for (const f of files) {
            if (f.endsWith('.html')) {
                templates.push({ name: f, path: `templates/${f}` });
            }
        }
    } catch (e) {}
    // Scan root for legacy email-template*.html files
    try {
        const rootFiles = await fs.readdir(__dirname);
        for (const f of rootFiles) {
            if (f.startsWith('email-template') && f.endsWith('.html')) {
                templates.push({ name: f, path: f });
            }
        }
    } catch (e) {}
    res.json(templates);
});

// Get template content
adminRouter.get('/templates/:name', async (req, res) => {
    const name = req.params.name;
    // Try templates/ dir first, then root
    const candidates = [
        path.join(TEMPLATES_DIR, name),
        path.join(__dirname, name)
    ];
    for (const filePath of candidates) {
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(__dirname)) continue;
        try {
            const content = await fs.readFile(resolved, 'utf8');
            return res.json({ name, path: resolved.startsWith(TEMPLATES_DIR) ? `templates/${name}` : name, content });
        } catch (e) {}
    }
    res.status(404).json({ error: 'Template not found' });
});

// Create or update a template (always saves to templates/ dir)
adminRouter.put('/templates/:name', async (req, res) => {
    const name = req.params.name;
    if (!name.endsWith('.html') || name.includes('/') || name.includes('\\')) {
        return res.status(400).json({ error: 'Invalid template name' });
    }
    const { content } = req.body;
    if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Content is required' });
    }
    await ensureTemplatesDir();
    const filePath = path.join(TEMPLATES_DIR, name);
    try {
        await fs.writeFile(filePath, content, 'utf8');
        res.json({ message: 'Template saved', path: `templates/${name}` });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save template' });
    }
});

// Delete a template (only from templates/ dir)
adminRouter.delete('/templates/:name', async (req, res) => {
    const name = req.params.name;
    if (name.includes('/') || name.includes('\\')) {
        return res.status(400).json({ error: 'Invalid template name' });
    }
    const filePath = path.join(TEMPLATES_DIR, name);
    try {
        await fs.unlink(filePath);
        res.json({ message: 'Template deleted' });
    } catch (e) {
        res.status(404).json({ error: 'Template not found' });
    }
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
    const passwordMatch = await bcrypt.compare(currentPassword, config.admin.password);
    if (!passwordMatch) {
        return res.status(403).json({ error: t.passwordIncorrect });
    }
    try {
        const hashedNew = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await writeConfigSafe(cfg => {
            cfg.admin.password = hashedNew;
        });
        res.json({ message: t.passwordUpdated });
    } catch (e) {
        log.error('Failed to update password', { error: e.message });
        res.status(500).json({ error: t.failedUpdatePassword });
    }
});

// Recent inbox entries (last N submissions across all forms)
adminRouter.get('/inbox/recent', async (req, res) => {
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit) || 4));
    const all = [];
    for (const formId of Object.keys(config.recipients)) {
        const subs = await loadSubmissions(formId);
        for (const sub of subs.slice(0, limit)) {
            const fields = Object.entries(sub).filter(([k]) => !['id','timestamp','ip'].includes(k));
            const name = sub.name || sub.nombre || sub.full_name || '';
            const email = sub.email || sub.correo || sub.e_mail || '';
            const preview = fields
                .filter(([k]) => !['name','nombre','full_name','email','correo','e_mail','website_id','cf-turnstile-response','h-captcha-response','g-recaptcha-response'].includes(k))
                .slice(0, 2)
                .map(([k, v]) => ({ label: fieldToLabel(k), value: String(v || '').substring(0, 100) }));
            all.push({ websiteId: formId, id: sub.id, timestamp: sub.timestamp, name, email, preview });
        }
    }
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(all.slice(0, limit));
});

// Outbox recent entries
adminRouter.get('/outbox/recent', async (req, res) => {
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit) || 4));
    const all = [];
    for (const formId of Object.keys(config.recipients)) {
        const entries = await loadOutboxEntries(formId);
        for (const entry of entries.slice(0, limit)) {
            all.push({ websiteId: formId, ...entry });
        }
    }
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(all.slice(0, limit));
});

// Outbox entries for a specific form (paginated)
adminRouter.get('/outbox/:websiteId', async (req, res) => {
    const { websiteId } = req.params;
    if (!config.recipients[websiteId]) return res.status(404).json({ error: 'Form not found' });
    const entries = await loadOutboxEntries(websiteId);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const start = (page - 1) * limit;
    res.json({
        entries: entries.slice(start, start + limit),
        total: entries.length,
        page,
        pages: Math.ceil(entries.length / limit)
    });
});

// SSE token management - temporary tokens instead of credentials in query string
const sseTokens = new Map(); // token -> { expires }
const SSE_TOKEN_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_SSE_CLIENTS = 20;

// Issue a short-lived SSE token (requires admin auth)
adminRouter.post('/inbox/token', (req, res) => {
    const token = require('crypto').randomBytes(32).toString('hex');
    sseTokens.set(token, { expires: Date.now() + SSE_TOKEN_TTL });
    // Cleanup expired tokens
    for (const [t, v] of sseTokens) {
        if (v.expires < Date.now()) sseTokens.delete(t);
    }
    res.json({ token, expiresIn: SSE_TOKEN_TTL });
});

// SSE Inbox Stream - auth via temporary token
app.get('/admin/api/inbox/stream', adminLimiter, (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(401).send(t.authRequired);
    const tokenData = sseTokens.get(token);
    if (!tokenData || tokenData.expires < Date.now()) {
        sseTokens.delete(token);
        return res.status(403).send(t.forbidden);
    }
    // Token is single-use for connection establishment
    sseTokens.delete(token);

    if (sseClients.size >= MAX_SSE_CLIENTS) {
        return res.status(503).send('Too many connections');
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    sseClients.add(res);

    const keepalive = setInterval(() => res.write(': keepalive\n\n'), 30000);
    req.on('close', () => { clearInterval(keepalive); sseClients.delete(res); });
});

// Backup: export full config + templates
adminRouter.get('/backup', async (req, res) => {
    try {
        const backup = {
            version: pkg.version,
            timestamp: new Date().toISOString(),
            recipients: config.recipients,
            senders: config.senders || {},
            captcha: config.captcha || {},
            cors: config.cors || {},
            smtp: config.smtp || {},
            templates: {}
        };
        // Include template files
        const templatesDir = path.join(__dirname, 'templates');
        try {
            const files = await fs.readdir(templatesDir);
            for (const file of files) {
                if (file.endsWith('.html')) {
                    backup.templates[file] = await fs.readFile(path.join(templatesDir, file), 'utf8');
                }
            }
        } catch (e) {}
        // Include root email template if exists
        try {
            backup.templates['email-template.html'] = await fs.readFile(path.join(__dirname, 'email-template.html'), 'utf8');
        } catch (e) {}
        res.setHeader('Content-Disposition', 'attachment; filename="formpost-backup-' + new Date().toISOString().substring(0, 10) + '.json"');
        res.json(backup);
    } catch (e) {
        res.status(500).json({ error: 'Backup failed' });
    }
});

// Restore: import config + templates
adminRouter.post('/restore', async (req, res) => {
    const backup = req.body;
    if (!backup || !backup.recipients) {
        return res.status(400).json({ error: 'Invalid backup file' });
    }
    try {
        await writeConfigSafe(cfg => {
            if (backup.recipients) cfg.recipients = backup.recipients;
            if (backup.senders) cfg.senders = backup.senders;
            if (backup.captcha) cfg.captcha = backup.captcha;
            if (backup.cors) cfg.cors = backup.cors;
            if (backup.smtp) cfg.smtp = backup.smtp;
        });
        // Restore templates
        if (backup.templates) {
            const templatesDir = path.join(__dirname, 'templates');
            await fs.mkdir(templatesDir, { recursive: true }).catch(() => {});
            for (const [filename, content] of Object.entries(backup.templates)) {
                const filePath = filename === 'email-template.html'
                    ? path.join(__dirname, filename)
                    : path.join(templatesDir, filename);
                await fs.writeFile(filePath, content);
            }
        }
        rebuildAllTransporters();
        res.json({ message: 'Backup restored successfully' });
    } catch (e) {
        res.status(500).json({ error: 'Restore failed: ' + e.message });
    }
});

app.use('/admin/api', adminRouter);

// Start the server
app.listen(PORT, () => {
    log.info('formPost server started', { port: PORT, health: `/health`, admin: `/admin` });
});
