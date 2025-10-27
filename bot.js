const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize storage files
const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Initialize Express middleware
app.use(express.json());
app.use(express.static('public'));

// Store pair codes for multiple users
const userPairCodes = new Map();
const activePairCodes = new Map();
const userSessions = new Map();
const codeUsageHistory = [];

// Admin configuration
const ADMIN_NUMBERS = ['233245529834@c.us']; // Your number in WhatsApp format
const BOT_CONFIG = {
    codeLength: 8,
    codeExpiryHours: 24,
    maxCodesPerUser: 10,
    allowMultipleActiveCodes: false,
    codeFormat: 'alphanumeric' // 'numeric', 'alphanumeric', 'alphabetic'
};

// Initialize WhatsApp client with enhanced configuration
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-pair-bot-multi",
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--remote-debugging-port=9222'
        ]
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

// Enhanced pair code generation
function generatePairCode() {
    let code;
    let attempts = 0;
    
    do {
        switch (BOT_CONFIG.codeFormat) {
            case 'numeric':
                code = Math.floor(10000000 + Math.random() * 90000000).toString().substring(0, BOT_CONFIG.codeLength);
                break;
            case 'alphabetic':
                code = generateAlphabeticCode(BOT_CONFIG.codeLength);
                break;
            case 'alphanumeric':
            default:
                code = generateAlphanumericCode(BOT_CONFIG.codeLength);
                break;
        }
        attempts++;
        
        if (attempts > 100) {
            throw new Error('Unable to generate unique code after 100 attempts');
        }
    } while (activePairCodes.has(code));
    
    return code;
}

function generateAlphanumericCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateAlphabeticCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Code management functions
function cleanExpiredCodes() {
    const now = new Date();
    let cleaned = 0;
    
    for (const [code, data] of activePairCodes.entries()) {
        if (now > data.expiresAt) {
            // Log expiration
            codeUsageHistory.push({
                code: code,
                user: data.phone,
                action: 'expired',
                timestamp: now
            });
            
            activePairCodes.delete(code);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} expired pair codes`);
        saveDataToFile();
    }
}

function getUserActiveCodesCount(phone) {
    let count = 0;
    for (const [code, data] of activePairCodes.entries()) {
        if (data.phone === phone) {
            count++;
        }
    }
    return count;
}

function saveDataToFile() {
    const data = {
        userPairCodes: Array.from(userPairCodes.entries()),
        activePairCodes: Array.from(activePairCodes.entries()),
        codeUsageHistory: codeUsageHistory,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(path.join(DATA_DIR, 'bot-data.json'), JSON.stringify(data, null, 2));
}

function loadDataFromFile() {
    try {
        const dataPath = path.join(DATA_DIR, 'bot-data.json');
        if (fs.existsSync(dataPath)) {
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            
            // Convert arrays back to Maps
            userPairCodes.clear();
            activePairCodes.clear();
            codeUsageHistory.length = 0;
            
            data.userPairCodes.forEach(([key, value]) => userPairCodes.set(key, value));
            data.activePairCodes.forEach(([key, value]) => activePairCodes.set(key, value));
            codeUsageHistory.push(...data.codeUsageHistory);
            
            console.log(`📂 Loaded ${userPairCodes.size} users and ${activePairCodes.size} active codes from storage`);
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Enhanced web server routes
app.get('/', (req, res) => {
    const totalUsers = userPairCodes.size;
    const totalCodes = activePairCodes.size;
    const totalUsage = codeUsageHistory.length;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Pair Code Bot</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container { 
                    max-width: 1200px; 
                    margin: 0 auto; 
                    background: white; 
                    padding: 40px; 
                    border-radius: 20px; 
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                }
                .header { 
                    text-align: center; 
                    margin-bottom: 40px;
                    background: linear-gradient(135deg, #4CAF50, #45a049);
                    color: white;
                    padding: 30px;
                    border-radius: 15px;
                }
                .stats { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                    gap: 20px; 
                    margin: 30px 0; 
                }
                .stat-card { 
                    background: white; 
                    padding: 25px; 
                    border-radius: 15px; 
                    text-align: center; 
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                    border-left: 5px solid #4CAF50;
                }
                .stat-card h3 { color: #666; font-size: 14px; margin-bottom: 10px; }
                .stat-card h2 { color: #333; font-size: 32px; }
                .command { 
                    background: #f8f9fa; 
                    padding: 15px; 
                    border-radius: 10px; 
                    margin: 10px 0; 
                    border-left: 4px solid #4CAF50;
                }
                .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 30px 0; }
                .feature-card { background: #f8f9fa; padding: 20px; border-radius: 10px; }
                .code-example { background: #2d3748; color: #68d391; padding: 15px; border-radius: 8px; font-family: monospace; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🤖 WhatsApp Pair Code Bot</h1>
                    <p>Multi-user bot for generating unique 8-character pair codes</p>
                </div>
                
                <div class="stats">
                    <div class="stat-card">
                        <h3>👥 Total Users</h3>
                        <h2>${totalUsers}</h2>
                    </div>
                    <div class="stat-card">
                        <h3>🔑 Active Codes</h3>
                        <h2>${totalCodes}</h2>
                    </div>
                    <div class="stat-card">
                        <h3>📊 Total Usage</h3>
                        <h2>${totalUsage}</h2>
                    </div>
                    <div class="stat-card">
                        <h3>🕐 Uptime</h3>
                        <h2>${Math.floor(process.uptime() / 60)}m</h2>
                    </div>
                </div>
                
                <h2>🚀 How to Use</h2>
                <div class="features">
                    <div class="feature-card">
                        <h3>1. Save Bot Number</h3>
                        <p>Save +233245529834 to your contacts</p>
                    </div>
                    <div class="feature-card">
                        <h3>2. Send Command</h3>
                        <p>Message <strong>!pair</strong> to get your code</p>
                    </div>
                    <div class="feature-card">
                        <h3>3. Use Your Code</h3>
                        <p>8-character code valid for 24 hours</p>
                    </div>
                </div>
                
                <h2>🛠️ Available Commands</h2>
                <div class="command"><strong>!pair</strong> - Generate new 8-character pair code</div>
                <div class="command"><strong>!mycode</strong> - Show your current active code</div>
                <div class="command"><strong>!help</strong> - Show detailed help menu</div>
                <div class="command"><strong>!status</strong> - Check bot status and statistics</div>
                <div class="command"><strong>!users</strong> - Admin: View user statistics</div>
                <div class="command"><strong>!stats</strong> - Admin: Detailed bot statistics</div>
                
                <h2>🔢 Code Examples</h2>
                <div class="code-example">A1B2C3D4 - 8-character alphanumeric</div>
                <div class="code-example">X8Y9Z0W1 - Unique for each user</div>
                <div class="code-example">M5N6P7Q8 - 24-hour validity</div>
                
                <div style="margin-top: 40px; padding: 20px; background: #e8f5e8; border-radius: 10px; text-align: center;">
                    <h3>🌐 Multiple Users Supported</h3>
                    <p>Unlimited users can generate codes simultaneously. Perfect for teams, applications, and services.</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'running',
        users: userPairCodes.size,
        activeCodes: activePairCodes.size,
        totalUsage: codeUsageHistory.length,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

app.get('/api/stats', (req, res) => {
    const stats = {
        users: userPairCodes.size,
        activeCodes: activePairCodes.size,
        totalUsage: codeUsageHistory.length,
        recentActivity: codeUsageHistory.slice(-10),
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version
        }
    };
    res.json(stats);
});

// Enhanced WhatsApp event handlers
client.on('qr', (qr) => {
    console.log('🔐 QR CODE RECEIVED - SCAN WITH WHATSAPP:');
    qrcode.generate(qr, { small: true });
    console.log('QR Code string (for backup):', qr.substring(0, 50) + '...');
});

client.on('ready', () => {
    console.log('🎉 BOT READY FOR MULTIPLE USERS!');
    console.log('================================');
    console.log('🤖 Features:');
    console.log('• 8-character pair codes');
    console.log('• Multi-user support');
    console.log('• 24-hour expiry');
    console.log('• Real-time tracking');
    console.log('• Web dashboard');
    console.log('================================');
    console.log('📱 Users can message: !pair, !help, !status');
    
    // Load previous data
    loadDataFromFile();
    
    // Start maintenance jobs
    setInterval(cleanExpiredCodes, 60 * 60 * 1000); // Every hour
    setInterval(saveDataToFile, 5 * 60 * 1000); // Save every 5 minutes
    
    console.log('🛠️  Maintenance jobs started');
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp authentication successful');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
    console.log('❌ Client disconnected:', reason);
    // Save data before exit
    saveDataToFile();
});

// Enhanced message handler
client.on('message', async (message) => {
    // Ignore group messages and status messages
    if (message.isGroupMsg || message.isStatus) return;

    const content = message.body.toLowerCase().trim();
    const from = message.from;
    const senderName = message._data.notifyName || 'User';
    const isAdmin = ADMIN_NUMBERS.includes(from);

    console.log(`📨 ${senderName} (${from}): ${content}`);

    try {
        // Track user session
        if (!userSessions.has(from)) {
            userSessions.set(from, {
                firstSeen: new Date(),
                lastSeen: new Date(),
                messageCount: 0,
                name: senderName
            });
        }
        
        const userSession = userSessions.get(from);
        userSession.lastSeen = new Date();
        userSession.messageCount++;

        // Handle commands
        switch (content) {
            case '!start':
            case '!hello':
            case 'hi':
            case 'hello':
                await sendWelcomeMessage(message, senderName, isAdmin);
                break;

            case '!pair':
                await handlePairCommand(from, senderName, message);
                break;

            case '!mycode':
                await handleMyCodeCommand(from, senderName, message);
                break;

            case '!help':
                await handleHelpCommand(message, isAdmin);
                break;

            case '!status':
                await handleStatusCommand(message);
                break;

            case '!users':
                if (isAdmin) {
                    await handleUsersCommand(message);
                } else {
                    await message.reply('❌ This command is for administrators only.');
                }
                break;

            case '!stats':
                if (isAdmin) {
                    await handleStatsCommand(message);
                } else {
                    await message.reply('❌ This command is for administrators only.');
                }
                break;

            case '!ping':
                await message.reply('🏓 Pong! Bot is active and responding.');
                break;

            default:
                if (content.startsWith('!')) {
                    await message.reply('❌ Unknown command. Type *!help* to see all available commands.');
                } else if (content.includes('thank') || content.includes('thanks')) {
                    await message.reply('🙏 You\'re welcome! Let me know if you need more pair codes.');
                }
        }
    } catch (error) {
        console.error('Error handling message:', error);
        await message.reply('❌ An error occurred while processing your request. Please try again.');
    }
});

// Enhanced command handlers
async function sendWelcomeMessage(message, senderName, isAdmin) {
    const adminBadge = isAdmin ? ' 👑' : '';
    
    const welcomeMsg = `
👋 Welcome *${senderName}*${adminBadge}!

🤖 *WhatsApp Pair Code Bot v2.0*

I generate *8-character unique pair codes* for multiple users simultaneously!

🚀 *Quick Start:*
Send *!pair* to get your unique code

📋 *Available Commands:*
🔐 *!pair* - Generate new 8-char pair code
📋 *!mycode* - Show your current active code
🛠️ *!help* - Detailed help menu
📊 *!status* - Bot status & statistics

💡 *Features:*
• 8-character alphanumeric codes
• 24-hour validity
• Unlimited users
• Real-time generation

🌐 *Web Dashboard:* https://your-app.onrender.com
    `;
    
    await message.reply(welcomeMsg);
}

async function handlePairCommand(from, senderName, message) {
    // Check if user has too many active codes
    const activeCodesCount = getUserActiveCodesCount(from);
    if (!BOT_CONFIG.allowMultipleActiveCodes && activeCodesCount > 0) {
        const userData = userPairCodes.get(from);
        await message.reply(`❌ You already have an active pair code: *${userData.code}*\n\nUse *!mycode* to check it or wait for it to expire.`);
        return;
    }
    
    if (activeCodesCount >= BOT_CONFIG.maxCodesPerUser) {
        await message.reply(`❌ You have reached the maximum limit of ${BOT_CONFIG.maxCodesPerUser} active codes. Please wait for some to expire.`);
        return;
    }

    try {
        const pairCode = generatePairCode();
        const expiresAt = new Date(Date.now() + BOT_CONFIG.codeExpiryHours * 60 * 60 * 1000);
        
        // Store user data
        userPairCodes.set(from, {
            code: pairCode,
            createdAt: new Date(),
            usageCount: (userPairCodes.get(from)?.usageCount || 0) + 1,
            name: senderName,
            expiresAt: expiresAt
        });
        
        // Store active code
        activePairCodes.set(pairCode, {
            phone: from,
            name: senderName,
            createdAt: new Date(),
            expiresAt: expiresAt,
            usageCount: 0
        });

        // Log code generation
        codeUsageHistory.push({
            code: pairCode,
            user: from,
            userName: senderName,
            action: 'generated',
            timestamp: new Date()
        });

        console.log(`🔐 Generated code ${pairCode} for ${senderName} (${from})`);

        const replyMessage = `
✅ *PAIR CODE GENERATED*

👤 *User:* ${senderName}
🔢 *Your Code:* *${pairCode}*

⏰ *Expires:* ${BOT_CONFIG.codeExpiryHours} hours
📅 *Generated:* ${new Date().toLocaleString()}
📊 *Your Total Codes:* ${userPairCodes.get(from).usageCount}

💡 *Use this 8-character code in your application for pairing.*
🔒 *Keep it secure and don't share unnecessarily.*

📋 *Check your code anytime with* !mycode
🔄 *Generate new code after this expires*
        `;

        await message.reply(replyMessage);
        
        // Notify admin of new code generation
        if (ADMIN_NUMBERS.length > 0) {
            const adminMsg = `📊 New pair code generated:\nUser: ${senderName}\nCode: ${pairCode}\nTime: ${new Date().toLocaleString()}`;
            for (const adminNumber of ADMIN_NUMBERS) {
                if (adminNumber !== from) {
                    await client.sendMessage(adminNumber, adminMsg);
                }
            }
        }
        
    } catch (error) {
        console.error('Error generating pair code:', error);
        await message.reply('❌ Failed to generate pair code. Please try again.');
    }
}

async function handleMyCodeCommand(from, senderName, message) {
    const userData = userPairCodes.get(from);
    
    if (userData && activePairCodes.has(userData.code)) {
        const codeData = activePairCodes.get(userData.code);
        const timeLeft = Math.floor((codeData.expiresAt - new Date()) / (60 * 60 * 1000));
        const hours = Math.floor(timeLeft);
        const minutes = Math.floor((timeLeft - hours) * 60);
        
        await message.reply(`
📋 *YOUR ACTIVE PAIR CODE*

👤 *User:* ${senderName}
🔢 *Code:* *${userData.code}*
⏰ *Expires in:* ${hours}h ${minutes}m
📅 *Generated:* ${userData.createdAt.toLocaleString()}
🔁 *Your Total Codes:* ${userData.usageCount}

💡 *This 8-character code is active and ready to use!*
🔄 *You can generate a new code after this expires*
        `);
    } else {
        await message.reply(`❌ You don't have an active pair code. 

Send *!pair* to generate a new 8-character code now!

💡 Your code will be valid for ${BOT_CONFIG.codeExpiryHours} hours.`);
    }
}

async function handleHelpCommand(message, isAdmin) {
    let helpMessage = `
🤖 *WHATSAPP PAIR BOT v2.0 - HELP*

*Available Commands for All Users:*

🔐 *Pairing Commands*
!pair - Generate new 8-character pair code
!mycode - Show your current active code

📋 *Information Commands*  
!help - Show this help message
!status - Check bot status & statistics
!ping - Check if bot is responsive

👥 *Multi-User Features*
• Unlimited users supported
• Unique 8-character codes for everyone
• ${BOT_CONFIG.codeExpiryHours}-hour code expiration
• Real-time code generation
• Usage history tracking

🔢 *Code Format:* 8-character alphanumeric
⏰ *Validity:* ${BOT_CONFIG.codeExpiryHours} hours
👥 *Multi-user:* Yes, unlimited
    `;

    if (isAdmin) {
        helpMessage += '\n\n👑 *Admin Commands:*\n';
        helpMessage += '!users - View user statistics\n';
        helpMessage += '!stats - Detailed bot statistics\n';
    }

    helpMessage += '\n💡 *Tip:* Share this bot with friends who need pair codes!';

    await message.reply(helpMessage);
}

async function handleStatusCommand(message) {
    const totalUsers = userPairCodes.size;
    const activeCodes = activePairCodes.size;
    const totalUsage = codeUsageHistory.length;
    const uptime = Math.floor(process.uptime() / 60);
    const memoryUsage = Math.round(process.memoryUsage().rss / 1024 / 1024);

    // Calculate recent activity (last 24 hours)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActivity = codeUsageHistory.filter(entry => 
        new Date(entry.timestamp) > last24Hours
    ).length;

    const statusMessage = `
🤖 *BOT STATUS - MULTI USER v2.0*

✅ *Status:* Online & Active
👥 *Total Users:* ${totalUsers}
🔑 *Active Codes:* ${activeCodes}
📊 *Total Usage:* ${totalUsage}
🔥 *24h Activity:* ${recentActivity}

🖥️ *System Info:*
🕐 *Uptime:* ${uptime} minutes
💾 *Memory:* ${memoryUsage} MB
🌐 *Host:* Render Cloud
🔢 *Code Length:* 8 characters

🚀 *Ready for unlimited users!*
    `;

    await message.reply(statusMessage);
}

async function handleUsersCommand(message) {
    const totalUsers = userPairCodes.size;
    const activeCodes = activePairCodes.size;
    const totalUsage = codeUsageHistory.length;
    
    // Get top users by code generation
    const userStats = Array.from(userPairCodes.entries())
        .sort((a, b) => b[1].usageCount - a[1].usageCount)
        .slice(0, 10);
    
    let userStatsText = `📊 *ADMIN - USER STATISTICS*\n\n`;
    userStatsText += `👥 Total Users: ${totalUsers}\n`;
    userStatsText += `🔑 Active Codes: ${activeCodes}\n`;
    userStatsText += `📈 Total Usage: ${totalUsage}\n`;
    userStatsText += `🕐 Server Uptime: ${Math.floor(process.uptime() / 60)} minutes\n\n`;
    
    userStatsText += `🏆 *Top Users by Code Generation:*\n`;
    userStats.forEach(([phone, data], index) => {
        const shortPhone = phone.replace('@c.us', '');
        userStatsText += `${index + 1}. ${data.name}: ${data.usageCount} codes\n`;
    });

    await message.reply(userStatsText);
}

async function handleStatsCommand(message) {
    const totalUsers = userPairCodes.size;
    const activeCodes = activePairCodes.size;
    const totalUsage = codeUsageHistory.length;
    
    // Calculate daily stats
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayUsage = codeUsageHistory.filter(entry => 
        new Date(entry.timestamp) >= today
    ).length;
        
    // Calculate user growth
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newUsersThisWeek = Array.from(userPairCodes.values()).filter(user => 
        new Date(user.createdAt) >= weekAgo
    ).length;

    const statsMessage = `
📈 *ADMIN - DETAILED STATISTICS*

👥 *User Statistics:*
• Total Users: ${totalUsers}
• Active Codes: ${activeCodes}
• New Users (Week): ${newUsersThisWeek}
• Active Sessions: ${userSessions.size}

📊 *Usage Statistics:*
• Total Code Generations: ${totalUsage}
• Today's Usage: ${todayUsage}
• Average Daily: ${Math.round(totalUsage / 7)}

🖥️ *System Statistics:*
• Uptime: ${Math.floor(process.uptime() / 3600)} hours
• Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB
• Node.js: ${process.version}
• Platform: ${process.platform}

🔧 *Bot Configuration:*
• Code Length: ${BOT_CONFIG.codeLength} characters
• Code Expiry: ${BOT_CONFIG.codeExpiryHours} hours
• Max Codes/User: ${BOT_CONFIG.maxCodesPerUser}
• Code Format: ${BOT_CONFIG.codeFormat}

🌐 *Web Dashboard:* Available
📊 *API Endpoints:* /health, /api/stats
    `;

    await message.reply(statsMessage);
}

// Enhanced initialization
async function startBot() {
    console.log('🚀 Starting Enhanced WhatsApp Pair Bot v2.0...');
    console.log('===============================================');
    console.log('🤖 Bot Features:');
    console.log('• 8-character pair codes');
    console.log('• Multi-user support (unlimited)');
    console.log('• 24-hour code expiry');
    console.log('• Real-time tracking');
    console.log('• Web dashboard with stats');
    console.log('• Admin commands');
    console.log('• Data persistence');
    console.log('===============================================');
    console.log('📞 Your Number: +233245529834');
    console.log('👑 Admin access enabled');
    console.log('🔢 Code format: 8-character alphanumeric');
    
    // Start web server
    app.listen(PORT, () => {
        console.log(`🌐 Web server running on port ${PORT}`);
        console.log(`📊 Dashboard: http://localhost:${PORT}`);
        console.log(`❤️  Health check: http://localhost:${PORT}/health`);
    });
    
    // Initialize WhatsApp client
    await client.initialize();
    
    console.log('✅ Bot initialization complete');
    console.log('📱 Waiting for QR code scan...');
}

// Enhanced error handling and graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await saveDataToFile();
    console.log('💾 Data saved successfully');
    await client.destroy();
    console.log('👋 Bot shut down gracefully');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    await saveDataToFile();
    await client.destroy();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the enhanced bot
startBot().catch(console.error);
```

This is now a complete, production-ready WhatsApp bot with:

🎯 Enhanced Features:

1. 8-character pair codes (alphanumeric)
2. Multi-user support (unlimited users)
3. Admin commands and statistics
4. Web dashboard with real-time stats
5. Data persistence (saves to file)
6. Usage tracking and analytics
7. Enhanced error handling
8. Graceful shutdown
9. Health monitoring
10. API endpoints

🚀 Deployment:

1. Create package.json (as before)
2. Create bot.js (this enhanced version)
3. Deploy to Render (same process)

The bot will now handle multiple users simultaneously and provide rich features for both users and administrators!
