const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const multer = require('multer');
const FormData = require('form-data');
const os = require('os');
const config = require('./config.json');

// Multer config: temp uploads with size limits
const UPLOAD_DIR = path.join(os.tmpdir(), 'formpost-uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 5;
const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
    fileFilter: (req, file, cb) => {
        // Block executable and dangerous file types
        const blocked = /\.(exe|bat|cmd|sh|ps1|msi|dll|com|scr|pif|vbs|js|jar|cpl|inf|reg)$/i;
        if (blocked.test(file.originalname)) {
            return cb(new Error('File type not allowed'));
        }
        cb(null, true);
    }
});
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

// ===== Secret encryption at rest (AES-256-GCM) =====
// Key source: ENCRYPTION_KEY env var (64 hex chars) or auto-generated data/.secret.key.
// Encrypted values are stored as 'enc:v1:' + base64(iv|authTag|ciphertext).
const nodeCrypto = require('crypto');
const ENC_PREFIX = 'enc:v1:';
const KEY_FILE = path.join(__dirname, 'data', '.secret.key');
const ENCRYPTION_KEY = (() => {
    const envKey = (process.env.ENCRYPTION_KEY || '').trim();
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) return Buffer.from(envKey, 'hex');
    if (envKey) log.warn('ENCRYPTION_KEY env var is set but is not 64 hex chars — ignoring it');
    const fsSync = require('fs');
    try {
        const hex = fsSync.readFileSync(KEY_FILE, 'utf8').trim();
        if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
    } catch (e) {}
    const key = nodeCrypto.randomBytes(32);
    fsSync.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fsSync.writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
    log.warn('Encryption key generated at data/.secret.key — BACK THIS FILE UP. Without it, stored sender passwords and API keys cannot be decrypted.');
    return key;
})();

function isEncrypted(v) {
    return typeof v === 'string' && v.startsWith(ENC_PREFIX);
}

function encryptSecret(plain) {
    if (!plain || typeof plain !== 'string' || isEncrypted(plain)) return plain;
    const iv = nodeCrypto.randomBytes(12);
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ENC_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

const decryptFailuresLogged = new Set();
function decryptSecret(value) {
    if (!isEncrypted(value)) return value; // legacy plaintext passthrough
    try {
        const raw = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
        const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    } catch (e) {
        if (!decryptFailuresLogged.has(value)) {
            decryptFailuresLogged.add(value);
            log.error('Failed to decrypt stored secret — wrong or missing encryption key (ENCRYPTION_KEY / data/.secret.key)');
        }
        return null;
    }
}

// Encrypt all known secret fields in a config object (idempotent)
function encryptConfigSecretsInPlace(cfg) {
    for (const s of Object.values(cfg.senders || {})) {
        if (s.pass) s.pass = encryptSecret(s.pass);
        if (s.apiKey) s.apiKey = encryptSecret(s.apiKey);
    }
    if (cfg.smtp && cfg.smtp.pass) cfg.smtp.pass = encryptSecret(cfg.smtp.pass);
    for (const r of Object.values(cfg.recipients || {})) {
        if (r.telegramBotToken) r.telegramBotToken = encryptSecret(r.telegramBotToken);
    }
    for (const c of Object.values(cfg.captcha || {})) {
        if (c.secretKey) c.secretKey = encryptSecret(c.secretKey);
    }
    for (const c of Object.values(cfg.turnstile || {})) {
        if (c.secretKey) c.secretKey = encryptSecret(c.secretKey);
    }
}

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
        // All write paths funnel through here, so secrets are always encrypted at rest
        encryptConfigSecretsInPlace(currentConfig);
        await fs.writeFile(CONFIG_PATH, JSON.stringify(currentConfig, null, 4));
        Object.assign(config, currentConfig);
    }).catch(e => {
        log.error('Config write error', { error: e.message });
        throw e;
    });
    return configWriteLock;
}

// Ensure upload temp dir exists
require('fs').mkdirSync(UPLOAD_DIR, { recursive: true });

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
        toRequired: 'At least one destination email is required: without it the form cannot send anything.',
        toInvalid: 'These destination addresses are not valid emails:',
        formUpdated: 'Form updated',
        formRemoved: 'Form removed',
        invalidSmtp: 'Invalid SMTP config',
        smtpUpdated: 'SMTP config updated',
        failedSaveConfig: 'Failed to save config',
        statsReset: 'Statistics reset',
        failedResetStats: 'Failed to reset statistics',
        submissionsDeleted: 'All submissions deleted',
        submissionDeleted: 'Submission deleted',
        failedDeleteSubs: 'Failed to delete submissions',
        entryNotFound: 'Entry not found',
        outboxEntryDeleted: 'Outbox entry deleted',
        failedDeleteOutbox: 'Failed to delete outbox entry',
        passwordRequired: 'Current password and new password are required',
        passwordTooShort: 'New password must be at least 8 characters',
        passwordIncorrect: 'Current password is incorrect',
        passwordUpdated: 'Password updated successfully',
        failedUpdatePassword: 'Failed to update password',
        failedRetrieveStatus: 'Failed to retrieve status',
        domainNotAllowed: 'Submissions from this domain are not allowed.',
        // Login (password / OTP / Google)
        loginInvalid: 'Invalid credentials.',
        loginEmailRequired: 'Email is required.',
        loginCodeRequired: 'Email and code are required.',
        googleDisabled: 'Google sign-in is not enabled on this server.',
        googleInvalidToken: 'Could not validate the Google sign-in.',
        googleEmailNotVerified: 'Your Google email is not verified.',
        googleUserNotFound: 'There is no user with that email. Ask your administrator to create it — accounts are not self-registered.',
        otpNoSender: 'The one-time code cannot be sent: no email sender is configured.',
        otpSendFailed: 'We could not send the code by email. Try again in a few minutes.',
        otpTooMany: 'Too many codes requested. Try again later.',
        otpInvalid: 'Invalid code.',
        otpExpired: 'The code expired — request a new one.',
        otpTooManyAttempts: 'Too many attempts with this code — request a new one.',
        otpSubject: 'Your formPost access code',
        sessionExpired: 'Your session expired. Sign in again.'
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
        toRequired: 'Se requiere al menos un email de destino: sin eso el formulario no puede enviar nada.',
        toInvalid: 'Estas direcciones de destino no son emails válidos:',
        formUpdated: 'Formulario actualizado',
        formRemoved: 'Formulario eliminado',
        invalidSmtp: 'Configuraci\u00f3n SMTP no v\u00e1lida',
        smtpUpdated: 'Configuraci\u00f3n SMTP actualizada',
        failedSaveConfig: 'Error al guardar configuraci\u00f3n',
        statsReset: 'Estad\u00edsticas reiniciadas',
        failedResetStats: 'Error al reiniciar estad\u00edsticas',
        submissionsDeleted: 'Todos los envíos eliminados',
        submissionDeleted: 'Envío eliminado',
        failedDeleteSubs: 'Error al eliminar envíos',
        entryNotFound: 'Registro no encontrado',
        outboxEntryDeleted: 'Registro de salida eliminado',
        failedDeleteOutbox: 'Error al eliminar registro de salida',
        passwordRequired: 'Se requiere contrase\u00f1a actual y nueva',
        passwordTooShort: 'La nueva contrase\u00f1a debe tener al menos 8 caracteres',
        passwordIncorrect: 'La contrase\u00f1a actual es incorrecta',
        passwordUpdated: 'Contrase\u00f1a actualizada correctamente',
        failedUpdatePassword: 'Error al actualizar contrase\u00f1a',
        failedRetrieveStatus: 'Error al obtener estado',
        domainNotAllowed: 'No se permiten envíos desde este dominio.',
        // Login (contraseña / OTP / Google)
        loginInvalid: 'Credenciales inválidas.',
        loginEmailRequired: 'El email es requerido.',
        loginCodeRequired: 'Email y código son requeridos.',
        googleDisabled: 'El ingreso con Google no está habilitado en este servidor.',
        googleInvalidToken: 'No se pudo validar el ingreso con Google.',
        googleEmailNotVerified: 'Tu email de Google no está verificado.',
        googleUserNotFound: 'No existe un usuario con ese email. Pedile a tu administrador que lo cree — no hay auto-registro.',
        otpNoSender: 'No se puede enviar el código: no hay ningún sender de email configurado.',
        otpSendFailed: 'No pudimos enviar el código por email. Probá de nuevo en unos minutos.',
        otpTooMany: 'Pediste demasiados códigos. Probá de nuevo más tarde.',
        otpInvalid: 'Código inválido.',
        otpExpired: 'El código expiró — pedí uno nuevo.',
        otpTooManyAttempts: 'Demasiados intentos con este código — pedí uno nuevo.',
        otpSubject: 'Tu código de acceso a formPost',
        sessionExpired: 'Tu sesión expiró. Ingresá de nuevo.'
    }
};
const t = serverMessages[LANG] || serverMessages.es;

// SSE client tracking for real-time inbox + outbox.
// Each client is { res, scope }: scope null = superadmin (sees all), otherwise accountId.
const sseClients = new Set();

function broadcastSSE(payload) {
    const data = JSON.stringify(payload);
    const form = payload.websiteId ? (config.recipients || {})[payload.websiteId] : null;
    const acct = form ? (form.accountId || 'default') : null;
    for (const client of sseClients) {
        if (client.scope == null || client.scope === acct) {
            client.res.write(`data: ${data}\n\n`);
        }
    }
}

// Admin credentials from environment: upserted as a superadmin user during migration
const ENV_ADMIN = (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD)
    ? { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD }
    : null;
// Pre-migration compatibility: legacy single-admin configs still read config.admin
if (ENV_ADMIN && !config.users) {
    if (!config.admin) config.admin = {};
    config.admin.username = ENV_ADMIN.username;
    config.admin.password = ENV_ADMIN.password;
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

// Override Agent API key with environment variable if provided
if (process.env.API_KEY) {
    if (!config.api) config.api = {};
    config.api.key = process.env.API_KEY;
}

// Auto-generate Agent API key on first run
async function ensureApiKey() {
    if (config.api && config.api.key) return;
    const key = 'fp_' + require('crypto').randomBytes(24).toString('hex');
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.api) cfg.api = {};
            if (!cfg.api.key) cfg.api.key = key;
            if (cfg.api.enabled === undefined) cfg.api.enabled = true;
        });
        log.info('Agent API key generated — view it in the admin UI (Senders > Agent API) or config.json');
    } catch (e) {
        log.error('Failed to generate Agent API key', { error: e.message });
    }
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

// Multi-tenant migration: accounts map, users map, per-form accountId.
// Senders without accountId stay GLOBAL (usable by every account, managed by superadmin).
async function migrateMultiTenant() {
    const needsAccounts = !config.accounts || Object.keys(config.accounts).length === 0;
    const needsUsers = !config.users || Object.keys(config.users).length === 0;
    const needsStamp = Object.values(config.recipients || {}).some(r => !r.accountId);
    const needsAccountKeys = Object.values(config.accounts || {}).some(a => !a.api || !a.api.key);
    let envUserHash = null;
    if (ENV_ADMIN) {
        const existing = (config.users || {})[ENV_ADMIN.username];
        const matches = existing && await bcrypt.compare(ENV_ADMIN.password, existing.passwordHash).catch(() => false);
        if (!existing || !matches) envUserHash = await bcrypt.hash(ENV_ADMIN.password, BCRYPT_ROUNDS);
    }
    if (!needsAccounts && !needsUsers && !needsStamp && !needsAccountKeys && !envUserHash) return;
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.accounts || Object.keys(cfg.accounts).length === 0) {
                cfg.accounts = { default: { name: 'Default' } };
            }
            for (const acct of Object.values(cfg.accounts)) {
                if (!acct.api || !acct.api.key) {
                    acct.api = { key: 'fp_' + nodeCrypto.randomBytes(24).toString('hex'), enabled: true };
                }
            }
            for (const r of Object.values(cfg.recipients || {})) {
                if (!r.accountId) r.accountId = 'default';
            }
            if (!cfg.users) cfg.users = {};
            if (Object.keys(cfg.users).length === 0 && cfg.admin && cfg.admin.username) {
                cfg.users[cfg.admin.username] = { passwordHash: cfg.admin.password, role: 'superadmin', accountId: null };
                delete cfg.admin;
            }
            if (ENV_ADMIN && envUserHash) {
                cfg.users[ENV_ADMIN.username] = {
                    ...(cfg.users[ENV_ADMIN.username] || {}),
                    passwordHash: envUserHash,
                    role: 'superadmin',
                    accountId: null
                };
            }
        });
        log.info('Multi-tenant migration applied (accounts/users/accountId stamps)');
    } catch (e) {
        log.error('Multi-tenant migration failed', { error: e.message });
    }
}

// ===== Login settings (Google sign-in + per-user email) =====
// The Google client id is public by design (it travels to the browser).
// Precedence: GOOGLE_CLIENT_ID env var > config.auth.googleClientId.
const DEFAULT_GOOGLE_CLIENT_ID = '1053341747502-cdp5kkmgipvvov1rrdurkdejhkt0k17e.apps.googleusercontent.com';

function googleClientId() {
    return (process.env.GOOGLE_CLIENT_ID || (config.auth && config.auth.googleClientId) || '').trim();
}

// Emails of existing users, seeded from the deployment environment so they can
// sign in with Google or a one-time code without editing anything by hand.
// They are user data: this only writes them into each user record, and only
// when that user has no email yet. Nothing is hardcoded in the source.
// Format: USER_EMAILS="usuario1=mail1@dominio,usuario2=mail2@dominio"
function seedUserEmailsFromEnv() {
    const out = {};
    for (const pair of (process.env.USER_EMAILS || '').split(',')) {
        const [username, email] = pair.split('=').map(s => (s || '').trim());
        if (username && email && isValidEmail(email)) out[username] = email;
    }
    return out;
}

// Stores the default Google client id (editable in config.json) and applies the
// email seeds from the environment.
async function migrateLoginSettings() {
    const seeds = seedUserEmailsFromEnv();
    const needsClientId = !(config.auth && config.auth.googleClientId);
    const pending = Object.entries(seeds).filter(([username, email]) => {
        const u = (config.users || {})[username];
        return u && !(u.email || '').trim() && !userEmailTaken(email, username);
    });
    if (!needsClientId && !pending.length) return;
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.auth) cfg.auth = {};
            if (!cfg.auth.googleClientId) cfg.auth.googleClientId = DEFAULT_GOOGLE_CLIENT_ID;
            for (const [username, email] of pending) {
                if (cfg.users && cfg.users[username]) cfg.users[username].email = email;
            }
        });
        if (pending.length) log.info('User emails seeded from USER_EMAILS', { users: pending.map(p => p[0]) });
        log.info('Login settings migration applied');
    } catch (e) {
        log.error('Login settings migration failed', { error: e.message });
    }
}

// Run startup config migrations sequentially — they rewrite config.json and would race otherwise.
// The final no-op write encrypts any plaintext secrets via the writeConfigSafe hook.
ensurePasswordHashed()
    .then(ensureApiKey)
    .then(migrateMultiTenant)
    .then(migrateLoginSettings)
    .then(() => writeConfigSafe(() => {}))
    .catch(e => log.error('Startup migrations failed', { error: e.message }));

// SupportHub help widget: the admin panel only loads it when this is set.
// Runtime env (no frontend build), so a redeploy with the variable is enough.
const SUPPORTHUB_URL = (process.env.SUPPORTHUB_URL || '').trim().replace(/\/+$/, '');
const supporthubCsp = SUPPORTHUB_URL ? [SUPPORTHUB_URL] : [];

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // accounts.google.com / gstatic: Google Identity Services (sign-in button)
            styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", ...supporthubCsp],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://accounts.google.com", "https://apis.google.com", ...supporthubCsp],
            scriptSrcAttr: ["'unsafe-inline'"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://accounts.google.com", ...supporthubCsp],
            imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com", ...supporthubCsp],
            frameSrc: ["'self'", "https://accounts.google.com", ...supporthubCsp],
        }
    },
    // Google Identity Services signs in through a popup that hands the
    // credential back via window.opener. Helmet's default (same-origin) severs
    // that reference and the popup just hangs blank on accounts.google.com.
    // same-origin-allow-popups keeps the protection for this document while
    // letting the popups it opens talk back.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
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
    max: 120,
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

