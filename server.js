// Install dependencies: npm install express body-parser nodemailer
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
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

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// CORS Configuration - Allow requests from your websites
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (config.cors.allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Configure the Nodemailer transporter
// Only include auth if user and pass are provided
const transporterConfig = { ...config.smtp };
if (transporterConfig.user && transporterConfig.pass) {
 transporterConfig.auth = {
        type: 'LOGIN',
        user: transporterConfig.user,
        pass: transporterConfig.pass
    };
}
// Remove user/pass from top-level to avoid nodemailer warnings
delete transporterConfig.user;
delete transporterConfig.pass;
const transporter = nodemailer.createTransport(transporterConfig);

app.post('/submit', async (req, res) => {
    const { website_id, name, email, phone, rooms, service, message, 'cf-turnstile-response': turnstileToken } = req.body;

    // 1. DYNAMIC ROUTING CHECK
    const recipientConfig = config.recipients[website_id];

    if (!recipientConfig) {
        console.error(`Unknown website_id: ${website_id}`);
        // Redirect to a failure page or just return 400
        return res.status(400).send('Invalid form submission ID.');
    }

    // 2. VERIFY CLOUDFLARE TURNSTILE TOKEN
    // Skip verification in DEBUG mode
    if (!DEBUG) {
        if (!turnstileToken) {
            console.error('No Turnstile token provided');
            return res.status(400).send('Please complete the security verification.');
        }

        // Get the appropriate Turnstile secret key for this website
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
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            const { success, 'error-codes': errorCodes } = verificationResponse.data;

            if (!success) {
                console.error('Turnstile verification failed:', errorCodes);
                return res.status(400).send('Security verification failed. Please try again.');
            }
        } catch (error) {
            console.error('Error verifying Turnstile token:', error);
            return res.status(500).send('Security verification error. Please try again later.');
        }
    } else {
        console.log('DEBUG mode: Skipping Turnstile verification');
    }

    // 3. READ HTML TEMPLATE AND REPLACE PLACEHOLDERS
    try {
        // Use the template path from config
        const templatePath = path.join(__dirname, recipientConfig.templatePath);
        let mailBody = await fs.readFile(templatePath, 'utf8');
        
        // Replace placeholders with actual data
        mailBody = mailBody
            .replace(/{{website_id}}/g, website_id || 'Unknown')
            .replace(/{{name}}/g, name || 'Anonymous')
            .replace(/{{email}}/g, email || 'No email provided')
            .replace(/{{phone}}/g, phone || 'No phone provided')
            .replace(/{{rooms}}/g, rooms || 'Not specified')
			.replace(/{{service}}/g, service || 'Not specified')
            .replace(/{{message}}/g, message || 'No details provided.');

const mailOptions = {
    // 1. Set the technical sender to the authenticated user from config
    // This is the CRITICAL change to satisfy the server's relay policy
    from: `"${name}" <${config.smtp.from}>`, // Example: "John Smith" <cloud@codemov.com>
    
    // 2. Set the recipient address
    to: recipientConfig.to,
    
    // 3. Set the subject
    subject: `${recipientConfig.subjectPrefix} New Lead from ${name}`,
    html: mailBody,
    
    // 4. IMPORTANT: Set Reply-To to the customer's email
    // This allows you to just hit 'Reply' to contact the customer.
    replyTo: email 
};

    // 3. SEND EMAIL
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email successfully sent to ${recipientConfig.to} for ${website_id}`);

        // 4. UPDATE STATISTICS
        try {
            // Read current config to get latest statistics
            const currentConfig = JSON.parse(await fs.readFile('./config.json', 'utf8'));
            
            // Initialize statistics for this website if it doesn't exist
            if (!currentConfig.statistics) {
                currentConfig.statistics = {};
            }
            if (!currentConfig.statistics[website_id]) {
                currentConfig.statistics[website_id] = {
                    successfulSubmissions: 0,
                    lastSubmission: null
                };
            }
            
            // Increment counter and update timestamp
            currentConfig.statistics[website_id].successfulSubmissions++;
            currentConfig.statistics[website_id].lastSubmission = new Date().toISOString();
            
            // Write updated config back to file
            await fs.writeFile('./config.json', JSON.stringify(currentConfig, null, 4));
            
            console.log(`Statistics updated for ${website_id}: ${currentConfig.statistics[website_id].successfulSubmissions} submissions`);
            
            // Update the in-memory config object
            config.statistics = currentConfig.statistics;
            
        } catch (statsError) {
            console.error('Error updating statistics:', statsError);
            // Don't fail the entire submission if statistics update fails
        }

        // 5. REDIRECT THE USER
        // IMPORTANT: The browser expects a response. A redirect is the simplest way.
        // Use the website-specific redirect URL from config
        res.redirect(302, recipientConfig.redirectUrl); 

    } catch (error) {
        console.error('Error sending email:', error);
        // Redirect to a failure page or display an error
        res.status(500).send('Something went wrong on the server.');
    }
    } catch (templateError) {
        console.error('Error reading email template:', templateError);
        res.status(500).send('Template error on the server.');
    }
});

// Health Check Endpoint
app.get('/health', async (req, res) => {
    try {
        const healthCheck = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
            },
            config: {
                websites: Object.keys(config.recipients),
                smtp: config.smtp, // return full smtp config object
                turnstile: Object.keys(config.turnstile || {})
            }
        };

        // Optional: Test SMTP connection (commented out by default for performance)
        // try {
        //     await transporter.verify();
        //     healthCheck.smtp = 'connected';
        // } catch (error) {
        //     healthCheck.smtp = 'connection_error';
        //     healthCheck.status = 'warning';
        // }

        res.status(200).json(healthCheck);
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: 'Health check failed'
        });
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
    const [user, pass] = credentials.split(':');
    
    if (DEBUG) {
        console.log('Admin auth attempt:', { user, pass, configAdmin: config.admin });
    }
    
    if (config.admin && user === config.admin.username && pass === config.admin.password) {
        return next();
    }
    return res.status(403).send('Forbidden');
}

// Serve static admin UI files (protected) - handle all admin routes
app.use('/admin', adminAuth, (req, res, next) => {
    // If it's the root path, serve index.html
    if (req.path === '/' || req.path === '') {
        return res.sendFile(path.join(__dirname, 'admin', 'index.html'));
    }
    // For other files, serve them statically
    express.static(path.join(__dirname, 'admin'))(req, res, next);
});

// Serve logo and other root static files
app.use(express.static(__dirname));

// Admin API routes (protected)
const adminRouter = express.Router();
adminRouter.use(adminAuth);

// Get server status (reuse health check data)
adminRouter.get('/status', async (req, res) => {
    try {
        const healthCheck = {
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
                smtp: config.smtp, // return full smtp config object
                turnstile: Object.keys(config.turnstile || {})
            }
        };
        res.json(healthCheck);
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
    // Also add turnstile entry if provided
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
    res.json(config.smtp);
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
        console.error('Failed to write config:', e);
        res.status(500).json({ error: 'Failed to save config' });
    }
});

// Statistics routes
adminRouter.get('/statistics', (req, res) => {
    // Return statistics for all websites
    const stats = config.statistics || {};
    
    // Enhance with website names from recipients
    const enhancedStats = {};
    for (const [websiteId, websiteConfig] of Object.entries(config.recipients)) {
        const websiteStats = stats[websiteId] || {
            successfulSubmissions: 0,
            lastSubmission: null
        };
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
    const websiteStats = stats[id] || {
        successfulSubmissions: 0,
        lastSubmission: null
    };
    
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
        // Read current config
        const currentConfig = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        
        // Reset statistics for this website
        if (!currentConfig.statistics) {
            currentConfig.statistics = {};
        }
        currentConfig.statistics[id] = {
            successfulSubmissions: 0,
            lastSubmission: null
        };
        
        // Write updated config back to file
        await fs.writeFile('./config.json', JSON.stringify(currentConfig, null, 4));
        
        // Update in-memory config
        config.statistics = currentConfig.statistics;
        
        res.json({ message: 'Statistics reset', websiteId: id });
    } catch (e) {
        console.error('Failed to reset statistics:', e);
        res.status(500).json({ error: 'Failed to reset statistics' });
    }
});

// Reset admin password
adminRouter.put('/admin/reset-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    // Verify current password
    if (currentPassword !== config.admin.password) {
        return res.status(403).json({ error: 'Current password is incorrect' });
    }
    
    try {
        // Read current config
        const configData = await fs.readFile('./config.json', 'utf8');
        const currentConfig = JSON.parse(configData);
        
        // Update password
        currentConfig.admin.password = newPassword;
        
        // Write updated config back to file
        await fs.writeFile('./config.json', JSON.stringify(currentConfig, null, 4));
        
        // Update in-memory config
        config.admin.password = newPassword;
        
        res.json({ message: 'Password updated successfully' });
    } catch (e) {
        console.error('Failed to update password:', e);
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