// CORS for /submit: open to all origins so client-side fetch() can read the response.
// Per-form authorization is still enforced in the handler via recipientConfig.allowedDomains
// (Origin/Referer check at submit time). This only unblocks the browser from reading the body.
app.use('/submit', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
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

// Parse '"Display Name" <email@dom>' or plain 'email@dom' into SendGrid address object
function parseAddress(addr) {
    const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(String(addr || ''));
    if (m) {
        const out = { email: m[2].trim() };
        if (m[1].trim()) out.name = m[1].trim();
        return out;
    }
    return { email: String(addr || '').trim() };
}

// SendGrid transporter: same sendMail()/verify() interface as nodemailer,
// implemented over the SendGrid v3 HTTP API (no SMTP ports needed)
function buildSendGridTransporter(senderCfg) {
    const plainKey = decryptSecret(senderCfg.apiKey);
    const keyUndecryptable = !!senderCfg.apiKey && plainKey === null;
    const client = axios.create({
        baseURL: 'https://api.sendgrid.com/v3',
        headers: { Authorization: `Bearer ${plainKey || ''}`, 'Content-Type': 'application/json' },
        timeout: 15000
    });
    function sgErrorDetail(e) {
        const errs = e.response && e.response.data && e.response.data.errors;
        return errs && errs.length ? errs.map(er => er.message).filter(Boolean).join('; ') : '';
    }
    function assertKeyReadable() {
        if (keyUndecryptable) {
            throw new Error('SendGrid: stored API key cannot be decrypted — the encryption key (data/.secret.key or ENCRYPTION_KEY) changed since it was saved. Re-enter the API key in the sender editor.');
        }
        if (!plainKey) {
            throw new Error('SendGrid: no API key configured for this sender.');
        }
    }
    return {
        isSendGrid: true,
        async verify() {
            assertKeyReadable();
            try {
                await client.get('/scopes');
            } catch (e) {
                const status = e.response && e.response.status;
                const detail = sgErrorDetail(e);
                // Restricted keys (e.g. Mail Send only) may not be allowed to read /scopes;
                // that does not mean the key is invalid for sending.
                if (status === 403) return true;
                if (status === 401) {
                    throw new Error('SendGrid: invalid API key (401)' + (detail ? ' — ' + detail : '') + '. If this key works elsewhere, check SendGrid IP Access Management: this server\'s IP may not be allowed.');
                }
                throw new Error('SendGrid: ' + (detail || e.message));
            }
            return true;
        },
        async sendMail(mailOptions) {
            assertKeyReadable();
            const toList = String(mailOptions.to || '')
                .split(',').map(s => s.trim()).filter(Boolean).map(parseAddress);
            const payload = {
                personalizations: [{ to: toList }],
                from: parseAddress(mailOptions.from),
                subject: mailOptions.subject,
                content: [{ type: 'text/html', value: mailOptions.html || '' }]
            };
            if (mailOptions.replyTo) payload.reply_to = parseAddress(mailOptions.replyTo);
            const atts = [];
            for (const a of (mailOptions.attachments || [])) {
                const buf = await fs.readFile(a.path);
                atts.push({ content: buf.toString('base64'), filename: a.filename, disposition: 'attachment' });
            }
            if (atts.length) payload.attachments = atts;
            try {
                const resp = await client.post('/mail/send', payload);
                // SendGrid returns 202 Accepted (queued for delivery) with no body.
                // The x-message-id header is the handle to trace this message in
                // SendGrid's Activity Feed / Event Webhook (delivered, bounced, dropped...).
                // NOTE: 202 means "accepted for delivery", NOT "delivered".
                return {
                    provider: 'sendgrid',
                    statusCode: resp.status,
                    messageId: (resp.headers && resp.headers['x-message-id']) || null,
                    accepted: toList.map(a => a.email),
                    rejected: []
                };
            } catch (e) {
                const status = e.response && e.response.status;
                const sgErrors = e.response && e.response.data && e.response.data.errors;
                const detail = sgErrors ? sgErrors.map(er => er.message).join('; ') : e.message;
                const err = new Error('SendGrid' + (status ? ' ' + status : '') + ': ' + detail);
                err.statusCode = status || null;
                err.provider = 'sendgrid';
                throw err;
            }
        }
    };
}

// Normalize the result of transporter.sendMail() across SendGrid (HTTP API) and
// nodemailer (SMTP) into one shape we can log and persist in the outbox.
// For SendGrid, statusCode 202 = accepted-for-delivery (not yet delivered).
// For SMTP, `response` is the server's reply (e.g. "250 2.0.0 OK") and
// `accepted`/`rejected` list the recipients the server acknowledged/refused.
function normalizeSendResult(info) {
    info = info || {};
    if (info.provider === 'sendgrid') {
        return {
            provider: 'sendgrid',
            statusCode: info.statusCode || null,
            messageId: info.messageId || null,
            accepted: info.accepted || [],
            rejected: info.rejected || [],
            response: info.statusCode === 202
                ? 'Accepted (HTTP 202) by SendGrid for delivery'
                : ('SendGrid HTTP ' + (info.statusCode || '?'))
        };
    }
    return {
        provider: 'smtp',
        statusCode: null,
        messageId: info.messageId || null,
        accepted: info.accepted || [],
        rejected: info.rejected || [],
        response: info.response || ''
    };
}

// How a port speaks TLS is a property of the port, not a free-floating checkbox:
//   465          -> implicit TLS: the socket is encrypted from byte zero (secure: true)
//   587 / 2525   -> plaintext connect, then STARTTLS upgrade (secure: false)
//   25           -> plaintext, STARTTLS only if the relay offers it (internal relays often don't)
// Getting this backwards is the classic "wrong version number" failure: with
// secure:true on 587 the client sends a TLS ClientHello and the relay answers
// with a plaintext "220 ..." greeting, which the TLS parser reads as a bogus
// record version. Ports outside this list keep whatever the operator configured.
const IMPLICIT_TLS_PORTS = [465];
const STARTTLS_PORTS = [587, 2525, 25];

// Force `secure` to match the port. Applied both when saving a sender (so the UI
// shows the truth) and when building the transport (so senders saved by older
// versions are corrected without a re-save).
function normalizeSenderTls(cfg) {
    if (!cfg || (cfg.type || 'smtp') !== 'smtp') return cfg;
    const port = Number(cfg.port);
    if (IMPLICIT_TLS_PORTS.includes(port)) cfg.secure = true;
    else if (STARTTLS_PORTS.includes(port)) cfg.secure = false;
    return cfg;
}

// Configure transporters (one per sender). type: 'smtp' (default) | 'sendgrid'
const transporters = {};
function buildTransporter(smtpConfig) {
    if (smtpConfig.type === 'sendgrid') {
        return buildSendGridTransporter(smtpConfig);
    }
    const tc = { ...smtpConfig };
    delete tc.name; // alias field, not for nodemailer
    delete tc.type;
    delete tc.apiKey;
    delete tc.domain;
    delete tc.accountId;
    delete tc.active;
    delete tc.backupSenderId;
    normalizeSenderTls(tc);
    // Nodemailer already upgrades with STARTTLS whenever the relay advertises it.
    // requireTLS turns that into a hard requirement, which is what we want as soon
    // as there is a password on the wire — but only then, so an unauthenticated
    // internal relay with no TLS at all keeps working.
    if ([587, 2525].includes(Number(tc.port)) && tc.user && tc.pass) tc.requireTLS = true;
    // Nodemailer's defaults are minutes long. A dead relay must fail fast enough
    // that the backup sender still gets its turn inside the request.
    if (tc.connectionTimeout === undefined) tc.connectionTimeout = 10000;
    if (tc.greetingTimeout === undefined) tc.greetingTimeout = 10000;
    if (tc.socketTimeout === undefined) tc.socketTimeout = 30000;
    if (tc.user && tc.pass) {
        const plainPass = decryptSecret(tc.pass);
        if (plainPass) tc.auth = { type: 'LOGIN', user: tc.user, pass: plainPass };
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

// A sender without accountId is GLOBAL: usable by every account, managed by superadmin
function senderUsableByAccount(senderCfg, accountId) {
    return !senderCfg.accountId || senderCfg.accountId === accountId;
}

// Which sender a form actually sends through: the one it names, or — when that is
// missing, unknown or out of the form's account — the first usable one (own account
// before global). Returns null when the form has no sender at all.
// Single source of truth for both the mailer and the "FORMS" count in the panel,
// so the number shown can never drift from what really happens at send time.
function effectiveSenderIdForForm(recipientCfg) {
    const acct = (recipientCfg && recipientCfg.accountId) || 'default';
    const senderId = (recipientCfg && recipientCfg.senderId) || 'default';
    if (transporters[senderId]) {
        const senderCfg = config.senders[senderId];
        if (senderCfg && senderUsableByAccount(senderCfg, acct)) return senderId;
    }
    const candidates = Object.keys(transporters).filter(id => {
        const s = config.senders[id];
        return s && senderUsableByAccount(s, acct);
    });
    candidates.sort((a, b) => {
        const aOwn = (config.senders[a].accountId === acct) ? 0 : 1;
        const bOwn = (config.senders[b].accountId === acct) ? 0 : 1;
        return aOwn - bOwn;
    });
    return candidates[0] || null;
}

// Get transporter for a form (by senderId, fallback scoped to the form's account + global senders)
function getTransporterForForm(recipientCfg) {
    const acct = recipientCfg.accountId || 'default';
    const senderId = effectiveSenderIdForForm(recipientCfg);
    if (!senderId) return null;
    const senderCfg = config.senders[senderId];
    if (senderCfg.active === false) return { inactive: true, senderId };
    return { transporter: transporters[senderId], senderCfg, senderId, accountId: acct };
}

// Split a form's "to" into individual addresses. Same parsing nodemailer will do,
// so what the panel validates is what the relay will actually receive.
function parseRecipients(to) {
    return String(to || '').split(/[,;]/).map(a => a.trim()).filter(Boolean);
}

// Everything a form needs before it can deliver anything. Returned by GET /websites so
// the dashboard can flag a broken form instead of letting it fail silently on the next
// submission -- which is exactly how a form left without recipients kept accepting posts
// and failing with "No recipients defined".
// severity 'error' = this form cannot send email at all; 'warn' = it will not send right now.
function formIssues(cfg) {
    const issues = [];
    const recipients = parseRecipients(cfg.to);
    if (!recipients.length) {
        issues.push({ code: 'noRecipients', severity: 'error' });
    } else {
        const bad = recipients.filter(a => !isValidEmail(a));
        if (bad.length) issues.push({ code: 'invalidRecipients', severity: 'error', detail: bad.join(', ') });
    }
    const senderId = effectiveSenderIdForForm(cfg);
    if (!senderId) {
        issues.push({ code: 'noSender', severity: 'error' });
    } else if (config.senders[senderId].active === false) {
        issues.push({ code: 'senderInactive', severity: 'warn', detail: senderId });
    }
    if (cfg.autoReplyEnabled && cfg.autoReplyReplyTo && !isValidEmail(cfg.autoReplyReplyTo)) {
        issues.push({ code: 'invalidAutoReplyTo', severity: 'warn', detail: cfg.autoReplyReplyTo });
    }
    return issues;
}

// Reject a write that would leave a form unable to deliver. Only checks what the patch
// actually sets: editing an unrelated field on an already-broken form still saves, so a
// pre-existing problem is surfaced by the dashboard flag rather than by blocking the fix.
function validateRecipientsPatch(patch) {
    if (patch.to === undefined) return null;
    const recipients = parseRecipients(patch.to);
    if (!recipients.length) return t.toRequired;
    const bad = recipients.filter(a => !isValidEmail(a));
    if (bad.length) return t.toInvalid + ' ' + bad.join(', ');
    return null;
}

// How many forms send through each sender, restricted to the forms this caller can see.
// Keyed by sender id; forms that fall back to a sender count for it, because that is
// where their mail really goes.
function formCountsBySender(scope) {
    const counts = {};
    for (const [formId, cfg] of Object.entries(formsForScope(scope))) {
        const id = effectiveSenderIdForForm(cfg);
        if (!id) continue;
        if (!counts[id]) counts[id] = [];
        counts[id].push(formId);
    }
    return counts;
}

// ============================================================================
// Sender failover: backup senders + circuit breaker
// ============================================================================
// A sender may name another sender as its backup. When a send fails for a reason
// that is the SENDER's fault (no connection, bad credentials, relay throttling)
// the same message is retried through the backup. When the failure belongs to the
// MESSAGE (mailbox does not exist, content refused, attachment too large) there is
// no retry: the backup would be refused the exact same message.
//
// On top of that a circuit breaker keeps a downed sender out of the way. After
// SENDER_FAIL_THRESHOLD consecutive sender-level failures the breaker opens and
// every message goes straight to the backup for a cooldown period, instead of
// paying the connection timeout again on each one. When the cooldown expires the
// sender gets one trial send (half-open); a background probe also verifies open
// senders once a minute so recovery is detected even with no traffic.

const SENDER_FAIL_THRESHOLD = Math.max(1, parseInt(process.env.SENDER_FAIL_THRESHOLD || '3', 10) || 3);
const SENDER_COOLDOWN_MS = Math.max(1, parseInt(process.env.SENDER_COOLDOWN_MINUTES || '5', 10) || 5) * 60000;
const SENDER_COOLDOWN_MAX_MS = Math.max(1, parseInt(process.env.SENDER_COOLDOWN_MAX_MINUTES || '30', 10) || 30) * 60000;
const SENDER_CHAIN_MAX = 3; // primary + 2 backups; deeper chains are almost always a config mistake

// In-memory only: health is an observation about *this* process, not configuration.
// A restart re-probes rather than inheriting a stale "down" verdict.
const senderHealth = {}; // senderId -> { failures, openUntil, outages, lastError, lastErrorAt, lastOkAt }

function healthOf(id) {
    if (!senderHealth[id]) {
        senderHealth[id] = { failures: 0, openUntil: 0, outages: 0, lastError: null, lastErrorAt: null, lastOkAt: null };
    }
    return senderHealth[id];
}

function isCircuitOpen(id, now) {
    const h = senderHealth[id];
    return !!(h && h.openUntil > (now || Date.now()));
}

function recordSenderSuccess(id) {
    const h = healthOf(id);
    const wasUnhealthy = h.openUntil > 0 || h.outages > 0 || h.failures > 0;
    h.failures = 0;
    h.openUntil = 0;
    h.outages = 0;
    h.lastError = null;
    h.lastErrorAt = null;
    h.lastOkAt = new Date().toISOString();
    if (wasUnhealthy) log.info('Sender recovered', { senderId: id });
}

function recordSenderFailure(id, err) {
    const h = healthOf(id);
    h.failures += 1;
    h.lastError = err && err.message ? err.message : String(err);
    h.lastErrorAt = new Date().toISOString();
    // A sender that has already been down once does not get three more chances:
    // the first miss after a recovery attempt re-opens the breaker immediately.
    const threshold = h.outages > 0 ? 1 : SENDER_FAIL_THRESHOLD;
    if (h.failures >= threshold) {
        h.outages += 1;
        const cooldown = Math.min(SENDER_COOLDOWN_MS * Math.pow(2, h.outages - 1), SENDER_COOLDOWN_MAX_MS);
        h.openUntil = Date.now() + cooldown;
        h.failures = 0;
        log.error('Sender marked down, routing to backup', {
            senderId: id,
            cooldownMinutes: Math.round(cooldown / 60000),
            consecutiveOutages: h.outages,
            error: h.lastError
        });
    }
}

// Decide what a send failure means. `retry` = worth trying the backup for THIS
// message. `senderDown` = the failure says the sender itself is unhealthy and
// should count toward the breaker.
function classifySendError(err) {
    const code = err && err.code;
    const rc = Number((err && (err.responseCode || err.statusCode)) || 0);
    const msg = String((err && err.message) || '');

    if (err && err.provider === 'sendgrid') {
        // 401 bad key, 403 key/sender not authorized, 429 throttled, 5xx provider down
        if (rc === 401 || rc === 403 || rc === 429 || rc >= 500) return { retry: true, senderDown: true, reason: 'sendgrid-' + rc };
        // 400 malformed payload / bad addresses, 413 too large: the backup gets the same answer
        if (rc >= 400) return { retry: false, senderDown: false, reason: 'sendgrid-' + rc };
        return { retry: true, senderDown: true, reason: 'sendgrid-network' }; // no HTTP status = never reached the API
    }

    // Never got a usable session with the relay
    const CONNECTION_CODES = ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ECONNRESET',
        'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EDNS', 'EAI_AGAIN', 'EPROTOCOL', 'ETLS'];
    if (CONNECTION_CODES.includes(code)) return { retry: true, senderDown: true, reason: 'connection' };
    // Auth is checked before the generic 5xx rule: 535 is a 5xx but it is the sender's problem, not the message's
    if (code === 'EAUTH' || rc === 530 || rc === 534 || rc === 535) return { retry: true, senderDown: true, reason: 'auth' };
    if (/wrong version number|SSL routines|ERR_SSL|self.signed certificate|certificate has expired/i.test(msg)) {
        return { retry: true, senderDown: true, reason: 'tls' };
    }
    // 421 = relay refusing service / too many connections: sender-side outage
    if (rc === 421) return { retry: true, senderDown: true, reason: 'relay-unavailable' };
    // Permanent and message-scoped: unknown mailbox, refused content, over quota, bad syntax
    if (rc >= 500 && rc < 600) return { retry: false, senderDown: false, reason: 'message-rejected' };
    // Other 4xx (greylisting, mailbox busy): temporary and usually recipient-side, so retry
    // through the backup but do not blame the sender for it
    if (rc >= 400 && rc < 500) return { retry: true, senderDown: false, reason: 'temporary' };
    if (code === 'EENVELOPE' || code === 'EMESSAGE') return { retry: false, senderDown: false, reason: 'message-rejected' };
    return { retry: true, senderDown: false, reason: 'unknown' };
}

// Turn the raw driver error into something an admin can act on
function explainSendError(err, senderCfg) {
    const msg = String((err && err.message) || '');
    const cfg = senderCfg || {};
    const port = Number(cfg.port);
    if (/wrong version number|SSL routines|ERR_SSL/i.test(msg)) {
        return msg + ` — TLS mode does not match port ${port || '?'}. Port 465 needs an implicit-TLS connection ` +
            `("secure" on); ports 587/2525/25 start in plaintext and upgrade with STARTTLS ("secure" off).`;
    }
    if (err && (err.code === 'EAUTH' || err.responseCode === 535)) {
        return msg + ' — the relay rejected the username/password for this sender.';
    }
    if (err && ['ETIMEDOUT', 'ECONNECTION', 'ECONNREFUSED'].includes(err.code)) {
        return msg + ` — could not reach ${cfg.host || 'the relay'}:${port || '?'}. Check the host, the port and any outbound firewall.`;
    }
    return msg;
}

// Ordered list of senders to try for one message: the chosen sender, then its
// backup, then the backup's backup. Inactive, unknown and out-of-scope senders
// are skipped; cycles and repeats are dropped.
function resolveSenderChain(startId, accountId) {
    const chain = [];
    const seen = new Set();
    let id = startId;
    while (id && !seen.has(id) && chain.length < SENDER_CHAIN_MAX) {
        seen.add(id);
        const cfg = (config.senders || {})[id];
        if (!cfg) break;
        const usable = cfg.active !== false && transporters[id] &&
            (accountId == null || senderUsableByAccount(cfg, accountId));
        if (usable) chain.push({ id, cfg, transporter: transporters[id] });
        id = cfg.backupSenderId;
    }
    return chain;
}

// Skip senders whose breaker is open — but never drop a message: if every
// candidate is open, try them all anyway in the original order.
function orderByHealth(chain) {
    const now = Date.now();
    const up = chain.filter(c => !isCircuitOpen(c.id, now));
    return up.length ? up : chain;
}

// Send one message through a chain, moving to the backup only on sender-level
// failures. `buildMailOptions(senderCfg)` is called per attempt so that "from"
// always belongs to the sender actually being used — a relay will refuse an
// envelope sender it does not own.
async function sendWithFailover(chain, buildMailOptions, context) {
    const ctx = context || {};
    const attempts = [];
    const candidates = orderByHealth(chain);
    if (!candidates.length) {
        const e = new Error('No usable sender available');
        e.attempts = attempts;
        throw e;
    }
    let lastError = null;
    for (const cand of candidates) {
        try {
            const meta = normalizeSendResult(await cand.transporter.sendMail(buildMailOptions(cand.cfg)));
            recordSenderSuccess(cand.id);
            if (attempts.length) {
                log.info('Email delivered through backup sender', {
                    ...ctx, senderId: cand.id, skipped: attempts.map(a => a.senderId)
                });
            }
            return { meta, senderId: cand.id, senderCfg: cand.cfg, attempts, failedOver: attempts.length > 0 };
        } catch (err) {
            const cls = classifySendError(err);
            attempts.push({ senderId: cand.id, reason: cls.reason, error: err.message });
            if (cls.senderDown) recordSenderFailure(cand.id, err);
            log.error('Send attempt failed', {
                ...ctx,
                senderId: cand.id,
                reason: cls.reason,
                willTryBackup: cls.retry,
                provider: err.provider || 'smtp',
                statusCode: err.statusCode || err.responseCode || null,
                error: err.message
            });
            lastError = err;
            if (!cls.retry) break; // message-level rejection: the backup would fail identically
        }
    }
    lastError = lastError || new Error('No usable sender available');
    lastError.attempts = attempts;
    return Promise.reject(lastError);
}

// Background probe: an open sender is re-verified once its cooldown expires so a
// recovery is noticed (and shown in the admin panel) even with no traffic.
async function probeDownSenders() {
    const now = Date.now();
    for (const [id, h] of Object.entries(senderHealth)) {
        if (h.outages === 0 || h.openUntil > now) continue;
        const transporter = transporters[id];
        if (!transporter || !transporter.verify) continue;
        try {
            await transporter.verify();
            recordSenderSuccess(id);
        } catch (e) {
            recordSenderFailure(id, e);
        }
    }
}
const senderProbeTimer = setInterval(() => {
    probeDownSenders().catch(e => log.error('Sender probe failed', { error: e.message }));
}, 60000);
if (senderProbeTimer.unref) senderProbeTimer.unref();

function senderHealthForApi(id) {
    const h = senderHealth[id];
    if (!h) return { state: 'unknown' };
    if (h.openUntil > Date.now()) {
        return { state: 'down', until: new Date(h.openUntil).toISOString(), lastError: h.lastError, lastErrorAt: h.lastErrorAt };
    }
    if (h.outages > 0) return { state: 'recovering', lastError: h.lastError, lastErrorAt: h.lastErrorAt };
    if (h.failures > 0) return { state: 'degraded', failures: h.failures, lastError: h.lastError, lastErrorAt: h.lastErrorAt };
    return { state: h.lastOkAt ? 'up' : 'unknown', lastOkAt: h.lastOkAt };
}

// A sender may only fail over to one that every user of it could already use:
//  - a GLOBAL sender (shared by all accounts) may only back up to another global
//    sender; otherwise account A's mail would leave through account B's private relay.
//  - an ACCOUNT sender may back up to a global sender or to one of its own account.
// So a client-owned sender can HAVE a backup but can never BE the backup of a
// shared sender, which is exactly the intended asymmetry.
function validateBackupSenderId(backupId, selfId, ownerAccountId, sendersMap) {
    if (backupId === undefined) return null; // field not being changed
    if (!backupId) return null;              // explicitly cleared
    if (typeof backupId !== 'string') return '"backupSenderId" must be a sender id or an empty value.';
    if (backupId === selfId) return 'A sender cannot be its own backup.';
    const senders = sendersMap || config.senders || {};
    const backup = senders[backupId];
    if (!backup) return `Backup sender "${backupId}" does not exist.`;
    if (!ownerAccountId) {
        if (backup.accountId) {
            return `A global sender can only fall back to another global sender ("${backupId}" belongs to account "${backup.accountId}").`;
        }
    } else if (backup.accountId && backup.accountId !== ownerAccountId) {
        return `Backup sender "${backupId}" belongs to another account.`;
    }
    // Loops are deliberately allowed: two senders naming each other as backup is
    // the normal highly-available pair. resolveSenderChain() walks with a visited
    // set and a depth cap, so a cycle can never make a send spin.
    return null;
}

// Drop backup links that stopped being legal — the target was deleted, or a
// superadmin moved a sender between accounts and left a global one pointing at a
// private relay. Runs inside every sender write.
function pruneInvalidBackupRefs(cfgObj) {
    const senders = (cfgObj && cfgObj.senders) || {};
    for (const [id, s] of Object.entries(senders)) {
        if (!s.backupSenderId) continue;
        const problem = validateBackupSenderId(s.backupSenderId, id, s.accountId || null, senders);
        if (problem) {
            log.info('Cleared invalid backup sender link', { senderId: id, backupSenderId: s.backupSenderId, reason: problem });
            delete s.backupSenderId;
        }
    }
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
    // Keep max 1000 submissions per website; delete attachments of pruned entries
    if (submissions.length > 1000) {
        const pruned = submissions.slice(1000);
        submissions = submissions.slice(0, 1000);
        for (const p of pruned) {
            if (p.attachments && p.attachments.length) {
                deleteSubmissionAttachments(websiteId, p.id).catch(() => {});
            }
        }
    }
    await fs.writeFile(filePath, JSON.stringify(submissions, null, 2));
}

// ===== Persistent attachments storage =====
const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');

function sanitizeFilename(name) {
    let base = path.basename(String(name || 'file'));
    base = base.replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/^\.+/, '');
    if (!base) base = 'file';
    if (base.length > 150) {
        const ext = path.extname(base).slice(0, 20);
        base = base.slice(0, 150 - ext.length) + ext;
    }
    return base;
}

// Copy uploaded temp files into data/attachments/{formId}/{submissionId}/ and return metadata
async function persistAttachments(formId, submissionId, uploadedFiles) {
    const dir = path.join(ATTACHMENTS_DIR, formId, submissionId);
    await fs.mkdir(dir, { recursive: true });
    const saved = [];
    const used = new Set();
    for (const f of uploadedFiles) {
        let name = sanitizeFilename(f.originalname);
        if (used.has(name)) {
            const ext = path.extname(name);
            const stem = name.slice(0, name.length - ext.length);
            let n = 2;
            while (used.has(`${stem}-${n}${ext}`)) n++;
            name = `${stem}-${n}${ext}`;
        }
        used.add(name);
        await fs.copyFile(f.path, path.join(dir, name));
        saved.push({ filename: name, size: f.size, mimetype: f.mimetype });
    }
    return saved;
}

async function deleteSubmissionAttachments(formId, entryId) {
    await fs.rm(path.join(ATTACHMENTS_DIR, formId, entryId), { recursive: true, force: true });
}

async function deleteFormAttachments(formId) {
    await fs.rm(path.join(ATTACHMENTS_DIR, formId), { recursive: true, force: true });
}

// Startup sweep: remove attachment dirs whose submission no longer exists
async function sweepOrphanAttachments() {
    let formDirs = [];
    try { formDirs = await fs.readdir(ATTACHMENTS_DIR); } catch (e) { return; }
    for (const formId of formDirs) {
        try {
            const submissions = await loadSubmissions(formId);
            const ids = new Set(submissions.map(s => s.id));
            const entryDirs = await fs.readdir(path.join(ATTACHMENTS_DIR, formId));
            for (const entryId of entryDirs) {
                if (!ids.has(entryId)) {
                    await fs.rm(path.join(ATTACHMENTS_DIR, formId, entryId), { recursive: true, force: true });
                }
            }
        } catch (e) {}
    }
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

app.post('/submit', submitLimiter, upload.array('attachments', MAX_FILES), async (req, res) => {
    const { form_id, website_id, 'cf-turnstile-response': turnstileToken, 'h-captcha-response': hcaptchaToken, 'g-recaptcha-response': gRecaptchaToken, _hp_field: honeypot, ...formFields } = req.body;
    const formId = form_id || website_id; // backward compat
    const uploadedFiles = req.files || [];

    // Detect submission method: HTML form POST vs JS fetch/XHR
    const fetchMode = req.headers['sec-fetch-mode'];
    const submitMethod = fetchMode === 'navigate' ? 'html' : 'js';

    // Clean up temp files when response finishes (covers all exit paths)
    const cleanupFiles = () => {
        for (const f of uploadedFiles) fs.unlink(f.path).catch(() => {});
    };
    res.on('finish', cleanupFiles);

    // Honeypot check: if the hidden field has a value, silently reject (bot filled it)
    if (honeypot) {
        log.warn('Honeypot triggered', { formId, ip: req.ip });
        return res.status(200).json({ success: true, message: t.formSuccess }); // Fake success to fool bots
    }

    // Validate and route
    if (!formId || typeof formId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(formId)) {
        return res.status(400).send(t.invalidFormId);
    }
    const recipientConfig = config.recipients[formId];
    if (!recipientConfig) {
        return res.status(400).send(t.invalidFormId);
    }

    // Per-form global rate limit
    if (!checkFormRateLimit(formId)) {
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
            log.warn('Origin rejected', { formId, origin });
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
    const captchaEnabled = (recipientConfig.captchaEnabled !== undefined ? recipientConfig.captchaEnabled : recipientConfig.turnstileEnabled) !== false && !!captchaSecrets[formId];
    if (!DEBUG && captchaEnabled) {
        const provider = recipientConfig.captchaProvider || 'turnstile';
        const captchaToken = provider === 'hcaptcha' ? (hcaptchaToken || gRecaptchaToken) : turnstileToken;

        if (!captchaToken) {
            log.warn('No captcha token provided', { formId, provider });
            return res.status(400).send(t.completeCaptcha);
        }

        const captchaConfig = captchaSecrets[formId];
        if (!captchaConfig) {
            log.error('No captcha config found', { formId, provider });
            return res.status(400).send(t.invalidSubmission);
        }

        const verifyUrl = provider === 'hcaptcha'
            ? 'https://api.hcaptcha.com/siteverify'
            : 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

        try {
            const verificationResponse = await axios.post(
                verifyUrl,
                new URLSearchParams({
                    secret: decryptSecret(captchaConfig.secretKey) || '',
                    response: captchaToken,
                    remoteip: req.ip
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const { success, 'error-codes': errorCodes } = verificationResponse.data;
            if (!success) {
                log.warn('Captcha verification failed', { formId, provider, errorCodes });
                return res.status(400).send(t.captchaFailed);
            }
        } catch (error) {
            log.error('Error verifying captcha token', { formId, provider, error: error.message });
            return res.status(500).send(t.captchaError);
        }
    } else if (DEBUG) {
        log.info('DEBUG mode: Skipping captcha verification', { formId });
    } else {
        log.info('Captcha disabled, skipping verification', { formId });
    }

    // Build email from template or generate dynamic email
    try {
        let mailBody;
        const templatePath = path.resolve(__dirname, recipientConfig.templatePath);
        if (!templatePath.startsWith(__dirname)) {
            log.error('Path traversal attempt detected', { formId, path: recipientConfig.templatePath });
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
                .replace(/{{form_id}}|{{website_id}}/g, escapeHtml(formId) || 'Unknown')
                .replace(/{{fields}}/g, fieldsHtml);
        } else if (templateContent) {
            // Legacy template: replace individual {{field}} placeholders
            mailBody = templateContent.replace(/{{form_id}}|{{website_id}}/g, escapeHtml(formId) || 'Unknown');
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
            mailBody = `<h2>New submission from ${escapeHtml(formId)}</h2>\n${fieldsHtml}`;
        }

        // Detect name and email for mail metadata
        const submitterName = formFields.name || formFields.nombre || formFields.full_name || 'Contact';
        const senderAlias = recipientConfig.senderAlias || '';
        const senderName = senderAlias || submitterName;
        const senderEmail = email || '';

        // Get the correct transporter for this form's sender
        const senderInfo = getTransporterForForm(recipientConfig);
        const skipEmail = !senderInfo || senderInfo.inactive;
        if (skipEmail && senderInfo && senderInfo.inactive) {
            log.info('Sender disabled, skipping email', { formId, senderId: senderInfo.senderId });
            const skipEntry = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                timestamp: new Date().toISOString(),
                channel: 'email',
                to: recipientConfig.to,
                subject: `${recipientConfig.subjectPrefix} ${escapeHtml(String(senderName))}`,
                status: 'skipped',
                senderId: senderInfo.senderId
            };
            saveOutboxEntry(formId, skipEntry).catch(() => {});
            broadcastSSE({ type: 'outbox', websiteId: formId, ...skipEntry });
        } else if (!senderInfo) {
            log.info('No sender configured, skipping email', { formId });
        }

        const emailSubject = `${recipientConfig.subjectPrefix} ${escapeHtml(String(senderName))}`;
        const emailTimestamp = new Date().toISOString();

            // Save submission to storage.
            // MUST stay ahead of the email: the submission is the irreplaceable data,
            // the email is only a notification of it. This used to run after sending, so
            // any delivery failure hit the `return 500` below and the visitor's message
            // was never stored -- outbox showed the error, "Submissions" showed nothing.
            try {
                const ip = req.ip || '';
                // Anonymize: IPv4 last octet, IPv6 last 80 bits
                const anonIp = ip.includes(':')
                    ? ip.replace(/(:[0-9a-fA-F]*){5}$/, ':xxxx:xxxx:xxxx:xxxx:xxxx')
                    : ip.replace(/\.\d+$/, '.xxx');
                const submission = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    timestamp: new Date().toISOString(),
                    ip: anonIp,
                    submitMethod
                };
                // Store all form fields dynamically
                for (const [key, value] of fieldEntries) {
                    submission[key] = String(value || '');
                }
                // Persist attachments to disk and store metadata ('attachments' is a reserved key)
                if (uploadedFiles.length > 0) {
                    try {
                        submission.attachments = await persistAttachments(formId, submission.id, uploadedFiles);
                    } catch (attErr) {
                        log.error('Error persisting attachments', { formId, error: attErr.message });
                    }
                }
                await saveSubmission(formId, submission);

                // Broadcast to SSE inbox clients
                broadcastSSE({
                    type: 'submission',
                    websiteId: formId,
                    id: submission.id,
                    timestamp: submission.timestamp,
                    submitMethod,
                    attachments: (submission.attachments || []).length,
                    name: formFields.name || formFields.nombre || formFields.full_name || '',
                    email: formFields.email || formFields.correo || formFields.e_mail || '',
                    preview: fieldEntries
                        .filter(([k]) => !['name','nombre','full_name','email','correo','e_mail','form_id','website_id','cf-turnstile-response','h-captcha-response','g-recaptcha-response'].includes(k))
                        .slice(0, 5)
                        .map(([k, v]) => ({ label: fieldToLabel(k), value: String(v || '').substring(0, 100) }))
                });
            } catch (storageError) {
                log.error('Error saving submission', { formId, error: storageError.message });
            }

            // Count the submission as soon as it is stored. Sitting after the send made the
            // card read 0 for a form whose mail was failing, while the same submissions were
            // plainly visible in the inbox.
            try {
                await writeConfigSafe(cfg => {
                    if (!cfg.statistics) cfg.statistics = {};
                    if (!cfg.statistics[formId]) {
                        cfg.statistics[formId] = { successfulSubmissions: 0, lastSubmission: null, mailsSent: 0, notificationsSent: 0 };
                    }
                    cfg.statistics[formId].successfulSubmissions++;
                    cfg.statistics[formId].lastSubmission = new Date().toISOString();
                });
            } catch (statsError) {
                log.error('Error updating statistics', { formId, error: statsError.message });
            }

        // Send email (only if sender exists and is active).
        // The chain is the configured sender plus its backups; a sender-level
        // failure moves the same message down the chain (see sendWithFailover).
        const senderChain = skipEmail ? [] : resolveSenderChain(senderInfo.senderId, senderInfo.accountId);
        if (!skipEmail) {
            const buildMailOptions = (cfg) => ({
                from: `"${escapeHtml(String(senderName))}" <${cfg.from}>`,
                to: recipientConfig.to,
                subject: emailSubject,
                html: mailBody,
                replyTo: senderEmail || undefined,
                attachments: uploadedFiles.map(f => ({
                    filename: f.originalname,
                    path: f.path
                }))
            });

            try {
                const outcome = await sendWithFailover(senderChain, buildMailOptions, { formId, to: recipientConfig.to });
                const sendMeta = outcome.meta;
                // Detailed delivery log: provider, accept status code, message id (trace handle),
                // and per-recipient accepted/rejected. For SendGrid, statusCode 202 = queued, not delivered.
                log.info('Email sent', {
                    formId, to: recipientConfig.to,
                    senderId: outcome.senderId,
                    failedOver: outcome.failedOver,
                    provider: sendMeta.provider,
                    statusCode: sendMeta.statusCode,
                    messageId: sendMeta.messageId,
                    accepted: sendMeta.accepted,
                    rejected: sendMeta.rejected,
                    response: sendMeta.response
                });

                const mailEntry = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    timestamp: emailTimestamp,
                    channel: 'email',
                    to: recipientConfig.to,
                    subject: emailSubject,
                    status: 'ok',
                    senderId: outcome.senderId,
                    provider: sendMeta.provider,
                    providerStatus: sendMeta.statusCode,
                    messageId: sendMeta.messageId,
                    response: sendMeta.response
                };
                if (outcome.failedOver) {
                    mailEntry.failedOver = true;
                    mailEntry.primarySenderId = senderChain[0] && senderChain[0].id;
                }
                saveOutboxEntry(formId, mailEntry).catch(e => log.error('Error saving outbox entry', { error: e.message }));
                broadcastSSE({ type: 'outbox', websiteId: formId, ...mailEntry });

                writeConfigSafe(cfg => {
                    if (cfg.statistics && cfg.statistics[formId]) {
                        cfg.statistics[formId].mailsSent = (cfg.statistics[formId].mailsSent || 0) + 1;
                    }
                }).catch(() => {});
            } catch (error) {
                // The submission itself is already stored, so this is a delivery failure only.
                log.error('Error sending email', {
                    formId, to: recipientConfig.to,
                    provider: error.provider || 'smtp',
                    statusCode: error.statusCode || null,
                    attempts: error.attempts || [],
                    error: error.message
                });

                const mailFailEntry = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    timestamp: emailTimestamp,
                    channel: 'email',
                    to: recipientConfig.to,
                    subject: emailSubject,
                    status: 'error',
                    senderId: senderInfo.senderId,
                    provider: error.provider || 'smtp',
                    providerStatus: error.statusCode || null,
                    error: error.message
                };
                if (error.attempts && error.attempts.length > 1) {
                    mailFailEntry.triedSenders = error.attempts.map(a => a.senderId);
                }
                saveOutboxEntry(formId, mailFailEntry).catch(() => {});
                broadcastSSE({ type: 'outbox', websiteId: formId, ...mailFailEntry });

                return res.status(500).send(t.serverError);
            }
        }



            // Send Discord webhook notification if configured
            if (recipientConfig.discordWebhook) {
                const discordTimestamp = new Date().toISOString();
                try {
                    const sName = formFields.name || formFields.nombre || formFields.full_name || 'Unknown';
                    const sEmail = email || 'N/A';
                    const fieldsForDiscord = fieldEntries
                        .filter(([k]) => !['form_id','website_id','cf-turnstile-response','h-captcha-response','g-recaptcha-response','_hp_field'].includes(k))
                        .slice(0, 10)
                        .map(([k, v]) => ({ name: fieldToLabel(k), value: String(v || '').substring(0, 200) || '-', inline: true }));
                    const discordPayload = {
                        embeds: [{
                            title: `New submission: ${formId}`,
                            color: 0xe8713a,
                            fields: fieldsForDiscord,
                            footer: { text: 'formPost' },
                            timestamp: discordTimestamp
                        }]
                    };
                    if (uploadedFiles.length > 0) {
                        const fd = new FormData();
                        fd.append('payload_json', JSON.stringify(discordPayload));
                        uploadedFiles.forEach((f, i) => {
                            fd.append(`files[${i}]`, require('fs').createReadStream(f.path), f.originalname);
                        });
                        await axios.post(recipientConfig.discordWebhook, fd, {
                            timeout: 15000,
                            headers: fd.getHeaders(),
                            maxContentLength: MAX_FILE_SIZE * MAX_FILES
                        });
                    } else {
                        await axios.post(recipientConfig.discordWebhook, discordPayload, { timeout: 5000 });
                    }
                    log.info('Discord webhook sent', { formId });

                    // Log to outbox
                    const discordEntry = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        timestamp: discordTimestamp,
                        channel: 'discord',
                        to: 'Discord Webhook',
                        subject: `${submitterName} - ${email || 'N/A'}`,
                        status: 'ok'
                    };
                    saveOutboxEntry(formId, discordEntry).catch(e => log.error('Error saving outbox entry', { error: e.message }));
                    broadcastSSE({ type: 'outbox', websiteId: formId, ...discordEntry });

                    // Update notification count
                    writeConfigSafe(cfg => {
                        if (cfg.statistics && cfg.statistics[formId]) {
                            cfg.statistics[formId].notificationsSent = (cfg.statistics[formId].notificationsSent || 0) + 1;
                        }
                    }).catch(() => {});
                } catch (webhookErr) {
                    log.error('Discord webhook failed', { formId, error: webhookErr.message });

                    // Log failure to outbox
                    const discordFailEntry = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        timestamp: discordTimestamp,
                        channel: 'discord',
                        to: 'Discord Webhook',
                        subject: `${submitterName} - ${email || 'N/A'}`,
                        status: 'error',
                        error: webhookErr.message
                    };
                    saveOutboxEntry(formId, discordFailEntry).catch(() => {});
                    broadcastSSE({ type: 'outbox', websiteId: formId, ...discordFailEntry });
                }
            }

            // Send Telegram notification if configured
            if (recipientConfig.telegramBotToken && recipientConfig.telegramChatId) {
                const telegramTimestamp = new Date().toISOString();
                const tgToken = decryptSecret(recipientConfig.telegramBotToken);
                try {
                    if (!tgToken) throw new Error('Stored Telegram bot token cannot be decrypted (encryption key mismatch)');
                    const tName = formFields.name || formFields.nombre || formFields.full_name || 'Unknown';
                    const tFields = fieldEntries
                        .filter(([k]) => !['form_id','website_id','cf-turnstile-response','h-captcha-response','g-recaptcha-response','_hp_field'].includes(k))
                        .slice(0, 10)
                        .map(([k, v]) => `<b>${escapeHtml(fieldToLabel(k))}:</b> ${escapeHtml(String(v || '-').substring(0, 200))}`)
                        .join('\n');
                    const telegramText = `📩 <b>New submission: ${escapeHtml(formId)}</b>\n\n${tFields}\n\n<i>formPost</i>`;
                    await axios.post(
                        `https://api.telegram.org/bot${tgToken}/sendMessage`,
                        { chat_id: recipientConfig.telegramChatId, text: telegramText, parse_mode: 'HTML' },
                        { timeout: 5000 }
                    );
                    // Send each attachment as a document
                    for (const f of uploadedFiles) {
                        const fd = new FormData();
                        fd.append('chat_id', recipientConfig.telegramChatId);
                        fd.append('document', require('fs').createReadStream(f.path), f.originalname);
                        await axios.post(
                            `https://api.telegram.org/bot${tgToken}/sendDocument`,
                            fd,
                            { timeout: 15000, headers: fd.getHeaders(), maxContentLength: MAX_FILE_SIZE }
                        );
                    }
                    log.info('Telegram notification sent', { formId, attachments: uploadedFiles.length });

                    const telegramEntry = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        timestamp: telegramTimestamp,
                        channel: 'telegram',
                        to: `Chat ${recipientConfig.telegramChatId}`,
                        subject: `${submitterName} - ${email || 'N/A'}`,
                        status: 'ok'
                    };
                    saveOutboxEntry(formId, telegramEntry).catch(() => {});
                    broadcastSSE({ type: 'outbox', websiteId: formId, ...telegramEntry });

                    writeConfigSafe(cfg => {
                        if (cfg.statistics && cfg.statistics[formId]) {
                            cfg.statistics[formId].notificationsSent = (cfg.statistics[formId].notificationsSent || 0) + 1;
                        }
                    }).catch(() => {});
                } catch (telegramErr) {
                    log.error('Telegram notification failed', { formId, error: telegramErr.message });

                    const telegramFailEntry = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        timestamp: telegramTimestamp,
                        channel: 'telegram',
                        to: `Chat ${recipientConfig.telegramChatId}`,
                        subject: `${submitterName} - ${email || 'N/A'}`,
                        status: 'error',
                        error: telegramErr.message
                    };
                    saveOutboxEntry(formId, telegramFailEntry).catch(() => {});
                    broadcastSSE({ type: 'outbox', websiteId: formId, ...telegramFailEntry });
                }
            }

            // Send generic webhook if configured
            if (recipientConfig.webhookUrl) {
                try {
                    const webhookPayload = {
                        formId: formId,
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
                    log.info('Webhook sent', { formId, url: recipientConfig.webhookUrl });
                } catch (webhookErr) {
                    log.error('Webhook failed', { formId, error: webhookErr.message });
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
                            .replace(/{{form_id}}|{{website_id}}/g, escapeHtml(formId))
                            .replace(/{{fields}}/g, arFields);
                    } catch (e) {
                        autoReplyBody = '<h2>Thank you for your submission</h2><p>We have received your message and will get back to you soon.</p>';
                    }
                    const arSubject = recipientConfig.autoReplySubject || 'Thank you for your submission';
                    const arOutcome = await sendWithFailover(senderChain, (cfg) => ({
                        from: `"${escapeHtml(String(senderAlias || cfg.name || 'No Reply'))}" <${cfg.from}>`,
                        to: senderEmail,
                        subject: arSubject,
                        html: autoReplyBody,
                        replyTo: recipientConfig.autoReplyReplyTo || undefined
                    }), { formId, to: senderEmail, autoReply: true });
                    const arMeta = arOutcome.meta;
                    log.info('Auto-reply sent', {
                        formId, to: senderEmail,
                        senderId: arOutcome.senderId,
                        failedOver: arOutcome.failedOver,
                        provider: arMeta.provider,
                        statusCode: arMeta.statusCode,
                        messageId: arMeta.messageId,
                        response: arMeta.response
                    });

                    const arEntry = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        timestamp: new Date().toISOString(),
                        channel: 'email',
                        to: senderEmail,
                        subject: arSubject,
                        status: 'ok',
                        autoReply: true,
                        senderId: arOutcome.senderId,
                        failedOver: arOutcome.failedOver || undefined,
                        provider: arMeta.provider,
                        providerStatus: arMeta.statusCode,
                        messageId: arMeta.messageId,
                        response: arMeta.response
                    };
                    saveOutboxEntry(formId, arEntry).catch(() => {});
                    broadcastSSE({ type: 'outbox', websiteId: formId, ...arEntry });

                    writeConfigSafe(cfg => {
                        if (cfg.statistics && cfg.statistics[formId]) {
                            cfg.statistics[formId].mailsSent = (cfg.statistics[formId].mailsSent || 0) + 1;
                        }
                    }).catch(() => {});
                } catch (arErr) {
                    log.error('Auto-reply failed', { formId, error: arErr.message });
                }
            }

            // Redirect or respond with success
            if (recipientConfig.redirectUrl) {
                res.redirect(302, recipientConfig.redirectUrl);
            } else {
                res.status(200).json({ success: true, message: t.formSuccess });
            }
    } catch (templateError) {
        log.error('Error reading email template', { formId, error: templateError.message });
        res.status(500).send(t.templateReadError);
    }
});

// Multer error handler for /submit
app.use('/submit', (err, req, res, next) => {
    // Clean up any partially uploaded files
    if (req.files) {
        for (const f of req.files) fs.unlink(f.path).catch(() => {});
    }
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).send('File too large (max 10 MB).');
        if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).send('Too many files (max 5).');
        return res.status(400).send('File upload error.');
    }
    if (err && err.message === 'File type not allowed') {
        return res.status(400).send('File type not allowed.');
    }
    next(err);
});

// Health Check Endpoint - minimal info, no internals exposed
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===================== Login: sessions, one-time codes, Google =====================
// Three ways in, all resolving to the same session token:
//   1. email (or username) + password   2. email + one-time code (OTP)   3. Google
// Users are never auto-registered: the email must already belong to a user.

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
const SESSION_PREFIX = 'fps1.';
// Session signing key derived from the server's encryption key, so tokens keep
// working across restarts and die if the encryption key is rotated.
const SESSION_KEY = nodeCrypto.createHmac('sha256', ENCRYPTION_KEY).update('formpost-session-v1').digest();

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function issueSessionToken(username) {
    const payload = b64url(JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_MS }));
    const sig = b64url(nodeCrypto.createHmac('sha256', SESSION_KEY).update(payload).digest());
    return SESSION_PREFIX + payload + '.' + sig;
}

// Returns the username carried by a valid, unexpired token, or null.
function verifySessionToken(token) {
    if (typeof token !== 'string' || !token.startsWith(SESSION_PREFIX)) return null;
    const [payload, sig] = token.slice(SESSION_PREFIX.length).split('.');
    if (!payload || !sig) return null;
    const expected = b64url(nodeCrypto.createHmac('sha256', SESSION_KEY).update(payload).digest());
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !nodeCrypto.timingSafeEqual(a, b)) return null;
    try {
        const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        if (!data || !data.u || !data.exp || data.exp < Date.now()) return null;
        return data.u;
    } catch (e) {
        return null;
    }
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

// Find a user by email (case-insensitive). Returns [username, userRecord] or null.
function findUserByEmail(email) {
    const wanted = normalizeEmail(email);
    if (!wanted) return null;
    for (const [username, u] of Object.entries(config.users || {})) {
        if (normalizeEmail(u.email) === wanted) return [username, u];
    }
    return null;
}

// Is this email already used by another user? (email is the login identifier)
function userEmailTaken(email, exceptUsername) {
    const found = findUserByEmail(email);
    return !!found && found[0] !== exceptUsername;
}

// Login identifier accepts email or username (the historic login).
function findLoginUser(identifier) {
    const byEmail = findUserByEmail(identifier);
    if (byEmail) return byEmail;
    const username = String(identifier || '').trim();
    const rec = (config.users || {})[username];
    return rec ? [username, rec] : null;
}

// ---- One-time codes (OTP) ----
// In memory on purpose: codes live 10 minutes, a restart simply invalidates them.
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;
const OTP_MAX_PER_HOUR = 5;
const loginCodes = new Map();   // email -> { codeHash, expires, attempts }
const otpRequestLog = new Map(); // email -> [timestamps]

function hashLoginCode(code) {
    return nodeCrypto.createHmac('sha256', SESSION_KEY).update('otp:' + String(code)).digest('hex');
}

function otpRequestAllowed(email) {
    const now = Date.now();
    const recent = (otpRequestLog.get(email) || []).filter(ts => now - ts < 60 * 60 * 1000);
    if (recent.length >= OTP_MAX_PER_HOUR) {
        otpRequestLog.set(email, recent);
        return false;
    }
    recent.push(now);
    otpRequestLog.set(email, recent);
    return true;
}

// Pick a transporter to deliver the code: the user's account sender first,
// then any global one. Same visibility rules as the rest of the app.
function getTransporterForAccount(accountId) {
    const ids = Object.keys(transporters).filter(id => {
        const s = config.senders[id];
        return s && s.active !== false && (accountId === null || senderUsableByAccount(s, accountId));
    });
    ids.sort((a, b) => {
        const aOwn = config.senders[a].accountId === accountId ? 0 : 1;
        const bOwn = config.senders[b].accountId === accountId ? 0 : 1;
        return aOwn - bOwn;
    });
    const id = ids[0];
    return id ? { transporter: transporters[id], senderCfg: config.senders[id], senderId: id, accountId } : null;
}

async function sendLoginCodeEmail(user, email, code) {
    const accountId = user.role === 'superadmin' ? null : (user.accountId || 'default');
    const senderInfo = getTransporterForAccount(accountId);
    if (!senderInfo) throw new Error('no-sender');
    const minutes = Math.round(OTP_TTL_MS / 60000);
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#212529;">
        <h2 style="color:#2c3d7f;">formPost</h2>
        <p>${escapeHtml(user.name || '')}${user.name ? ', t' : 'T'}u código de acceso de un solo uso es:</p>
        <p style="font-size:30px;font-weight:700;letter-spacing:6px;color:#2c3d7f;">${escapeHtml(code)}</p>
        <p>Vence en ${minutes} minutos y sirve una sola vez.</p>
        <p style="color:#6c757d;font-size:13px;">Si no pediste este código, ignorá este mensaje.</p>
    </div>`;
    // The login code is the one mail nobody can resend by hand, so it uses the
    // backup chain too.
    const chain = resolveSenderChain(senderInfo.senderId, accountId);
    await sendWithFailover(chain, (cfg) => ({
        from: `"formPost" <${cfg.from}>`,
        to: email,
        subject: t.otpSubject,
        html
    }), { otp: true, to: email });
}

// ---- Google sign-in ----
// The browser gets an ID token from Google Identity Services and posts it here.
// Anti-substitution: the token must have been issued for OUR client id.
async function verifyGoogleIdToken(credential) {
    const clientId = googleClientId();
    if (!clientId) { const e = new Error(t.googleDisabled); e.code = 'disabled'; throw e; }
    let data;
    try {
        const resp = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
            params: { id_token: credential },
            timeout: 8000
        });
        data = resp.data || {};
    } catch (err) {
        const e = new Error(t.googleInvalidToken); e.code = 'invalid'; throw e;
    }
    if (data.aud !== clientId && data.azp !== clientId) {
        log.warn('Google token with foreign audience rejected', { aud: data.aud, azp: data.azp });
        const e = new Error(t.googleInvalidToken); e.code = 'invalid'; throw e;
    }
    if (!data.email) { const e = new Error(t.googleInvalidToken); e.code = 'invalid'; throw e; }
    if (data.email_verified !== true && data.email_verified !== 'true') {
        const e = new Error(t.googleEmailNotVerified); e.code = 'unverified'; throw e;
    }
    return { email: normalizeEmail(data.email), name: data.name || '' };
}

function sessionResponse(res, username, user, method) {
    log.info('Admin login', { username, method, role: user.role || 'user' });
    res.json({
        token: issueSessionToken(username),
        user: {
            username,
            role: user.role || 'user',
            accountId: user.role === 'superadmin' ? null : (user.accountId || null),
            name: user.name || '',
            email: user.email || ''
        }
    });
}

// Admin authentication middleware.
// Accepts a session token (Authorization: Bearer <token>) or HTTP Basic.
async function adminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const username = verifySessionToken(authHeader.slice(7).trim());
        const userRec = username && (config.users || {})[username];
        if (!userRec) return res.status(401).json({ error: t.sessionExpired });
        req.user = {
            username,
            role: userRec.role || 'user',
            accountId: userRec.role === 'superadmin' ? null : (userRec.accountId || null)
        };
        return next();
    }
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

    const userRec = (config.users || {})[user];
    if (userRec && userRec.passwordHash) {
        const match = await bcrypt.compare(pass, userRec.passwordHash);
        if (match) {
            req.user = {
                username: user,
                role: userRec.role || 'user',
                accountId: userRec.role === 'superadmin' ? null : (userRec.accountId || null)
            };
            return next();
        }
    } else if (config.admin && user === config.admin.username) {
        // Pre-migration fallback (legacy single-admin config)
        const match = await bcrypt.compare(pass, config.admin.password);
        if (match) {
            req.user = { username: user, role: 'superadmin', accountId: null };
            return next();
        }
    }
    // Apply auth rate limit only on failed attempts
    authLimiter(req, res, () => res.status(403).send(t.forbidden));
}

// ===== Account scoping helpers =====
// Scope semantics: null = superadmin (sees everything); otherwise an accountId string.
// NO_SCOPE matches nothing (non-superadmin user without an account — corrupt data guard).
const NO_SCOPE = '\x00none';

function getAccountScope(req) {
    if (!req.user) return NO_SCOPE;
    if (req.user.role === 'superadmin') return null;
    return req.user.accountId || NO_SCOPE;
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: t.forbidden });
        }
        next();
    };
}

function formInScope(scope, formCfg) {
    return scope === null || scope === (formCfg.accountId || 'default');
}

// Senders without accountId are global: visible/usable by every scope, managed by superadmin
function senderInScope(scope, senderCfg) {
    return scope === null || !senderCfg.accountId || senderCfg.accountId === scope;
}

function canAccessForm(req, formId) {
    const r = (config.recipients || {})[formId];
    return !!r && formInScope(getAccountScope(req), r);
}

function canAccessSender(req, senderId) {
    const s = (config.senders || {})[senderId];
    return !!s && senderInScope(getAccountScope(req), s);
}

// Writing (edit/delete) a sender: scoped admins may only touch their own account's senders
function canManageSender(req, senderId) {
    const s = (config.senders || {})[senderId];
    if (!s) return false;
    const scope = getAccountScope(req);
    return scope === null || s.accountId === scope;
}

function formsForScope(scope) {
    const out = {};
    for (const [id, cfg] of Object.entries(config.recipients || {})) {
        if (formInScope(scope, cfg)) out[id] = cfg;
    }
    return out;
}

function sendersForScope(scope) {
    const out = {};
    for (const [id, cfg] of Object.entries(config.senders || {})) {
        if (senderInScope(scope, cfg)) out[id] = cfg;
    }
    return out;
}

// Mask secrets on form configs before returning them through any API
function sanitizeRecipientForApi(id, cfg) {
    const out = { ...cfg };
    if (out.telegramBotToken) out.telegramBotToken = '••••';
    if (out.captchaKey) out.captchaKey = '••••';
    out.hasCaptchaKey = !!(((config.captcha || {})[id]) || ((config.turnstile || {})[id]));
    return out;
}

// Strip masked/encrypted echoes from incoming form patches so stored secrets are preserved
function stripSecretEchoes(patch) {
    for (const field of ['telegramBotToken', 'captchaKey']) {
        if (patch[field] === '••••' || isEncrypted(patch[field])) delete patch[field];
    }
    return patch;
}

// templatePath allowed for a scoped (non-superadmin) caller:
// shared root templates, legacy root files, or templates of their own account folder
function templatePathAllowed(tp, scope) {
    if (!scope || scope === null) return true;
    const norm = String(tp).replace(/\\/g, '/');
    if (norm.startsWith(`templates/${scope}/`)) return !norm.slice(`templates/${scope}/`.length).includes('/');
    if (norm.startsWith('templates/')) return !norm.slice('templates/'.length).includes('/');
    return !norm.includes('/');
}

// Serve admin UI (no Basic Auth - the frontend handles its own login)
app.use('/admin', (req, res, next) => {
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
        const scope = getAccountScope(req);
        const scopedForms = formsForScope(scope);
        // Calculate total submissions across visible websites
        const stats = config.statistics || {};
        let totalSubmissions = 0, totalMails = 0, totalNotifications = 0;
        for (const formId of Object.keys(scopedForms)) {
            const ws = stats[formId] || {};
            totalSubmissions += (ws.successfulSubmissions || 0);
            totalMails += (ws.mailsSent || 0);
            totalNotifications += (ws.notificationsSent || 0);
        }
        const accountName = req.user.accountId && config.accounts && config.accounts[req.user.accountId]
            ? (config.accounts[req.user.accountId].name || req.user.accountId)
            : null;
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
            supporthubUrl: SUPPORTHUB_URL,
            user: {
                username: req.user.username,
                role: req.user.role,
                accountId: req.user.accountId,
                accountName,
                email: ((config.users || {})[req.user.username] || {}).email || '',
                name: ((config.users || {})[req.user.username] || {}).name || ''
            },
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
            },
            config: {
                websites: Object.keys(scopedForms),
                senders: Object.keys(sendersForScope(scope)),
                captcha: Object.keys(config.captcha || config.turnstile || {}).filter(id => scopedForms[id])
            }
        });
    } catch (e) {
        res.status(500).json({ error: t.failedRetrieveStatus });
    }
});

// Get list of configured websites (scoped, secrets masked)
adminRouter.get('/websites', (req, res) => {
    const out = {};
    for (const [id, cfg] of Object.entries(formsForScope(getAccountScope(req)))) {
        out[id] = sanitizeRecipientForApi(id, cfg);
        // Read-only, computed: the sender this form really sends through, which is not
        // always the one it names (missing, deleted or out of account -> fallback).
        // Kept out of sanitizeRecipientForApi so it can never reach a write path.
        out[id].effectiveSenderId = effectiveSenderIdForForm(cfg);
        out[id].issues = formIssues(cfg);
    }
    res.json(out);
});

// Add a new website configuration
adminRouter.post('/websites', requireRole('superadmin', 'admin'), async (req, res) => {
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
    const scope = getAccountScope(req);
    const accountId = scope || siteConfig.accountId || 'default';
    if (!(config.accounts || {})[accountId]) {
        return res.status(400).json({ error: 'Unknown account: ' + accountId });
    }
    const recipientError = validateRecipientsPatch(siteConfig);
    if (recipientError) return res.status(400).json({ error: recipientError });
    stripSecretEchoes(siteConfig);
    siteConfig.accountId = accountId;
    if (siteConfig.senderId) {
        const senderRef = (config.senders || {})[siteConfig.senderId];
        if (senderRef && !senderUsableByAccount(senderRef, accountId)) {
            return res.status(400).json({ error: 'senderId belongs to another account' });
        }
    }
    if (siteConfig.templatePath && !templatePathAllowed(siteConfig.templatePath, scope)) {
        return res.status(400).json({ error: 'templatePath outside your account templates' });
    }
    try {
        await writeConfigSafe(cfg => {
            cfg.recipients[id] = siteConfig;
            if (siteConfig.captchaKey) {
                if (!cfg.captcha) cfg.captcha = {};
                cfg.captcha[id] = { secretKey: siteConfig.captchaKey };
            }
            delete cfg.recipients[id].captchaKey;
        });
        res.status(201).json({ message: t.formAdded });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// Update existing website configuration
adminRouter.put('/websites/:id', requireRole('superadmin', 'admin'), async (req, res) => {
    const { id } = req.params;
    const siteConfig = req.body;
    if (!canAccessForm(req, id)) {
        return res.status(404).json({ error: t.formNotFound });
    }
    const scope = getAccountScope(req);
    const recipientError = validateRecipientsPatch(siteConfig);
    if (recipientError) return res.status(400).json({ error: recipientError });
    stripSecretEchoes(siteConfig);
    // Only superadmin may move a form between accounts
    if (scope !== null) delete siteConfig.accountId;
    if (siteConfig.accountId && !(config.accounts || {})[siteConfig.accountId]) {
        return res.status(400).json({ error: 'Unknown account: ' + siteConfig.accountId });
    }
    const targetAccount = siteConfig.accountId || config.recipients[id].accountId || 'default';
    if (siteConfig.senderId) {
        const senderRef = (config.senders || {})[siteConfig.senderId];
        if (senderRef && !senderUsableByAccount(senderRef, targetAccount)) {
            return res.status(400).json({ error: 'senderId belongs to another account' });
        }
    }
    if (siteConfig.templatePath && !templatePathAllowed(siteConfig.templatePath, scope)) {
        return res.status(400).json({ error: 'templatePath outside your account templates' });
    }
    try {
        await writeConfigSafe(cfg => {
            cfg.recipients[id] = { ...cfg.recipients[id], ...siteConfig };
            if (siteConfig.captchaKey) {
                if (!cfg.captcha) cfg.captcha = {};
                cfg.captcha[id] = { secretKey: siteConfig.captchaKey };
            }
            delete cfg.recipients[id].captchaKey;
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
adminRouter.delete('/websites/:id', requireRole('superadmin', 'admin'), async (req, res) => {
    const { id } = req.params;
    if (!canAccessForm(req, id)) {
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
        deleteFormAttachments(id).catch(() => {});
        res.json({ message: t.formRemoved });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// Senders (SMTP relays) CRUD routes. Senders without accountId are global (superadmin-managed).
adminRouter.get('/senders', (req, res) => {
    const scope = getAccountScope(req);
    const formsBySender = formCountsBySender(scope);
    const sanitized = {};
    for (const [id, cfg] of Object.entries(sendersForScope(scope))) {
        sanitized[id] = {
            name: cfg.name || id,
            type: cfg.type || 'smtp',
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            active: cfg.active !== false,
            from: cfg.from,
            user: cfg.user || '',
            pass: cfg.pass ? '••••' : '',
            apiKey: cfg.apiKey ? '••••' : '',
            domain: cfg.domain || '',
            accountId: cfg.accountId || null,
            global: !cfg.accountId,
            backupSenderId: cfg.backupSenderId || '',
            health: senderHealthForApi(id),
            // Forms whose mail actually goes out through this sender, within this caller's scope
            formCount: (formsBySender[id] || []).length,
            formIds: (formsBySender[id] || []).slice(0, 25)
        };
    }
    res.json(sanitized);
});

// Strip masked echoes so stored sender secrets are preserved on partial updates
function stripSenderSecretEchoes(patch) {
    for (const field of ['pass', 'apiKey']) {
        if (patch[field] === '••••' || patch[field] === '' || isEncrypted(patch[field])) delete patch[field];
    }
    return patch;
}

adminRouter.post('/senders', requireRole('superadmin', 'admin'), async (req, res) => {
    const { id, config: senderConfig } = req.body;
    if (!id || !senderConfig) return res.status(400).json({ error: t.missingIdOrConfig });
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) return res.status(400).json({ error: 'Invalid sender ID' });
    if (config.senders[id]) return res.status(409).json({ error: 'Sender ID already exists' });
    const scope = getAccountScope(req);
    stripSenderSecretEchoes(senderConfig);
    if (scope !== null) {
        // Account admins always create senders in their own account
        senderConfig.accountId = scope;
    } else if (senderConfig.accountId) {
        if (!(config.accounts || {})[senderConfig.accountId]) {
            return res.status(400).json({ error: 'Unknown account: ' + senderConfig.accountId });
        }
    } else {
        delete senderConfig.accountId; // global sender
    }
    if (senderConfig.backupSenderId === '' || senderConfig.backupSenderId === null) delete senderConfig.backupSenderId;
    const backupError = validateBackupSenderId(senderConfig.backupSenderId, id, senderConfig.accountId || null);
    if (backupError) return res.status(400).json({ error: backupError });
    normalizeSenderTls(senderConfig);
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.senders) cfg.senders = {};
            cfg.senders[id] = senderConfig;
            pruneInvalidBackupRefs(cfg);
        });
        rebuildAllTransporters();
        res.status(201).json({ message: 'Sender added' });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.put('/senders/:id', requireRole('superadmin', 'admin'), async (req, res) => {
    const { id } = req.params;
    if (!config.senders || !config.senders[id]) return res.status(404).json({ error: 'Sender not found' });
    if (!canManageSender(req, id)) return res.status(403).json({ error: t.forbidden });
    const update = req.body;
    stripSenderSecretEchoes(update);
    const scope = getAccountScope(req);
    if (scope !== null) {
        delete update.accountId; // only superadmin can move/globalize a sender
    } else if (update.accountId !== undefined && update.accountId !== null && update.accountId !== '') {
        if (!(config.accounts || {})[update.accountId]) {
            return res.status(400).json({ error: 'Unknown account: ' + update.accountId });
        }
    }
    // The backup must be legal for the account this sender will belong to AFTER the update
    const merged = { ...config.senders[id], ...update };
    if (merged.accountId === null || merged.accountId === '') delete merged.accountId;
    const backupError = validateBackupSenderId(update.backupSenderId, id, merged.accountId || null);
    if (backupError) return res.status(400).json({ error: backupError });
    try {
        await writeConfigSafe(cfg => {
            cfg.senders[id] = { ...cfg.senders[id], ...update };
            if (update.accountId === null || update.accountId === '') delete cfg.senders[id].accountId;
            if (update.backupSenderId === '' || update.backupSenderId === null) delete cfg.senders[id].backupSenderId;
            normalizeSenderTls(cfg.senders[id]);
            pruneInvalidBackupRefs(cfg);
        });
        rebuildAllTransporters();
        // Config changed: give the sender a clean slate instead of inheriting the old breaker state
        delete senderHealth[id];
        res.json({ message: t.smtpUpdated });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.delete('/senders/:id', requireRole('superadmin', 'admin'), async (req, res) => {
    const { id } = req.params;
    if (!config.senders || !config.senders[id]) return res.status(404).json({ error: 'Sender not found' });
    if (!canManageSender(req, id)) return res.status(403).json({ error: t.forbidden });
    try {
        await writeConfigSafe(cfg => {
            delete cfg.senders[id];
            pruneInvalidBackupRefs(cfg); // other senders may have used this one as backup
        });
        delete transporters[id];
        delete senderHealth[id];
        res.json({ message: 'Sender removed' });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// Clear the circuit breaker so the next message tries this sender again,
// without waiting for the cooldown.
adminRouter.post('/senders/:id/health/reset', requireRole('superadmin', 'admin'), (req, res) => {
    const { id } = req.params;
    if (!config.senders || !config.senders[id]) return res.status(404).json({ error: 'Sender not found' });
    if (!canAccessSender(req, id)) return res.status(403).json({ error: t.forbidden });
    delete senderHealth[id];
    log.info('Sender health reset', { senderId: id, by: req.user && req.user.username });
    res.json({ message: 'Sender re-enabled', health: senderHealthForApi(id) });
});

// Run a sender connection test against an in-memory config (never persisted)
async function runSenderTest(res, senderCfg, testTo, label) {
    if (!testTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }
    // A test must report the truth about THIS sender: no failover here, on purpose.
    try {
        const testTransporter = buildTransporter(senderCfg);
        await testTransporter.verify();
        const senderType = senderCfg.type === 'sendgrid' ? 'SendGrid' : 'SMTP';
        const meta = normalizeSendResult(await testTransporter.sendMail({
            from: senderCfg.from,
            to: testTo,
            subject: 'formPost - Test Connection',
            html: '<h2>formPost ' + senderType + ' Test</h2><p>This is a test email from formPost to verify that the ' + senderType + ' sender <strong>' + escapeHtml(label) + '</strong> is working correctly.</p><p>If you received this email, the configuration is correct.</p>'
        }));
        log.info('Sender test sent', { sender: label, to: testTo, provider: meta.provider, statusCode: meta.statusCode, messageId: meta.messageId, response: meta.response });
        // Report the real provider response so "OK" is verifiable, not assumed.
        // For SendGrid, 202 = accepted for delivery; trace the message-id in the Activity Feed to confirm actual delivery.
        const detail = meta.provider === 'sendgrid'
            ? ('SendGrid accepted it (HTTP ' + (meta.statusCode || '?') + ')' + (meta.messageId ? ', message-id ' + meta.messageId : ''))
            : (meta.response || 'sent');
        res.json({ message: 'Test email sent to ' + testTo + ' — ' + detail, provider: meta.provider, statusCode: meta.statusCode, messageId: meta.messageId, response: meta.response });
    } catch (e) {
        log.error('Sender test failed', { sender: label, code: e.code, responseCode: e.responseCode, error: e.message });
        res.status(500).json({ error: 'Connection failed: ' + explainSendError(e, senderCfg) });
    }
}

// Test an unsaved sender config straight from the editor (body: { to, config })
adminRouter.post('/senders/test', requireRole('superadmin', 'admin'), async (req, res) => {
    const senderCfg = (req.body && req.body.config) || {};
    stripSenderSecretEchoes(senderCfg);
    if (!senderCfg.from) return res.status(400).json({ error: '"from" is required' });
    await runSenderTest(res, senderCfg, (req.body && req.body.to) || senderCfg.from, senderCfg.name || 'new sender');
});

// Test sender connection. Accepts unsaved editor values in body.config,
// merged over the stored config (empty/masked secrets fall back to stored ones).
adminRouter.post('/senders/:id/test', requireRole('superadmin', 'admin'), async (req, res) => {
    const { id } = req.params;
    const stored = config.senders && config.senders[id];
    if (!stored || !canAccessSender(req, id)) return res.status(404).json({ error: 'Sender not found' });
    const override = (req.body && req.body.config) || {};
    stripSenderSecretEchoes(override);
    delete override.accountId;
    const senderCfg = { ...stored, ...override };
    await runSenderTest(res, senderCfg, (req.body && req.body.to) || senderCfg.from, senderCfg.name || id);
});

// Telegram: fetch available chats from getUpdates.
// Accepts a raw botToken, or formId to use the stored (encrypted) token of that form.
adminRouter.post('/telegram/chats', requireRole('superadmin', 'admin'), async (req, res) => {
    let { botToken, formId } = req.body;
    if ((!botToken || botToken === '••••' || isEncrypted(botToken)) && formId && canAccessForm(req, formId)) {
        botToken = decryptSecret(config.recipients[formId].telegramBotToken);
    }
    if (!botToken) return res.status(400).json({ error: 'Bot token required' });
    try {
        const response = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`, { timeout: 5000 });
        const updates = response.data.result || [];
        const chats = {};
        for (const update of updates) {
            const msg = update.message || update.channel_post || update.my_chat_member && update.my_chat_member.chat;
            if (!msg) continue;
            const chat = msg.chat || msg;
            if (chat && chat.id && !chats[chat.id]) {
                chats[chat.id] = {
                    id: chat.id,
                    title: chat.title || chat.first_name || chat.username || String(chat.id),
                    type: chat.type
                };
            }
        }
        res.json(Object.values(chats));
    } catch (e) {
        const errMsg = e.response && e.response.data && e.response.data.description || e.message;
        res.status(400).json({ error: errMsg });
    }
});

// Legacy SMTP endpoint (backward compat — redirects to default sender)
adminRouter.get('/smtp', requireRole('superadmin'), (req, res) => {
    const def = config.senders && config.senders.default;
    if (!def) return res.json({});
    res.json({ host: def.host, port: def.port, secure: def.secure, from: def.from, user: def.user ? '****' : '', pass: def.pass ? '****' : '' });
});

adminRouter.put('/smtp', requireRole('superadmin'), async (req, res) => {
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
    for (const formId of Object.keys(formsForScope(getAccountScope(req)))) {
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
            if (entry.channel === 'email' && entry.status === 'ok') {
                mailCounts[key] = (mailCounts[key] || 0) + 1;
            } else if (entry.channel === 'discord' || entry.channel === 'telegram') {
                if (entry.status === 'ok') notifCounts[key] = (notifCounts[key] || 0) + 1;
            }
        }
        mails[formId] = mailCounts;
        notifications[formId] = notifCounts;
    }
    res.json({ submissions, mails, notifications });
});

// Statistics routes
adminRouter.get('/statistics', async (req, res) => {
    const stats = config.statistics || {};
    const enhancedStats = {};
    for (const [websiteId, websiteConfig] of Object.entries(formsForScope(getAccountScope(req)))) {
        const websiteStats = stats[websiteId] || { successfulSubmissions: 0, lastSubmission: null };
        const outbox = await loadOutboxEntries(websiteId);
        enhancedStats[websiteId] = {
            ...websiteStats,
            name: websiteConfig.subjectPrefix || websiteId,
            email: websiteConfig.to,
            // Failed deliveries still on record, so the card can flag a form that is
            // receiving fine but not delivering.
            mailErrors: outbox.filter(e => e.status === 'error').length
        };
    }
    res.json(enhancedStats);
});

adminRouter.get('/statistics/:id', (req, res) => {
    const { id } = req.params;
    if (!canAccessForm(req, id)) {
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

adminRouter.put('/statistics/:id/reset', requireRole('superadmin', 'admin'), async (req, res) => {
    const { id } = req.params;
    if (!canAccessForm(req, id)) {
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
    if (!canAccessForm(req, websiteId)) {
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

adminRouter.delete('/submissions/:websiteId', requireRole('superadmin', 'admin'), async (req, res) => {
    const { websiteId } = req.params;
    if (!canAccessForm(req, websiteId)) {
        return res.status(404).json({ error: t.formNotFound });
    }
    const filePath = path.join(DATA_DIR, `submissions-${websiteId}.json`);
    try {
        await fs.writeFile(filePath, JSON.stringify([], null, 2));
        deleteFormAttachments(websiteId).catch(() => {});
        res.json({ message: t.submissionsDeleted });
    } catch (e) {
        res.status(500).json({ error: t.failedDeleteSubs });
    }
});

adminRouter.delete('/submissions/:websiteId/:entryId', requireRole('superadmin', 'admin'), async (req, res) => {
    const { websiteId, entryId } = req.params;
    if (!canAccessForm(req, websiteId)) {
        return res.status(404).json({ error: t.formNotFound });
    }
    const filePath = path.join(DATA_DIR, `submissions-${websiteId}.json`);
    try {
        let submissions = await loadSubmissions(websiteId);
        const idx = submissions.findIndex(s => s.id === entryId);
        if (idx === -1) return res.status(404).json({ error: t.entryNotFound });
        submissions.splice(idx, 1);
        await fs.writeFile(filePath, JSON.stringify(submissions, null, 2));
        deleteSubmissionAttachments(websiteId, entryId).catch(() => {});
        res.json({ message: t.submissionDeleted });
    } catch (e) {
        res.status(500).json({ error: t.failedDeleteSubs });
    }
});

adminRouter.get('/submissions/:websiteId/export', async (req, res) => {
    const { websiteId } = req.params;
    if (!canAccessForm(req, websiteId)) {
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
        const excluded = ['attachments'];
        const dynamicFields = Array.from(headerSet).filter(k => !meta.includes(k) && !trailing.includes(k) && !excluded.includes(k)).sort();
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

// Resolve and validate an attachment request. Only filenames listed in the
// submission's attachments metadata are servable (primary traversal defense).
async function resolveAttachment(formId, entryId, filename) {
    if (!/^[a-z0-9]+$/i.test(entryId)) return null;
    const submissions = await loadSubmissions(formId);
    const entry = submissions.find(s => s.id === entryId);
    if (!entry || !Array.isArray(entry.attachments)) return null;
    const att = entry.attachments.find(a => a.filename === filename);
    if (!att) return null;
    const p = path.resolve(ATTACHMENTS_DIR, formId, entryId, att.filename);
    if (!p.startsWith(path.resolve(ATTACHMENTS_DIR) + path.sep)) return null;
    return { path: p, filename: att.filename };
}

// Download a stored attachment
adminRouter.get('/submissions/:websiteId/attachments/:entryId/:filename', async (req, res) => {
    const { websiteId, entryId, filename } = req.params;
    if (!canAccessForm(req, websiteId)) {
        return res.status(404).json({ error: t.formNotFound });
    }
    const att = await resolveAttachment(websiteId, entryId, filename);
    if (!att) return res.status(404).json({ error: t.entryNotFound });
    res.download(att.path, att.filename, err => {
        if (err && !res.headersSent) res.status(404).json({ error: t.entryNotFound });
    });
});

// Template management routes
const TEMPLATES_DIR = path.join(__dirname, 'templates');
async function ensureTemplatesDir() {
    try { await fs.mkdir(TEMPLATES_DIR, { recursive: true }); } catch (e) {}
}
ensureTemplatesDir();

// Template layout: templates/ root = shared/default set (visible to every account,
// writable by superadmin only); templates/{accountId}/ = per-account templates.
// Account-folder writes by admin/user roles; editing a shared one creates an account copy.

async function listTemplatesForScope(scope) {
    const templates = [];
    try {
        const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });
        for (const f of entries) {
            if (f.isFile() && f.name.endsWith('.html')) {
                templates.push({ name: f.name, path: `templates/${f.name}`, shared: true });
            }
        }
        const dirs = entries.filter(d => d.isDirectory());
        for (const d of dirs) {
            if (scope !== null && d.name !== scope) continue;
            try {
                const sub = await fs.readdir(path.join(TEMPLATES_DIR, d.name));
                for (const f of sub) {
                    if (f.endsWith('.html')) {
                        templates.push({ name: f, path: `templates/${d.name}/${f}`, accountId: d.name });
                    }
                }
            } catch (e) {}
        }
    } catch (e) {}
    // Legacy root email-template*.html files (shared)
    if (scope === null) {
        try {
            const rootFiles = await fs.readdir(__dirname);
            for (const f of rootFiles) {
                if (f.startsWith('email-template') && f.endsWith('.html')) {
                    templates.push({ name: f, path: f, shared: true });
                }
            }
        } catch (e) {}
    }
    return templates;
}

function validTemplateName(name) {
    return name.endsWith('.html') && !name.includes('/') && !name.includes('\\') && !name.includes('..');
}

// Resolve a template name for reading: account folder first, then shared root, then legacy root
async function resolveTemplateRead(name, scope, accountIdParam) {
    const candidates = [];
    if (scope) {
        candidates.push({ file: path.join(TEMPLATES_DIR, scope, name), rel: `templates/${scope}/${name}`, accountId: scope });
    } else if (accountIdParam && /^[a-zA-Z0-9_-]+$/.test(accountIdParam)) {
        candidates.push({ file: path.join(TEMPLATES_DIR, accountIdParam, name), rel: `templates/${accountIdParam}/${name}`, accountId: accountIdParam });
    }
    candidates.push({ file: path.join(TEMPLATES_DIR, name), rel: `templates/${name}`, shared: true });
    candidates.push({ file: path.join(__dirname, name), rel: name, shared: true });
    for (const c of candidates) {
        const resolved = path.resolve(c.file);
        if (!resolved.startsWith(__dirname)) continue;
        try {
            const content = await fs.readFile(resolved, 'utf8');
            return { ...c, content };
        } catch (e) {}
    }
    return null;
}

// List available templates (shared + scoped account folder)
adminRouter.get('/templates', async (req, res) => {
    res.json(await listTemplatesForScope(getAccountScope(req)));
});

// Get template content. Superadmin may pass ?accountId= to read an account's template.
adminRouter.get('/templates/:name', async (req, res) => {
    const name = req.params.name;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        return res.status(400).json({ error: 'Invalid template name' });
    }
    const found = await resolveTemplateRead(name, getAccountScope(req), req.query.accountId);
    if (!found) return res.status(404).json({ error: 'Template not found' });
    res.json({ name, path: found.rel, content: found.content, shared: !!found.shared, accountId: found.accountId || null });
});

// Create or update a template. Scoped users (admin AND user roles) write to their
// account folder; superadmin writes to the shared root (or ?accountId= folder).
adminRouter.put('/templates/:name', async (req, res) => {
    const name = req.params.name;
    if (!validTemplateName(name)) {
        return res.status(400).json({ error: 'Invalid template name' });
    }
    const { content } = req.body;
    if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Content is required' });
    }
    const scope = getAccountScope(req);
    let dir = TEMPLATES_DIR;
    let rel = `templates/${name}`;
    let accountCopy = false;
    if (scope !== null) {
        if (scope === NO_SCOPE) return res.status(403).json({ error: t.forbidden });
        dir = path.join(TEMPLATES_DIR, scope);
        rel = `templates/${scope}/${name}`;
        // Was this name a shared template? Then the save creates an account override
        try { await fs.access(path.join(TEMPLATES_DIR, name)); accountCopy = true; } catch (e) {}
    } else if (req.query.accountId && /^[a-zA-Z0-9_-]+$/.test(req.query.accountId)) {
        dir = path.join(TEMPLATES_DIR, req.query.accountId);
        rel = `templates/${req.query.accountId}/${name}`;
    }
    try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, name), content, 'utf8');
        res.json({ message: 'Template saved', path: rel, accountCopy });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save template' });
    }
});

// Delete a template. Scoped admins delete from their account folder; superadmin
// deletes shared (root) or ?accountId= folder templates.
adminRouter.delete('/templates/:name', requireRole('superadmin', 'admin'), async (req, res) => {
    const name = req.params.name;
    if (!validTemplateName(name)) {
        return res.status(400).json({ error: 'Invalid template name' });
    }
    const scope = getAccountScope(req);
    let filePath;
    if (scope !== null) {
        filePath = path.join(TEMPLATES_DIR, scope, name);
    } else if (req.query.accountId && /^[a-zA-Z0-9_-]+$/.test(req.query.accountId)) {
        filePath = path.join(TEMPLATES_DIR, req.query.accountId, name);
    } else {
        filePath = path.join(TEMPLATES_DIR, name);
    }
    try {
        await fs.unlink(filePath);
        res.json({ message: 'Template deleted' });
    } catch (e) {
        res.status(404).json({ error: 'Template not found' });
    }
});

// Change own password (any role)
adminRouter.put('/admin/reset-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: t.passwordRequired });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: t.passwordTooShort });
    }
    const userRec = (config.users || {})[req.user.username];
    if (!userRec) {
        return res.status(403).json({ error: t.forbidden });
    }
    const passwordMatch = await bcrypt.compare(currentPassword, userRec.passwordHash);
    if (!passwordMatch) {
        return res.status(403).json({ error: t.passwordIncorrect });
    }
    try {
        const hashedNew = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await writeConfigSafe(cfg => {
            if (cfg.users && cfg.users[req.user.username]) {
                cfg.users[req.user.username].passwordHash = hashedNew;
            }
        });
        res.json({ message: t.passwordUpdated });
    } catch (e) {
        log.error('Failed to update password', { error: e.message });
        res.status(500).json({ error: t.failedUpdatePassword });
    }
});

// Recent inbox entries (last N submissions across all forms)
// Forms this caller may see, narrowed further by the dashboard's account filter
// (?accountId=) and, where useful, by a single form (?formId=). The role scope always
// wins: the query params can only ever restrict, never widen.
function formsForRequest(req) {
    const forms = formsForScope(getAccountScope(req));
    const accountId = String(req.query.accountId || '').trim();
    const formId = String(req.query.formId || '').trim();
    const out = {};
    for (const [id, cfg] of Object.entries(forms)) {
        if (accountId && (cfg.accountId || 'default') !== accountId) continue;
        if (formId && id !== formId) continue;
        out[id] = cfg;
    }
    return out;
}

// Compact row for the live panel and the full inbox view
function inboxRow(formId, sub) {
    const skip = ['id', 'timestamp', 'ip', 'submitMethod', 'attachments'];
    const hidden = ['name', 'nombre', 'full_name', 'email', 'correo', 'e_mail', 'form_id',
        'website_id', 'cf-turnstile-response', 'h-captcha-response', 'g-recaptcha-response'];
    const fields = Object.entries(sub).filter(([k]) => !skip.includes(k));
    return {
        websiteId: formId,
        id: sub.id,
        timestamp: sub.timestamp,
        submitMethod: sub.submitMethod || 'html',
        name: sub.name || sub.nombre || sub.full_name || '',
        email: sub.email || sub.correo || sub.e_mail || '',
        attachments: (sub.attachments || []).length,
        preview: fields
            .filter(([k]) => !hidden.includes(k))
            .slice(0, 2)
            .map(([k, v]) => ({ label: fieldToLabel(k), value: String(v || '').substring(0, 100) }))
    };
}

// Full inbox across every form in view, newest first. Backs the "see all" modal, so it
// paginates over the merged list instead of taking the first N of each form the way
// /inbox/recent does.
adminRouter.get('/inbox/all', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const q = String(req.query.q || '').trim().toLowerCase();
    const all = [];
    for (const formId of Object.keys(formsForRequest(req))) {
        for (const sub of await loadSubmissions(formId)) all.push(inboxRow(formId, sub));
    }
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const filtered = q
        ? all.filter(r => (r.name + ' ' + r.email + ' ' + r.websiteId).toLowerCase().includes(q))
        : all;
    const start = (page - 1) * limit;
    res.json({
        entries: filtered.slice(start, start + limit),
        total: filtered.length,
        page,
        pages: Math.max(1, Math.ceil(filtered.length / limit))
    });
});

// One stored submission with every field, for the detail view opened from either inbox
adminRouter.get('/submissions/:websiteId/entry/:entryId', async (req, res) => {
    const { websiteId, entryId } = req.params;
    if (!canAccessForm(req, websiteId)) return res.status(404).json({ error: t.formNotFound });
    const subs = await loadSubmissions(websiteId);
    const found = subs.find(x => x.id === entryId);
    if (!found) return res.status(404).json({ error: t.entryNotFound });
    res.json({ websiteId, submission: found });
});

// Full outbox across every form in view, newest first
adminRouter.get('/outbox/all', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const status = String(req.query.status || '').trim();
    const all = [];
    for (const formId of Object.keys(formsForRequest(req))) {
        for (const entry of await loadOutboxEntries(formId)) all.push({ websiteId: formId, ...entry });
    }
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const filtered = status ? all.filter(e => (e.status || '') === status) : all;
    const start = (page - 1) * limit;
    res.json({
        entries: filtered.slice(start, start + limit),
        total: filtered.length,
        page,
        pages: Math.max(1, Math.ceil(filtered.length / limit)),
        counts: {
            ok: all.filter(e => e.status === 'ok').length,
            error: all.filter(e => e.status === 'error').length,
            skipped: all.filter(e => e.status === 'skipped').length
        }
    });
});

adminRouter.get('/inbox/recent', async (req, res) => {
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit) || 4));
    const all = [];
    for (const formId of Object.keys(formsForRequest(req))) {
        const subs = await loadSubmissions(formId);
        for (const sub of subs.slice(0, limit)) all.push(inboxRow(formId, sub));
    }
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(all.slice(0, limit));
});

// Outbox recent entries
adminRouter.get('/outbox/recent', async (req, res) => {
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit) || 4));
    const all = [];
    for (const formId of Object.keys(formsForRequest(req))) {
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
    if (!canAccessForm(req, websiteId)) return res.status(404).json({ error: 'Form not found' });
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

adminRouter.delete('/outbox/:websiteId/:entryId', requireRole('superadmin', 'admin'), async (req, res) => {
    const { websiteId, entryId } = req.params;
    if (!canAccessForm(req, websiteId)) return res.status(404).json({ error: t.formNotFound });
    const filePath = path.join(DATA_DIR, `outbox-${websiteId}.json`);
    try {
        let entries = await loadOutboxEntries(websiteId);
        const idx = entries.findIndex(e => e.id === entryId);
        if (idx === -1) return res.status(404).json({ error: t.entryNotFound });
        entries.splice(idx, 1);
        await fs.writeFile(filePath, JSON.stringify(entries, null, 2));
        res.json({ message: t.outboxEntryDeleted });
    } catch (e) {
        res.status(500).json({ error: t.failedDeleteOutbox });
    }
});

// SSE token management - temporary tokens instead of credentials in query string
const sseTokens = new Map(); // token -> { expires }
const SSE_TOKEN_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_SSE_CLIENTS = 20;

// Issue a short-lived SSE token (requires admin auth); carries the user's account scope
adminRouter.post('/inbox/token', (req, res) => {
    const token = require('crypto').randomBytes(32).toString('hex');
    sseTokens.set(token, { expires: Date.now() + SSE_TOKEN_TTL, scope: getAccountScope(req) });
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
    const client = { res, scope: tokenData.scope !== undefined ? tokenData.scope : null };
    sseClients.add(client);

    const keepalive = setInterval(() => res.write(': keepalive\n\n'), 30000);
    req.on('close', () => { clearInterval(keepalive); sseClients.delete(client); });
});

// Backup: export full config + templates (superadmin only).
// Secrets are exported encrypted: restore requires the same ENCRYPTION_KEY / data/.secret.key.
adminRouter.get('/backup', requireRole('superadmin'), async (req, res) => {
    try {
        const backup = {
            version: pkg.version,
            timestamp: new Date().toISOString(),
            encryption: { enabled: true, note: 'Secrets are encrypted; restore requires the same ENCRYPTION_KEY or data/.secret.key.' },
            recipients: config.recipients,
            senders: config.senders || {},
            captcha: config.captcha || {},
            accounts: config.accounts || {},
            users: config.users || {},
            api: config.api || {},
            statistics: config.statistics || {},
            smtp: config.smtp || {},
            templates: {}
        };
        // Include template files: shared root + per-account subfolders (key = relative path)
        try {
            const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });
            for (const f of entries) {
                if (f.isFile() && f.name.endsWith('.html')) {
                    backup.templates[f.name] = await fs.readFile(path.join(TEMPLATES_DIR, f.name), 'utf8');
                } else if (f.isDirectory()) {
                    try {
                        const sub = await fs.readdir(path.join(TEMPLATES_DIR, f.name));
                        for (const sf of sub) {
                            if (sf.endsWith('.html')) {
                                backup.templates[`${f.name}/${sf}`] = await fs.readFile(path.join(TEMPLATES_DIR, f.name, sf), 'utf8');
                            }
                        }
                    } catch (e) {}
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

// Restore: import config + templates (superadmin only)
adminRouter.post('/restore', requireRole('superadmin'), async (req, res) => {
    const backup = req.body;
    if (!backup || !backup.recipients) {
        return res.status(400).json({ error: 'Invalid backup file' });
    }
    try {
        await writeConfigSafe(cfg => {
            if (backup.recipients) cfg.recipients = backup.recipients;
            if (backup.senders) cfg.senders = backup.senders;
            if (backup.captcha) cfg.captcha = backup.captcha;
            if (backup.accounts) cfg.accounts = backup.accounts;
            if (backup.users && Object.keys(backup.users).length) cfg.users = backup.users;
            if (backup.api && backup.api.key) cfg.api = backup.api;
            if (backup.statistics) cfg.statistics = backup.statistics;
            if (backup.smtp) cfg.smtp = backup.smtp;
            // Heal pre-multitenant backups: stamp accountId on forms (senders stay global)
            if (!cfg.accounts || Object.keys(cfg.accounts).length === 0) {
                cfg.accounts = { default: { name: 'Default', api: { key: 'fp_' + nodeCrypto.randomBytes(24).toString('hex'), enabled: true } } };
            }
            for (const r of Object.values(cfg.recipients || {})) {
                if (!r.accountId) r.accountId = 'default';
            }
        });
        // Restore templates (supports "account/file.html" subfolder keys)
        if (backup.templates) {
            await fs.mkdir(TEMPLATES_DIR, { recursive: true }).catch(() => {});
            for (const [filename, content] of Object.entries(backup.templates)) {
                const norm = String(filename).replace(/\\/g, '/');
                if (norm.includes('..') || norm.split('/').length > 2 || !norm.endsWith('.html')) continue;
                const filePath = norm === 'email-template.html'
                    ? path.join(__dirname, norm)
                    : path.join(TEMPLATES_DIR, ...norm.split('/'));
                await fs.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {});
                await fs.writeFile(filePath, content);
            }
        }
        rebuildAllTransporters();
        // Probe: can the restored secrets be decrypted with this server's key?
        const warnings = [];
        const probe = Object.values(config.senders || {}).find(s => isEncrypted(s.pass) || isEncrypted(s.apiKey));
        if (probe) {
            const v = isEncrypted(probe.pass) ? probe.pass : probe.apiKey;
            if (decryptSecret(v) === null) {
                warnings.push('Encrypted secrets in this backup cannot be decrypted with the current encryption key. Re-enter sender passwords and tokens.');
            }
        }
        res.json({ message: 'Backup restored successfully', warnings });
    } catch (e) {
        res.status(500).json({ error: 'Restore failed: ' + e.message });
    }
});

// Agent API key management — scope-aware:
// superadmin operates on the master key (config.api, unrestricted access),
// account admins operate on their own account's key.
adminRouter.get('/apikey', requireRole('superadmin', 'admin'), (req, res) => {
    const scope = getAccountScope(req);
    if (scope === null) {
        return res.json({
            key: (config.api && config.api.key) || '',
            enabled: !!(config.api && config.api.key) && config.api.enabled !== false,
            scope: 'master'
        });
    }
    const api = ((config.accounts || {})[scope] || {}).api || {};
    res.json({ key: api.key || '', enabled: !!api.key && api.enabled !== false, scope });
});

adminRouter.post('/apikey/regenerate', requireRole('superadmin', 'admin'), async (req, res) => {
    const scope = getAccountScope(req);
    const key = 'fp_' + require('crypto').randomBytes(24).toString('hex');
    try {
        await writeConfigSafe(cfg => {
            if (scope === null) {
                if (!cfg.api) cfg.api = {};
                cfg.api.key = key;
            } else if (cfg.accounts && cfg.accounts[scope]) {
                if (!cfg.accounts[scope].api) cfg.accounts[scope].api = { enabled: true };
                cfg.accounts[scope].api.key = key;
            }
        });
        res.json({ key });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.put('/apikey', requireRole('superadmin', 'admin'), async (req, res) => {
    const scope = getAccountScope(req);
    const enabled = !!(req.body && req.body.enabled);
    try {
        await writeConfigSafe(cfg => {
            if (scope === null) {
                if (!cfg.api) cfg.api = {};
                cfg.api.enabled = enabled;
            } else if (cfg.accounts && cfg.accounts[scope]) {
                if (!cfg.accounts[scope].api) cfg.accounts[scope].api = {};
                cfg.accounts[scope].api.enabled = enabled;
            }
        });
        res.json({ enabled });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// ===== Accounts management (superadmin only) =====
const RESERVED_ACCOUNT_IDS = ['master', 'null', 'none'];

adminRouter.get('/accounts', requireRole('superadmin'), (req, res) => {
    const out = {};
    for (const [id, acct] of Object.entries(config.accounts || {})) {
        const formCount = Object.values(config.recipients || {}).filter(r => (r.accountId || 'default') === id).length;
        const senderCount = Object.values(config.senders || {}).filter(s => s.accountId === id).length;
        const userCount = Object.values(config.users || {}).filter(u => u.accountId === id).length;
        out[id] = {
            name: acct.name || id,
            api: { key: (acct.api && acct.api.key) || '', enabled: !!(acct.api && acct.api.key) && acct.api.enabled !== false },
            formCount,
            senderCount,
            userCount
        };
    }
    res.json(out);
});

adminRouter.post('/accounts', requireRole('superadmin'), async (req, res) => {
    const { id, name } = req.body || {};
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64 || RESERVED_ACCOUNT_IDS.includes(id.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid account ID' });
    }
    if ((config.accounts || {})[id]) {
        return res.status(409).json({ error: 'Account already exists' });
    }
    const key = 'fp_' + nodeCrypto.randomBytes(24).toString('hex');
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.accounts) cfg.accounts = {};
            cfg.accounts[id] = { name: String(name || id).substring(0, 120), api: { key, enabled: true } };
        });
        res.status(201).json({ message: 'Account created', id, apiKey: key });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.put('/accounts/:id', requireRole('superadmin'), async (req, res) => {
    const { id } = req.params;
    if (!(config.accounts || {})[id]) return res.status(404).json({ error: 'Account not found' });
    const { name } = req.body || {};
    try {
        await writeConfigSafe(cfg => {
            if (cfg.accounts && cfg.accounts[id] && name) {
                cfg.accounts[id].name = String(name).substring(0, 120);
            }
        });
        res.json({ message: 'Account updated' });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.delete('/accounts/:id', requireRole('superadmin'), async (req, res) => {
    const { id } = req.params;
    if (!(config.accounts || {})[id]) return res.status(404).json({ error: 'Account not found' });
    const hasForms = Object.values(config.recipients || {}).some(r => (r.accountId || 'default') === id);
    const hasSenders = Object.values(config.senders || {}).some(s => s.accountId === id);
    if (hasForms || hasSenders) {
        return res.status(409).json({ error: 'Account still has forms or senders. Delete or reassign them first.' });
    }
    try {
        await writeConfigSafe(cfg => {
            delete cfg.accounts[id];
            for (const [username, u] of Object.entries(cfg.users || {})) {
                if (u.accountId === id) delete cfg.users[username];
            }
        });
        fs.rm(path.join(TEMPLATES_DIR, id), { recursive: true, force: true }).catch(() => {});
        res.json({ message: 'Account deleted' });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.post('/accounts/:id/apikey/regenerate', requireRole('superadmin'), async (req, res) => {
    const { id } = req.params;
    if (!(config.accounts || {})[id]) return res.status(404).json({ error: 'Account not found' });
    const key = 'fp_' + nodeCrypto.randomBytes(24).toString('hex');
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.accounts[id].api) cfg.accounts[id].api = { enabled: true };
            cfg.accounts[id].api.key = key;
        });
        res.json({ key });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.put('/accounts/:id/api', requireRole('superadmin'), async (req, res) => {
    const { id } = req.params;
    if (!(config.accounts || {})[id]) return res.status(404).json({ error: 'Account not found' });
    const enabled = !!(req.body && req.body.enabled);
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.accounts[id].api) cfg.accounts[id].api = {};
            cfg.accounts[id].api.enabled = enabled;
        });
        res.json({ enabled });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// ===== Users management (superadmin only) =====
const VALID_ROLES = ['superadmin', 'admin', 'user'];

function countSuperadmins() {
    return Object.values(config.users || {}).filter(u => u.role === 'superadmin').length;
}

adminRouter.get('/users', requireRole('superadmin'), (req, res) => {
    const out = {};
    for (const [username, u] of Object.entries(config.users || {})) {
        out[username] = { role: u.role || 'user', accountId: u.accountId || null, name: u.name || '', email: u.email || '' };
    }
    res.json(out);
});

adminRouter.post('/users', requireRole('superadmin'), async (req, res) => {
    const { username, password, role, accountId, name, email } = req.body || {};
    if (!username || !/^[a-zA-Z0-9_.@-]+$/.test(username) || username.length > 64) {
        return res.status(400).json({ error: 'Invalid username' });
    }
    if ((config.users || {})[username]) {
        return res.status(409).json({ error: 'User already exists' });
    }
    if (!password || password.length < 8) {
        return res.status(400).json({ error: t.passwordTooShort });
    }
    // Email is the login identifier for Google and one-time-code sign-in
    const userEmail = String(email || '').trim();
    if (userEmail && !isValidEmail(userEmail)) {
        return res.status(400).json({ error: t.invalidEmail });
    }
    if (userEmail && userEmailTaken(userEmail, username)) {
        return res.status(409).json({ error: 'That email is already used by another user' });
    }
    if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }
    if (role !== 'superadmin' && !(config.accounts || {})[accountId]) {
        return res.status(400).json({ error: 'A valid accountId is required for admin/user roles' });
    }
    try {
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await writeConfigSafe(cfg => {
            if (!cfg.users) cfg.users = {};
            cfg.users[username] = {
                passwordHash,
                role,
                accountId: role === 'superadmin' ? null : accountId,
                name: String(name || '').substring(0, 120),
                email: userEmail
            };
        });
        res.status(201).json({ message: 'User created' });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.put('/users/:username', requireRole('superadmin'), async (req, res) => {
    const { username } = req.params;
    const existing = (config.users || {})[username];
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const { password, role, accountId, name, email } = req.body || {};
    if (role !== undefined && !VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }
    if (email !== undefined) {
        const userEmail = String(email || '').trim();
        if (userEmail && !isValidEmail(userEmail)) {
            return res.status(400).json({ error: t.invalidEmail });
        }
        if (userEmail && userEmailTaken(userEmail, username)) {
            return res.status(409).json({ error: 'That email is already used by another user' });
        }
    }
    const newRole = role !== undefined ? role : existing.role;
    // Never demote the last superadmin
    if (existing.role === 'superadmin' && newRole !== 'superadmin' && countSuperadmins() <= 1) {
        return res.status(409).json({ error: 'Cannot demote the last superadmin' });
    }
    if (newRole !== 'superadmin') {
        const newAccount = accountId !== undefined ? accountId : existing.accountId;
        if (!(config.accounts || {})[newAccount]) {
            return res.status(400).json({ error: 'A valid accountId is required for admin/user roles' });
        }
    }
    if (password !== undefined && (!password || password.length < 8)) {
        return res.status(400).json({ error: t.passwordTooShort });
    }
    try {
        const passwordHash = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : null;
        await writeConfigSafe(cfg => {
            const u = cfg.users[username];
            if (!u) return;
            if (passwordHash) u.passwordHash = passwordHash;
            if (role !== undefined) u.role = role;
            u.accountId = (role !== undefined ? role : u.role) === 'superadmin' ? null : (accountId !== undefined ? accountId : u.accountId);
            if (name !== undefined) u.name = String(name || '').substring(0, 120);
            if (email !== undefined) u.email = String(email || '').trim();
        });
        res.json({ message: 'User updated' });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

adminRouter.delete('/users/:username', requireRole('superadmin'), async (req, res) => {
    const { username } = req.params;
    const existing = (config.users || {})[username];
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (username === req.user.username) {
        return res.status(409).json({ error: 'Cannot delete your own user' });
    }
    if (existing.role === 'superadmin' && countSuperadmins() <= 1) {
        return res.status(409).json({ error: 'Cannot delete the last superadmin' });
    }
    try {
        await writeConfigSafe(cfg => {
            delete cfg.users[username];
        });
        res.json({ message: 'User deleted' });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// ===================== Public login endpoints (/admin/api/auth) =====================
// Mounted BEFORE the admin router so they are reachable without a session.

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

const otpRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many codes requested. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const authRouter = express.Router();

// What the login screen should offer (public, no secrets: the Google client id
// is meant to travel to the browser).
authRouter.get('/config', (req, res) => {
    res.json({
        googleClientId: googleClientId(),
        googleEnabled: !!googleClientId(),
        otpEnabled: Object.values(config.senders || {}).some(s => s.active !== false),
        lang: LANG
    });
});

// Email (or legacy username) + password
authRouter.post('/password', loginLimiter, async (req, res) => {
    const { email, password } = req.body || {};
    const identifier = String(email || '').trim();
    if (!identifier || !password) return res.status(400).json({ error: t.loginInvalid });
    const found = findLoginUser(identifier);
    if (found && found[1].passwordHash && await bcrypt.compare(String(password), found[1].passwordHash)) {
        return sessionResponse(res, found[0], found[1], 'password');
    }
    // Pre-migration fallback (legacy single-admin config)
    if (config.admin && identifier === config.admin.username && config.admin.password
        && await bcrypt.compare(String(password), config.admin.password)) {
        return sessionResponse(res, identifier, { role: 'superadmin', accountId: null }, 'password');
    }
    log.warn('Login failed', { identifier, method: 'password', ip: req.ip });
    res.status(401).json({ error: t.loginInvalid });
});

// Ask for a one-time code. Always answers 202 so the endpoint never reveals
// which emails exist.
authRouter.post('/otp/request', otpRequestLimiter, async (req, res) => {
    const email = normalizeEmail((req.body || {}).email);
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: t.loginEmailRequired });
    const found = findUserByEmail(email);
    if (!found) {
        log.warn('One-time code requested for unknown email', { email, ip: req.ip });
        return res.status(202).json({ ok: true });
    }
    if (!otpRequestAllowed(email)) return res.status(429).json({ error: t.otpTooMany });
    const code = String(nodeCrypto.randomInt(0, 1000000)).padStart(6, '0');
    loginCodes.set(email, { codeHash: hashLoginCode(code), expires: Date.now() + OTP_TTL_MS, attempts: 0 });
    try {
        await sendLoginCodeEmail(found[1], found[1].email || email, code);
    } catch (e) {
        loginCodes.delete(email);
        if (e.message === 'no-sender') {
            log.error('Cannot send one-time code: no active sender', { email });
            return res.status(503).json({ error: t.otpNoSender });
        }
        log.error('Failed to send one-time code', { email, error: e.message });
        return res.status(502).json({ error: t.otpSendFailed });
    }
    log.info('One-time code sent', { username: found[0] });
    res.status(202).json({ ok: true });
});

// Verify the one-time code: single use, 10 minutes, 3 attempts.
authRouter.post('/otp/verify', loginLimiter, (req, res) => {
    const { email, code } = req.body || {};
    const normalized = normalizeEmail(email);
    if (!normalized || !code) return res.status(400).json({ error: t.loginCodeRequired });
    const entry = loginCodes.get(normalized);
    const found = findUserByEmail(normalized);
    if (!entry || !found) return res.status(401).json({ error: t.otpInvalid });
    if (entry.expires < Date.now()) {
        loginCodes.delete(normalized);
        return res.status(401).json({ error: t.otpExpired });
    }
    if (entry.attempts >= OTP_MAX_ATTEMPTS) {
        loginCodes.delete(normalized);
        return res.status(429).json({ error: t.otpTooManyAttempts });
    }
    const given = hashLoginCode(String(code).trim());
    if (given !== entry.codeHash) {
        entry.attempts++;
        log.warn('Invalid one-time code', { email: normalized, attempts: entry.attempts, ip: req.ip });
        return res.status(401).json({ error: t.otpInvalid });
    }
    loginCodes.delete(normalized);
    sessionResponse(res, found[0], found[1], 'otp');
});

// Google sign-in. The user must already exist: no self-registration.
authRouter.post('/google', loginLimiter, async (req, res) => {
    const credential = (req.body || {}).credential;
    if (!credential) return res.status(400).json({ error: t.googleInvalidToken });
    let profile;
    try {
        profile = await verifyGoogleIdToken(credential);
    } catch (e) {
        const status = e.code === 'disabled' ? 503 : 401;
        return res.status(status).json({ error: e.message });
    }
    const found = findUserByEmail(profile.email);
    if (!found) {
        log.warn('Google sign-in for unknown email', { email: profile.email, ip: req.ip });
        return res.status(403).json({ error: t.googleUserNotFound });
    }
    sessionResponse(res, found[0], found[1], 'google');
});

app.use('/admin/api/auth', authRouter);

app.use('/admin/api', adminRouter);

// ===================== Agent API (/api/v1) =====================
// Programmatic REST API designed for AI agents and automation tools.
// Auth: X-API-Key header (or Authorization: Bearer <key>).
// GET /api/v1 returns a machine-readable description of the whole API.

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    message: { error: 'Too many API requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// API key auth. The master key (config.api) has unrestricted access (scope null);
// each account key is strictly scoped to that account's data (req.apiScope = accountId).
function apiAuth(req, res, next) {
    let provided = req.headers['x-api-key'] || '';
    const authHeader = req.headers['authorization'] || '';
    if (!provided && authHeader.startsWith('Bearer ')) provided = authHeader.slice(7).trim();
    if (!provided) {
        return res.status(401).json({ error: 'Missing API key. Send it in the X-API-Key header (or Authorization: Bearer <key>).' });
    }
    const candidates = [];
    if (config.api && config.api.key && config.api.enabled !== false) {
        candidates.push({ key: config.api.key, scope: null });
    }
    for (const [id, acct] of Object.entries(config.accounts || {})) {
        if (acct.api && acct.api.key && acct.api.enabled !== false) {
            candidates.push({ key: acct.api.key, scope: id });
        }
    }
    if (!candidates.length) {
        return res.status(503).json({ error: 'Agent API is disabled. Enable it from the admin UI.' });
    }
    const a = nodeCrypto.createHash('sha256').update(String(provided)).digest();
    let matched = null;
    for (const c of candidates) {
        const b = nodeCrypto.createHash('sha256').update(String(c.key)).digest();
        if (nodeCrypto.timingSafeEqual(a, b) && !matched) matched = c;
    }
    if (!matched) {
        return res.status(401).json({ error: 'Invalid API key.' });
    }
    req.apiScope = matched.scope;
    next();
}

function apiBaseUrl(req) {
    return `${req.protocol}://${req.get('host')}`;
}

// Whitelisted form config fields accepted from the Agent API
const FORM_CONFIG_FIELDS = [
    'to', 'subjectPrefix', 'senderId', 'senderAlias', 'templatePath',
    'autoReplyEnabled', 'autoReplyTemplate', 'autoReplySubject', 'autoReplyReplyTo',
    'discordWebhook', 'telegramBotToken', 'telegramChatId', 'webhookUrl',
    'captchaEnabled', 'captchaProvider', 'allowedDomains', 'redirectUrl'
];

function validateFormConfig(body, isCreate, scope, targetAccountId) {
    const cfg = {};
    const errors = [];
    const warnings = [];
    for (const f of FORM_CONFIG_FIELDS) {
        if (body[f] !== undefined) cfg[f] = body[f];
    }
    // Preserve stored secrets when a masked/encrypted echo comes back
    stripSecretEchoes(cfg);
    if (isCreate && cfg.to === undefined) {
        errors.push('"to" is required: destination email address(es), comma-separated.');
    }
    if (cfg.to !== undefined) {
        const emails = String(cfg.to).split(',').map(s => s.trim()).filter(Boolean);
        if (!emails.length || !emails.every(isValidEmail)) {
            errors.push('"to" must be one or more valid email addresses, comma-separated.');
        }
    }
    if (cfg.templatePath !== undefined) {
        const resolved = path.resolve(__dirname, String(cfg.templatePath));
        if (!resolved.startsWith(__dirname)) {
            errors.push('"templatePath" must be a relative path inside formPost (e.g. "templates/contact-form.html").');
        } else if (scope && !templatePathAllowed(cfg.templatePath, scope)) {
            errors.push(`"templatePath" must be a shared template ("templates/x.html") or one of your account ("templates/${scope}/x.html").`);
        }
    }
    if (cfg.allowedDomains !== undefined && !Array.isArray(cfg.allowedDomains)) {
        errors.push('"allowedDomains" must be an array of origins, e.g. ["https://example.com"].');
    }
    if (cfg.captchaProvider !== undefined && !['turnstile', 'hcaptcha'].includes(cfg.captchaProvider)) {
        errors.push('"captchaProvider" must be "turnstile" or "hcaptcha".');
    }
    if (cfg.senderId !== undefined) {
        const senderRef = (config.senders || {})[cfg.senderId];
        if (!senderRef) {
            warnings.push(`senderId "${cfg.senderId}" does not exist yet; email will fall back to the first configured sender. Create it via POST /api/v1/senders.`);
        } else if (targetAccountId && !senderUsableByAccount(senderRef, targetAccountId)) {
            errors.push(`senderId "${cfg.senderId}" belongs to another account.`);
        }
    }
    return { cfg, errors, warnings };
}

const SENDER_CONFIG_FIELDS = ['name', 'type', 'host', 'port', 'secure', 'from', 'user', 'pass', 'apiKey', 'domain', 'active', 'backupSenderId'];

// `ownerAccountId` is the account the sender will belong to after this write
// (null = global). It decides which backups are legal; pass it explicitly because
// accountId is assigned by the caller from the API key scope, not from the body.
function validateSenderConfig(body, existing, selfId, ownerAccountId) {
    const cfg = {};
    const errors = [];
    for (const f of SENDER_CONFIG_FIELDS) {
        if (body[f] !== undefined) cfg[f] = body[f];
    }
    const merged = { ...(existing || {}), ...cfg };
    const type = merged.type || 'smtp';
    if (!['smtp', 'sendgrid'].includes(type)) {
        errors.push('"type" must be "smtp" or "sendgrid".');
        return { cfg, errors };
    }
    if (!merged.from || !isValidEmail(merged.from)) {
        errors.push('"from" must be a valid email address.');
    }
    if (type === 'sendgrid') {
        if (!merged.apiKey) errors.push('"apiKey" is required for SendGrid senders.');
        if (merged.domain && merged.from) {
            const fromLower = String(merged.from).toLowerCase();
            const domLower = String(merged.domain).toLowerCase();
            if (!fromLower.endsWith('@' + domLower) && !fromLower.endsWith('.' + domLower)) {
                errors.push(`"from" must belong to the SendGrid sending domain "${merged.domain}".`);
            }
        }
    } else {
        if (!merged.host) errors.push('"host" is required for SMTP senders.');
        if (!merged.port) errors.push('"port" is required for SMTP senders.');
        // Keep `secure` consistent with the port instead of letting a caller save
        // a combination that can only produce a TLS handshake error.
        if (cfg.port !== undefined || cfg.secure !== undefined) {
            const probe = { type: 'smtp', port: merged.port, secure: merged.secure };
            normalizeSenderTls(probe);
            if (probe.secure !== !!merged.secure) cfg.secure = probe.secure;
        }
    }
    if (cfg.backupSenderId === '' || cfg.backupSenderId === null) {
        cfg.backupSenderId = '';
    } else if (cfg.backupSenderId !== undefined) {
        const ownerAccount = ownerAccountId !== undefined ? ownerAccountId : (merged.accountId || null);
        const backupError = validateBackupSenderId(cfg.backupSenderId, selfId, ownerAccount);
        if (backupError) errors.push(backupError);
    }
    return { cfg, errors };
}

function sanitizeSenderForApi(id, cfg) {
    return {
        id,
        name: cfg.name || id,
        type: cfg.type || 'smtp',
        host: cfg.host || '',
        port: cfg.port || '',
        secure: !!cfg.secure,
        from: cfg.from || '',
        user: cfg.user || '',
        domain: cfg.domain || '',
        active: cfg.active !== false,
        accountId: cfg.accountId || null,
        global: !cfg.accountId,
        backupSenderId: cfg.backupSenderId || '',
        health: senderHealthForApi(id),
        hasPassword: !!cfg.pass,
        hasApiKey: !!cfg.apiKey
    };
}

function exampleFormHtml(req, formId) {
    return [
        `<form action="${apiBaseUrl(req)}/submit" method="POST">`,
        `    <input type="hidden" name="form_id" value="${formId}">`,
        `    <input type="text" name="name" placeholder="Name" required>`,
        `    <input type="email" name="email" placeholder="Email" required>`,
        `    <textarea name="message" placeholder="Message"></textarea>`,
        `    <!-- Honeypot anti-bot field: keep hidden and empty -->`,
        `    <input type="text" name="_hp_field" style="display:none" tabindex="-1" autocomplete="off">`,
        `    <button type="submit">Send</button>`,
        `</form>`
    ].join('\n');
}

function buildApiSpec(req) {
    const base = apiBaseUrl(req);
    return {
        name: 'formPost Agent API',
        version: pkg.version,
        description: 'REST API for AI agents to configure formPost: create forms, configure email senders (SMTP/SendGrid), manage templates and read submissions. End users submit forms via POST ' + base + '/submit (no auth).',
        authentication: {
            type: 'apiKey',
            header: 'X-API-Key',
            alternative: 'Authorization: Bearer <key>',
            howToGetKey: 'Ask the formPost administrator. The key is shown in the admin UI under Settings > Agent API.',
            scoping: 'Keys are per-account: an account key only sees and manages that account\'s forms, senders and templates (plus shared/global ones, read-only). The master key has unrestricted access.'
        },
        quickstart: [
            '1. GET /api/v1/accounts to check whether the account for this integration already exists. If it does not, create it with POST /api/v1/accounts (master key only); an account key is already bound to its own account.',
            '2. GET /api/v1/senders to check an email sender exists (or create one with POST /api/v1/senders).',
            '3. POST /api/v1/forms with at least {"id": "my-form", "to": "owner@example.com"} to create a form.',
            '4. The response includes exampleHtml — paste it into the website. Submissions POST to /submit with a form_id field.',
            '5. GET /api/v1/forms/my-form/submissions to read received submissions, GET .../outbox to verify emails were delivered.'
        ],
        endpoints: [
            { method: 'GET', path: '/api/v1', auth: false, description: 'This API specification.' },
            { method: 'GET', path: '/api/v1/status', auth: true, description: 'Server status: version, forms, senders.' },
            { method: 'GET', path: '/api/v1/accounts', auth: true, description: 'List accounts visible to this key, with their forms and senders. An account key only sees its own account.' },
            { method: 'POST', path: '/api/v1/accounts', auth: true, description: 'Create an account (master key only). Body: { id, name }. Returns the new account-scoped apiKey once.', requiredFields: ['id'] },
            { method: 'GET', path: '/api/v1/forms', auth: true, description: 'List all forms with their full configuration.' },
            { method: 'POST', path: '/api/v1/forms', auth: true, description: 'Create a form. Body: { id, ...formConfig }. Returns the form, submitUrl and a ready-to-paste exampleHtml.', requiredFields: ['id', 'to'] },
            { method: 'GET', path: '/api/v1/forms/:id', auth: true, description: 'Get one form configuration.' },
            { method: 'PUT', path: '/api/v1/forms/:id', auth: true, description: 'Update a form. Body: partial formConfig (merged over existing).' },
            { method: 'DELETE', path: '/api/v1/forms/:id', auth: true, description: 'Delete a form.' },
            { method: 'GET', path: '/api/v1/forms/:id/submissions?page=1&limit=50', auth: true, description: 'Read received submissions (newest first). Each submission may include an "attachments" array of stored files.' },
            { method: 'GET', path: '/api/v1/forms/:id/submissions/:entryId/attachments/:filename', auth: true, description: 'Download a stored submission attachment.' },
            { method: 'GET', path: '/api/v1/forms/:id/outbox?page=1&limit=20', auth: true, description: 'Delivery log: emails and notifications sent for this form, with ok/error status.' },
            { method: 'GET', path: '/api/v1/senders', auth: true, description: 'List email senders (secrets masked). Each entry includes "backupSenderId" and a live "health" object: state up | degraded | down | recovering | unknown.' },
            { method: 'POST', path: '/api/v1/senders', auth: true, description: 'Create a sender. Body: { id, ...senderConfig }.', requiredFields: ['id', 'from'] },
            { method: 'PUT', path: '/api/v1/senders/:id', auth: true, description: 'Update a sender. Omit "pass"/"apiKey" to keep the stored secret.' },
            { method: 'DELETE', path: '/api/v1/senders/:id', auth: true, description: 'Delete a sender.' },
            { method: 'POST', path: '/api/v1/senders/:id/test', auth: true, description: 'Verify connection and send a test email. Body: { to } (optional, defaults to the sender "from").' },
            { method: 'GET', path: '/api/v1/templates', auth: true, description: 'List email templates.' },
            { method: 'GET', path: '/api/v1/templates/:name', auth: true, description: 'Get template HTML content.' },
            { method: 'PUT', path: '/api/v1/templates/:name', auth: true, description: 'Create or update a template. Body: { content }. Use {{fields}} placeholder for the auto-generated submission fields list and {{form_id}} for the form id. Name must end in .html.' }
        ],
        formConfig: {
            id: 'string, required on create. Letters, numbers, hyphens, underscores. This is the form_id used in form submissions.',
            to: 'string, required on create. Destination email(s), comma-separated.',
            subjectPrefix: 'string. Email subject prefix. Default: "[<id>]".',
            senderId: 'string. Which sender to use (see /api/v1/senders). Default: "default" or first available.',
            senderAlias: 'string. Fixed From display name; defaults to the submitter name.',
            templatePath: 'string. Email template path, e.g. "templates/contact-form.html" (default).',
            autoReplyEnabled: 'boolean. Send a confirmation email to the submitter (uses the "email" field). Default false.',
            autoReplyTemplate: 'string. Template path for the auto-reply. Default "templates/auto-reply.html".',
            autoReplySubject: 'string. Subject of the auto-reply.',
            autoReplyReplyTo: 'string. Reply-To for the auto-reply.',
            discordWebhook: 'string. Discord webhook URL for notifications.',
            telegramBotToken: 'string. Telegram bot token for notifications.',
            telegramChatId: 'string. Telegram chat id for notifications.',
            webhookUrl: 'string. Generic webhook: receives POST JSON { formId, timestamp, fields } per submission.',
            captchaEnabled: 'boolean. Verify Cloudflare Turnstile / hCaptcha tokens. Default false.',
            captchaProvider: '"turnstile" | "hcaptcha". Default "turnstile".',
            captchaSecretKey: 'string, write-only. Captcha secret key for verification.',
            allowedDomains: 'string[]. Origins allowed to submit, e.g. ["https://example.com"]. Empty = any origin.',
            redirectUrl: 'string. Redirect after a classic HTML POST. Omit it for fetch()/AJAX clients, which receive JSON { success: true }.'
        },
        senderConfig: {
            id: 'string, required on create.',
            type: '"smtp" (default) | "sendgrid".',
            name: 'string. Display name.',
            from: 'string, required. Sender email address. For SendGrid it must belong to a verified sending domain.',
            active: 'boolean. Default true.',
            host: 'string. SMTP only: server host.',
            port: 'number. SMTP only: 587 (STARTTLS) or 465 (implicit TLS).',
            secure: 'boolean. SMTP only: true for 465, false for 587/2525/25. Derived from the port automatically — a mismatched value is corrected on save.',
            backupSenderId: 'string, optional. Sender to fall back to when this one fails for connectivity, TLS, credential or throttling reasons (never for a rejected recipient or refused message). A global sender may only point to another global sender; an account sender may point to a global one or to another sender of the same account. Send "" to clear it.',
            user: 'string. SMTP only: auth username.',
            pass: 'string. SMTP only: auth password (write-only, never returned).',
            apiKey: 'string. SendGrid only: API key with Mail Send permission (write-only, never returned).',
            domain: 'string. SendGrid only: verified sending domain, e.g. "example.com". Used to validate "from".'
        },
        accountConfig: {
            id: 'string, required on create. Letters, numbers, hyphens, underscores. Identifies the tenant that owns forms, senders and templates.',
            name: 'string. Display name. Defaults to the id.'
        },
        submitEndpoint: {
            method: 'POST',
            url: base + '/submit',
            auth: false,
            contentTypes: ['application/x-www-form-urlencoded', 'multipart/form-data'],
            requiredFields: { form_id: 'the form id' },
            notes: [
                'Any other fields are free-form (max 30 fields, 5000 chars each) and are emailed/stored dynamically.',
                'Fields named "name"/"nombre" and "email"/"correo" are used for the submitter identity and auto-reply.',
                'Include a hidden, empty "_hp_field" input as honeypot bot protection.',
                'File uploads: up to 5 files, 10 MB each, in an "attachments" field (multipart).',
                'Rate limits: 5 submissions/minute per IP, 100/minute per form.'
            ]
        }
    };
}

const apiRouter = express.Router();
apiRouter.use(apiLimiter);

// Public, machine-readable API spec (no auth — contains no secrets)
apiRouter.get('/', (req, res) => {
    res.json(buildApiSpec(req));
});

apiRouter.use(apiAuth);

// Form visible to the current API key?
function apiCanAccessForm(req, formId) {
    const r = (config.recipients || {})[formId];
    return !!r && formInScope(req.apiScope, r);
}

apiRouter.get('/status', (req, res) => {
    res.json({
        status: 'ok',
        version: pkg.version,
        scope: req.apiScope || 'master',
        forms: Object.keys(formsForScope(req.apiScope)),
        senders: Object.keys(sendersForScope(req.apiScope)),
        submitUrl: apiBaseUrl(req) + '/submit'
    });
});

// ---- Accounts ----
// An account is a tenant: it owns its forms, senders, templates and API key.
// An account key only ever sees its own account; only the master key can create accounts.
function accountSummary(id, acct) {
    return {
        id,
        name: acct.name || id,
        apiEnabled: !!(acct.api && acct.api.key) && acct.api.enabled !== false,
        forms: Object.entries(config.recipients || {})
            .filter(([, r]) => (r.accountId || 'default') === id).map(([fid]) => fid),
        senders: Object.entries(config.senders || {})
            .filter(([, s]) => s.accountId === id).map(([sid]) => sid)
    };
}

apiRouter.get('/accounts', (req, res) => {
    const accounts = Object.entries(config.accounts || {})
        .filter(([id]) => !req.apiScope || req.apiScope === id)
        .map(([id, acct]) => accountSummary(id, acct));
    res.json({
        accounts,
        scope: req.apiScope || 'master',
        canCreateAccounts: req.apiScope === null,
        hint: req.apiScope
            ? `Your API key belongs to account "${req.apiScope}"; everything you create lands there. Only the master key can create new accounts.`
            : 'Check here whether the account for this integration already exists. If it does not, create it with POST /api/v1/accounts.'
    });
});

apiRouter.post('/accounts', async (req, res) => {
    if (req.apiScope !== null) {
        return res.status(403).json({
            error: `Your API key is scoped to account "${req.apiScope}" and cannot create accounts. Use that account (GET /api/v1/accounts), or ask the administrator for the master key.`
        });
    }
    const body = req.body || {};
    const id = body.id;
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64 || RESERVED_ACCOUNT_IDS.includes(id.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid "id": use only letters, numbers, hyphens and underscores (max 64 chars) and avoid the reserved words master/null/none.' });
    }
    if ((config.accounts || {})[id]) {
        return res.status(409).json({ error: `Account "${id}" already exists. Use it as-is (GET /api/v1/accounts); do not create it again.` });
    }
    const key = 'fp_' + nodeCrypto.randomBytes(24).toString('hex');
    try {
        await writeConfigSafe(cfg => {
            if (!cfg.accounts) cfg.accounts = {};
            cfg.accounts[id] = { name: String(body.name || id).substring(0, 120), api: { key, enabled: true } };
        });
        log.info('Account created via Agent API', { accountId: id });
        res.status(201).json({
            message: `Account "${id}" created.`,
            account: accountSummary(id, config.accounts[id]),
            apiKey: key,
            hint: `Store this key: it is the account-scoped API key for "${id}" and is only returned once. With the master key, create this account's forms and senders by sending "accountId": "${id}" in the body.`
        });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

// ---- Forms ----
apiRouter.get('/forms', (req, res) => {
    const forms = {};
    for (const [id, cfg] of Object.entries(formsForScope(req.apiScope))) {
        forms[id] = sanitizeRecipientForApi(id, cfg);
    }
    res.json({ forms, submitUrl: apiBaseUrl(req) + '/submit' });
});

apiRouter.get('/forms/:id', (req, res) => {
    if (!apiCanAccessForm(req, req.params.id)) return res.status(404).json({ error: t.formNotFound });
    res.json({ id: req.params.id, ...sanitizeRecipientForApi(req.params.id, config.recipients[req.params.id]) });
});

apiRouter.post('/forms', async (req, res) => {
    const body = req.body || {};
    const id = body.id;
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
        return res.status(400).json({ error: 'Invalid "id": use only letters, numbers, hyphens and underscores (max 64 chars).' });
    }
    if (config.recipients[id]) {
        return res.status(409).json({ error: `Form "${id}" already exists. Use PUT /api/v1/forms/${id} to update it.` });
    }
    // Account keys create forms in their own account; the master key may pass accountId
    const accountId = req.apiScope || body.accountId || 'default';
    if (!(config.accounts || {})[accountId]) {
        return res.status(400).json({ error: 'Unknown account: ' + accountId });
    }
    const { cfg, errors, warnings } = validateFormConfig(body, true, req.apiScope, accountId);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    cfg.accountId = accountId;
    // Sensible defaults for agent-created forms
    if (cfg.subjectPrefix === undefined) cfg.subjectPrefix = `[${id}]`;
    if (cfg.templatePath === undefined) cfg.templatePath = 'templates/contact-form.html';
    if (cfg.captchaEnabled === undefined) cfg.captchaEnabled = false;
    if (cfg.allowedDomains === undefined) cfg.allowedDomains = [];
    try {
        await writeConfigSafe(c => {
            c.recipients[id] = cfg;
            if (body.captchaSecretKey) {
                if (!c.captcha) c.captcha = {};
                c.captcha[id] = { secretKey: body.captchaSecretKey };
            }
        });
        log.info('Form created via Agent API', { formId: id, accountId });
        res.status(201).json({
            message: `Form "${id}" created.`,
            form: { id, ...sanitizeRecipientForApi(id, config.recipients[id]) },
            submitUrl: apiBaseUrl(req) + '/submit',
            usage: 'POST form fields (urlencoded or multipart) to submitUrl, including a "form_id" field with this form id.',
            exampleHtml: exampleFormHtml(req, id),
            warnings
        });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

apiRouter.put('/forms/:id', async (req, res) => {
    const { id } = req.params;
    if (!apiCanAccessForm(req, id)) return res.status(404).json({ error: t.formNotFound });
    const body = req.body || {};
    const formAccount = config.recipients[id].accountId || 'default';
    const { cfg, errors, warnings } = validateFormConfig(body, false, req.apiScope, formAccount);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    try {
        await writeConfigSafe(c => {
            c.recipients[id] = { ...c.recipients[id], ...cfg };
            if (body.captchaSecretKey) {
                if (!c.captcha) c.captcha = {};
                c.captcha[id] = { secretKey: body.captchaSecretKey };
            }
        });
        log.info('Form updated via Agent API', { formId: id });
        res.json({ message: t.formUpdated, form: { id, ...sanitizeRecipientForApi(id, config.recipients[id]) }, warnings });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

apiRouter.delete('/forms/:id', async (req, res) => {
    const { id } = req.params;
    if (!apiCanAccessForm(req, id)) return res.status(404).json({ error: t.formNotFound });
    try {
        await writeConfigSafe(c => {
            delete c.recipients[id];
            if (c.captcha && c.captcha[id]) delete c.captcha[id];
            if (c.turnstile && c.turnstile[id]) delete c.turnstile[id];
        });
        deleteFormAttachments(id).catch(() => {});
        log.info('Form deleted via Agent API', { formId: id });
        res.json({ message: t.formRemoved });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

apiRouter.get('/forms/:id/submissions', async (req, res) => {
    const { id } = req.params;
    if (!apiCanAccessForm(req, id)) return res.status(404).json({ error: t.formNotFound });
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const submissions = await loadSubmissions(id);
    const start = (page - 1) * limit;
    res.json({
        submissions: submissions.slice(start, start + limit),
        total: submissions.length,
        page,
        limit,
        totalPages: Math.ceil(submissions.length / limit)
    });
});

// Download a stored attachment
apiRouter.get('/forms/:id/submissions/:entryId/attachments/:filename', async (req, res) => {
    const { id, entryId, filename } = req.params;
    if (!apiCanAccessForm(req, id)) return res.status(404).json({ error: t.formNotFound });
    const att = await resolveAttachment(id, entryId, filename);
    if (!att) return res.status(404).json({ error: t.entryNotFound });
    res.download(att.path, att.filename, err => {
        if (err && !res.headersSent) res.status(404).json({ error: t.entryNotFound });
    });
});

apiRouter.get('/forms/:id/outbox', async (req, res) => {
    const { id } = req.params;
    if (!apiCanAccessForm(req, id)) return res.status(404).json({ error: t.formNotFound });
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const entries = await loadOutboxEntries(id);
    const start = (page - 1) * limit;
    res.json({
        entries: entries.slice(start, start + limit),
        total: entries.length,
        page,
        limit,
        totalPages: Math.ceil(entries.length / limit)
    });
});

// ---- Senders ----
// Sender visible to this key? (global senders are visible to every scope)
function apiCanAccessSender(req, senderId) {
    const s = (config.senders || {})[senderId];
    return !!s && senderInScope(req.apiScope, s);
}
// Sender writable by this key? (account keys may only modify their own account's senders)
function apiCanManageSender(req, senderId) {
    const s = (config.senders || {})[senderId];
    return !!s && (req.apiScope === null || s.accountId === req.apiScope);
}

apiRouter.get('/senders', (req, res) => {
    const senders = Object.entries(sendersForScope(req.apiScope)).map(([id, cfg]) => sanitizeSenderForApi(id, cfg));
    res.json({ senders });
});

apiRouter.post('/senders', async (req, res) => {
    const body = req.body || {};
    const id = body.id;
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
        return res.status(400).json({ error: 'Invalid "id": use only letters, numbers, hyphens and underscores (max 64 chars).' });
    }
    if (config.senders && config.senders[id]) {
        return res.status(409).json({ error: `Sender "${id}" already exists. Use PUT /api/v1/senders/${id} to update it.` });
    }
    // Account keys create senders in their own account; master key may pass accountId (or omit = global).
    // Resolve the owner first: it decides which backup senders are legal.
    let ownerAccountId = null;
    if (req.apiScope) {
        ownerAccountId = req.apiScope;
    } else if (body.accountId) {
        if (!(config.accounts || {})[body.accountId]) {
            return res.status(400).json({ error: 'Unknown account: ' + body.accountId });
        }
        ownerAccountId = body.accountId;
    }
    const { cfg, errors } = validateSenderConfig(body, null, id, ownerAccountId);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    if (cfg.type === undefined) cfg.type = 'smtp';
    if (cfg.backupSenderId === '') delete cfg.backupSenderId;
    if (ownerAccountId) cfg.accountId = ownerAccountId;
    try {
        await writeConfigSafe(c => {
            if (!c.senders) c.senders = {};
            c.senders[id] = cfg;
            pruneInvalidBackupRefs(c);
        });
        rebuildAllTransporters();
        log.info('Sender created via Agent API', { senderId: id, type: cfg.type, accountId: cfg.accountId || 'global' });
        res.status(201).json({
            message: `Sender "${id}" created.`,
            sender: sanitizeSenderForApi(id, cfg),
            hint: `Verify it works with POST /api/v1/senders/${id}/test`
        });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

apiRouter.put('/senders/:id', async (req, res) => {
    const { id } = req.params;
    if (!apiCanAccessSender(req, id)) return res.status(404).json({ error: 'Sender not found' });
    if (!apiCanManageSender(req, id)) return res.status(403).json({ error: 'Global senders are managed by the administrator.' });
    const body = stripSenderSecretEchoes(req.body || {});
    const { cfg, errors } = validateSenderConfig(body, config.senders[id], id, config.senders[id].accountId || null);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    delete cfg.accountId;
    try {
        await writeConfigSafe(c => {
            c.senders[id] = { ...c.senders[id], ...cfg };
            if (cfg.backupSenderId === '') delete c.senders[id].backupSenderId;
            pruneInvalidBackupRefs(c);
        });
        rebuildAllTransporters();
        delete senderHealth[id]; // config changed: re-evaluate health from scratch
        log.info('Sender updated via Agent API', { senderId: id });
        res.json({ message: 'Sender updated', sender: sanitizeSenderForApi(id, config.senders[id]) });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

apiRouter.delete('/senders/:id', async (req, res) => {
    const { id } = req.params;
    if (!apiCanAccessSender(req, id)) return res.status(404).json({ error: 'Sender not found' });
    if (!apiCanManageSender(req, id)) return res.status(403).json({ error: 'Global senders are managed by the administrator.' });
    try {
        await writeConfigSafe(c => {
            delete c.senders[id];
            pruneInvalidBackupRefs(c);
        });
        delete transporters[id];
        delete senderHealth[id];
        log.info('Sender deleted via Agent API', { senderId: id });
        res.json({ message: 'Sender removed' });
    } catch (e) {
        res.status(500).json({ error: t.failedSaveConfig });
    }
});

apiRouter.post('/senders/:id/test', async (req, res) => {
    const { id } = req.params;
    const senderCfg = config.senders && config.senders[id];
    if (!senderCfg || !apiCanAccessSender(req, id)) return res.status(404).json({ error: 'Sender not found' });
    const testTo = (req.body && req.body.to) || senderCfg.from;
    if (!testTo || !isValidEmail(testTo)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }
    try {
        const testTransporter = buildTransporter(senderCfg);
        await testTransporter.verify();
        const senderType = senderCfg.type === 'sendgrid' ? 'SendGrid' : 'SMTP';
        const meta = normalizeSendResult(await testTransporter.sendMail({
            from: senderCfg.from,
            to: testTo,
            subject: 'formPost - Test Connection',
            html: '<h2>formPost ' + senderType + ' Test</h2><p>Test email sent via the Agent API to verify that the sender <strong>' + escapeHtml(senderCfg.name || id) + '</strong> is working correctly.</p>'
        }));
        log.info('Sender test sent (Agent API)', { senderId: id, to: testTo, provider: meta.provider, statusCode: meta.statusCode, messageId: meta.messageId });
        res.json({ message: 'Test email sent to ' + testTo, provider: meta.provider, statusCode: meta.statusCode, messageId: meta.messageId, response: meta.response });
    } catch (e) {
        log.error('Sender test failed (Agent API)', { senderId: id, code: e.code, responseCode: e.responseCode, error: e.message });
        res.status(500).json({ error: 'Connection failed: ' + explainSendError(e, senderCfg) });
    }
});

// ---- Templates ----
// Account keys see shared templates + their account folder; master key sees everything.
apiRouter.get('/templates', async (req, res) => {
    const templates = await listTemplatesForScope(req.apiScope || null);
    res.json({
        templates,
        placeholders: {
            '{{fields}}': 'Replaced with an auto-generated <li> list of all submitted fields.',
            '{{form_id}}': 'Replaced with the form id.'
        }
    });
});

apiRouter.get('/templates/:name', async (req, res) => {
    const name = req.params.name;
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
        return res.status(400).json({ error: 'Invalid template name' });
    }
    const found = await resolveTemplateRead(name, req.apiScope || null, req.query.accountId);
    if (!found) return res.status(404).json({ error: 'Template not found' });
    res.json({ name, path: found.rel, content: found.content, shared: !!found.shared });
});

// Account keys write to their account folder; master key writes to the shared root
apiRouter.put('/templates/:name', async (req, res) => {
    const name = req.params.name;
    if (!validTemplateName(name)) {
        return res.status(400).json({ error: 'Invalid template name: must end in .html and contain no path separators.' });
    }
    const { content } = req.body || {};
    if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Body must be JSON: { "content": "<html>..." }' });
    }
    const dir = req.apiScope ? path.join(TEMPLATES_DIR, req.apiScope) : TEMPLATES_DIR;
    const rel = req.apiScope ? `templates/${req.apiScope}/${name}` : `templates/${name}`;
    try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, name), content, 'utf8');
        log.info('Template saved via Agent API', { template: rel });
        res.json({ message: 'Template saved', path: rel });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save template' });
    }
});

app.use('/api/v1', apiRouter);

// ===================== SupportHub agent tools (/agent-api) =====================
// READ-ONLY, purposely tiny responses for a support agent (SupportHub, ADR-0007).
// Auth: the JWT of the logged-in user, forwarded by the platform as
// `Authorization: Bearer <jwt>` and signed HS256 with SUPPORTHUB_TOOLS_SECRET.
// Claims: sub, email, name, exp + ctx { accountId, role }. Scoping is by ctx.
// Never returns secrets (webhooks, tokens, captcha keys) nor submitted content
// (names, emails or messages of the people who filled the forms).

const agentApiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

function b64urlDecode(part) {
    return Buffer.from(String(part).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// Verify an HS256 JWT signed with SUPPORTHUB_TOOLS_SECRET. Returns { payload } or { error }.
function verifyToolsJwt(token) {
    const secret = (process.env.SUPPORTHUB_TOOLS_SECRET || '').trim();
    if (!secret) return { error: 'disabled' };
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return { error: 'invalid' };
    const expected = b64url(nodeCrypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest());
    const a = Buffer.from(parts[2]), b = Buffer.from(expected);
    if (a.length !== b.length || !nodeCrypto.timingSafeEqual(a, b)) return { error: 'invalid' };
    let header, payload;
    try {
        header = JSON.parse(b64urlDecode(parts[0]));
        payload = JSON.parse(b64urlDecode(parts[1]));
    } catch (e) {
        return { error: 'invalid' };
    }
    if (!header || header.alg !== 'HS256') return { error: 'invalid' };
    if (!payload || !payload.exp || payload.exp * 1000 < Date.now()) return { error: 'expired' };
    return { payload };
}

function toolsAuth(req, res, next) {
    const header = req.headers['authorization'] || '';
    if (!header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing user token. Send it as Authorization: Bearer <jwt>.' });
    }
    const { payload, error } = verifyToolsJwt(header.slice(7).trim());
    if (error === 'disabled') return res.status(503).json({ error: 'Agent tools are not enabled on this server.' });
    if (error === 'expired') return res.status(401).json({ error: 'The user token expired.' });
    if (error) return res.status(401).json({ error: 'Invalid user token.' });
    const ctx = payload.ctx || {};
    // Scope: superadmin sees every account (scope null); everyone else is pinned
    // to their accountId, exactly like the panel.
    if (ctx.role === 'superadmin') {
        req.toolsScope = null;
    } else if (ctx.accountId && (config.accounts || {})[ctx.accountId]) {
        req.toolsScope = ctx.accountId;
    } else {
        return res.status(403).json({ error: 'The user token has no valid ctx.accountId for this server.' });
    }
    req.toolsUser = { sub: payload.sub || '', email: payload.email || '' };
    next();
}

// Issues the identity token the help widget hands to SupportHub, which forwards
// it back to the /agent-api tools above. Authenticated with the normal panel
// session — the secret never leaves the backend. Registered before the router
// so the tools guard does not intercept it.
app.get('/agent-api/token', adminLimiter, adminAuth, (req, res) => {
    const secret = (process.env.SUPPORTHUB_TOOLS_SECRET || '').trim();
    if (!secret) return res.status(404).json({ error: 'Agent tools are not enabled on this server.' });
    const user = (config.users || {})[req.user.username] || {};
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
        sub: req.user.username,
        email: user.email || '',
        name: user.name || req.user.username,
        exp: Math.floor(Date.now() / 1000) + 3600,
        // Exactly what toolsAuth reads to resolve the scope
        ctx: { accountId: req.user.accountId, role: req.user.role }
    }));
    const signature = b64url(nodeCrypto.createHmac('sha256', secret).update(header + '.' + payload).digest());
    res.json({ token: `${header}.${payload}.${signature}`, expiresIn: 3600 });
});

const agentApi = express.Router();
agentApi.use(agentApiLimiter);
agentApi.use(toolsAuth);

function toolsCanAccessForm(req, formId) {
    const r = (config.recipients || {})[formId];
    return !!r && formInScope(req.toolsScope, r);
}

// Forms of the user's account with their delivery setup and counters.
agentApi.get('/forms', (req, res) => {
    const stats = config.statistics || {};
    const forms = Object.entries(formsForScope(req.toolsScope)).map(([id, cfg]) => {
        const s = stats[id] || {};
        const sender = (config.senders || {})[cfg.senderId] || null;
        return {
            id,
            to: cfg.to || '',
            senderName: sender ? (sender.name || cfg.senderId) : null,
            senderActive: sender ? sender.active !== false : null,
            captchaEnabled: cfg.captchaEnabled !== false && !!((config.captcha || {})[id] || (config.turnstile || {})[id]),
            autoReplyEnabled: !!cfg.autoReplyEnabled,
            notifications: {
                discord: !!cfg.discordWebhook,
                telegram: !!(cfg.telegramBotToken && cfg.telegramChatId),
                webhook: !!cfg.webhookUrl
            },
            submissions: s.successfulSubmissions || 0,
            mailsSent: s.mailsSent || 0,
            notificationsSent: s.notificationsSent || 0,
            lastSubmission: s.lastSubmission || null
        };
    });
    res.json({ forms, total: forms.length });
});

// Delivery log of one form: did the email go out, and why not.
// The stored subject embeds the submitter's name, so it is never returned.
agentApi.get('/deliveries', async (req, res) => {
    const formId = String(req.query.formId || '');
    if (!toolsCanAccessForm(req, formId)) return res.status(404).json({ error: 'Form not found' });
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
    const entries = (await loadOutboxEntries(formId)).slice(0, limit).map(e => ({
        timestamp: e.timestamp,
        channel: e.channel,
        status: e.status,
        // Auto-replies go to the person who filled the form: never expose that address
        to: e.autoReply ? '(auto-respuesta al remitente del formulario)' : (e.to || ''),
        autoReply: !!e.autoReply,
        provider: e.provider || null,
        providerStatus: e.providerStatus || null,
        error: e.error || null
    }));
    res.json({ formId, entries, count: entries.length });
});

// How many submissions came in, without any of their content.
agentApi.get('/activity', async (req, res) => {
    const formId = String(req.query.formId || '');
    if (!toolsCanAccessForm(req, formId)) return res.status(404).json({ error: 'Form not found' });
    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const submissions = await loadSubmissions(formId);
    const perDay = {};
    let inRange = 0;
    for (const s of submissions) {
        if (!s.timestamp) continue;
        const ts = new Date(s.timestamp).getTime();
        if (ts < since) continue;
        inRange++;
        const day = new Date(s.timestamp).toISOString().substring(0, 10);
        perDay[day] = (perDay[day] || 0) + 1;
    }
    res.json({
        formId,
        days,
        submissionsInRange: inRange,
        submissionsStored: submissions.length,
        perDay,
        lastSubmission: submissions[0] ? submissions[0].timestamp : null
    });
});

// Email senders available to the account: the usual reason mail stops going out.
agentApi.get('/senders', (req, res) => {
    const senders = Object.entries(sendersForScope(req.toolsScope)).map(([id, cfg]) => ({
        id,
        name: cfg.name || id,
        type: cfg.type || 'smtp',
        from: cfg.from || '',
        active: cfg.active !== false,
        global: !cfg.accountId
    }));
    res.json({ senders, activeCount: senders.filter(s => s.active).length });
});

app.use('/agent-api', agentApi);

// Start the server
app.listen(PORT, () => {
    log.info('formPost server started', { port: PORT, health: `/health`, admin: `/admin` });
    sweepOrphanAttachments().catch(e => log.error('Orphan attachment sweep failed', { error: e.message }));
});
