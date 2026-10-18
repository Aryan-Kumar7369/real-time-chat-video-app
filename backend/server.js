import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import 'dotenv/config';

const { Pool } = pg;

const allowedOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map(url => url.trim().replace(/\/$/, ''))
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const corsOriginHandler = (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
    }
    // Allow vercel preview deployments
    if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
    }
    return callback(null, true);
};

// Initialising express and http
const app = express();
app.use(cors({
    origin: corsOriginHandler,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());
const server = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production';
if (!process.env.JWT_SECRET) {
    console.warn("WARNING: JWT_SECRET is not set in environment variables. Using default fallback.");
}

// AES-256-GCM key derived for securing data at rest in PostgreSQL
const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY
    ? crypto.createHash('sha256').update(process.env.DB_ENCRYPTION_KEY).digest()
    : crypto.createHash('sha256').update(JWT_SECRET).digest();

const encryptAtRest = (plainText) => {
    if (!plainText) return plainText;
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', DB_ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(plainText, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (err) {
        console.error("Encryption at rest error:", err);
        return plainText;
    }
};

const decryptAtRest = (cipherText) => {
    if (!cipherText || typeof cipherText !== 'string' || !cipherText.startsWith('enc:v1:')) {
        return cipherText;
    }
    try {
        const parts = cipherText.split(':');
        const ivHex = parts[2];
        const authTagHex = parts[3];
        const encrypted = parts[4];
        const decipher = crypto.createDecipheriv('aes-256-gcm', DB_ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error("Decryption at rest error:", err);
        return cipherText;
    }
};

// Connect to cloud PostgreSQL (via DATABASE_URL) or local Docker Postgres (via DB_* vars)
const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost')
            ? false
            : { rejectUnauthorized: false }
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
      };

const pool = new Pool(poolConfig);

// Initialise Database Tables
const initDb = async () => {
    try {
        // 1. Users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100),
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Postgres 'users' table ready!");

        // 2. Messages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                client_msg_id VARCHAR(255) UNIQUE NOT NULL,
                conversation_id VARCHAR(255) NOT NULL,
                sender_username VARCHAR(255),
                content TEXT NOT NULL,
                created_at BIGINT NOT NULL
            );
        `);

        // Ensure sender_username column exists if messages was created previously
        await pool.query(`
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_username VARCHAR(255);
        `);
        console.log("Postgres 'messages' table ready!");
    } catch (err) {
        console.error("Postgres Init Error:", err);
    }
};

initDb();

// Helper to sign JWT
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username, name: user.name },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// Middleware to verify JWT for REST endpoints
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }
        req.user = decoded;
        next();
    });
};

// ---------------- AUTH REST ENDPOINTS ----------------

// Register / Sign Up
app.post(['/api/auth/signup', '/api/auth/register'], async (req, res) => {
    try {
        const { username, name, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        const normalizedUsername = username.trim().toLowerCase();

        if (normalizedUsername.length < 3) {
            return res.status(400).json({ success: false, message: 'Username must be at least 3 characters long' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
        }

        // Check if username is already taken
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
            [normalizedUsername]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Username is already taken' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert new user
        const result = await pool.query(
            `INSERT INTO users (username, name, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, username, name, created_at`,
            [normalizedUsername, name?.trim() || normalizedUsername, passwordHash]
        );

        const newUser = result.rows[0];
        const token = generateToken(newUser);

        return res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                name: newUser.name
            }
        });

    } catch (error) {
        console.error('Signup Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error during registration' });
    }
});

// Login / Sign In
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        const normalizedUsername = username.trim().toLowerCase();

        const result = await pool.query(
            'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
            [normalizedUsername]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        const user = result.rows[0];

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        const token = generateToken(user);

        return res.status(200).json({
            success: true,
            message: 'Signed in successfully',
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name
            }
        });

    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error during login' });
    }
});

// Verify Current User (Session restore)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, name, created_at FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Auth check error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Search user by EXACT username only (prevents exposing or browsing other users)
app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length === 0) {
            return res.json({ success: true, users: [] });
        }

        // Clean query: strip optional leading '@', trim, and lowercase
        const exactUsername = q.trim().replace(/^@/, '').toLowerCase();
        const currentUsername = req.user.username.toLowerCase();

        if (exactUsername.length === 0) {
            return res.json({ success: true, users: [] });
        }

        // Strict exact match on username only, cannot match self
        const result = await pool.query(
            `SELECT id, username, name
             FROM users
             WHERE LOWER(username) = $1
               AND LOWER(username) != $2;`,
            [exactUsername, currentUsername]
        );

        return res.json({
            success: true,
            users: result.rows
        });
    } catch (err) {
        console.error('User search error:', err);
        return res.status(500).json({ success: false, message: 'Server error during user search' });
    }
});

// Fetch active 1-on-1 conversations for the authenticated user
app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const currentUsername = req.user.username.toLowerCase();

        // Get latest message for each private conversation where the user is a participant
        const result = await pool.query(
            `SELECT m.*
             FROM messages m
             INNER JOIN (
                 SELECT conversation_id, MAX(created_at) AS max_time
                 FROM messages
                 WHERE conversation_id LIKE 'dm:%'
                   AND $1 = ANY(string_to_array(LOWER(conversation_id), ':'))
                 GROUP BY conversation_id
             ) latest ON m.conversation_id = latest.conversation_id AND m.created_at = latest.max_time
             ORDER BY m.created_at DESC;`,
            [currentUsername]
        );

        // Fetch user profiles for the chat participants
        const conversations = await Promise.all(result.rows.map(async (row) => {
            const parts = row.conversation_id.split(':');
            const otherUsername = parts.find(p => p !== 'dm' && p.toLowerCase() !== currentUsername);

            let otherUser = { username: otherUsername, name: otherUsername };
            if (otherUsername) {
                const userRes = await pool.query(
                    'SELECT id, username, name FROM users WHERE LOWER(username) = LOWER($1)',
                    [otherUsername]
                );
                if (userRes.rows.length > 0) {
                    otherUser = userRes.rows[0];
                }
            }

            return {
                conversation_id: row.conversation_id,
                participant: otherUser,
                last_message: decryptAtRest(row.content),
                updated_at: row.created_at
            };
        }));

        return res.json({
            success: true,
            conversations
        });
    } catch (err) {
        console.error('Fetch conversations error:', err);
        return res.status(500).json({ success: false, message: 'Server error fetching conversations' });
    }
});

// Fetch historical messages for a specific conversation (protected)
app.get('/api/messages/:conversationId', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const currentUsername = req.user.username.toLowerCase();

        // Ensure user is an authorized participant in the conversation
        if (conversationId.startsWith('dm:')) {
            const parts = conversationId.split(':');
            const isParticipant = parts.some(p => p.toLowerCase() === currentUsername);
            if (!isParticipant) {
                return res.status(403).json({ success: false, message: 'Access denied: You are not a member of this chat' });
            }
        }

        const result = await pool.query(
            `SELECT client_msg_id, conversation_id, sender_username, content, created_at
             FROM messages
             WHERE conversation_id = $1
             ORDER BY created_at ASC;`,
            [conversationId]
        );

        const decryptedMessages = result.rows.map(m => ({
            ...m,
            content: decryptAtRest(m.content)
        }));

        return res.json({
            success: true,
            messages: decryptedMessages
        });
    } catch (err) {
        console.error('Fetch messages error:', err);
        return res.status(500).json({ success: false, message: 'Server error fetching messages' });
    }
});

// Fetch all messages across all user's conversations (for restoring all chats on login)
app.get('/api/messages/sync-all', authenticateToken, async (req, res) => {
    try {
        const currentUsername = req.user.username.toLowerCase();

        const result = await pool.query(
            `SELECT client_msg_id, conversation_id, sender_username, content, created_at
             FROM messages
             WHERE conversation_id LIKE 'dm:%'
               AND $1 = ANY(string_to_array(LOWER(conversation_id), ':'))
             ORDER BY created_at ASC;`,
            [currentUsername]
        );

        const decryptedMessages = result.rows.map(m => ({
            ...m,
            content: decryptAtRest(m.content)
        }));

        return res.json({
            success: true,
            messages: decryptedMessages
        });
    } catch (err) {
        console.error('Sync all messages error:', err);
        return res.status(500).json({ success: false, message: 'Server error during message sync' });
    }
});

// ---------------- SOCKET.IO SETUP ----------------

const io = new Server(server, {
    cors: {
        origin: corsOriginHandler,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Socket.IO JWT Authentication Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
        return next(new Error('Authentication error: Token required'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded; // { id, username, name }
        next();
    } catch (err) {
        return next(new Error('Authentication error: Invalid or expired token'));
    }
});

// Listening for connections
io.on('connection', (socket) => {
    const authenticatedUsername = (socket.user?.username || 'unknown').toLowerCase();
    const userRoom = `user:${authenticatedUsername}`;
    
    // Each user joins their private user room for targeted 1-on-1 message delivery
    socket.join(userRoom);
    console.log(`Authenticated client connected: ${socket.id} (@${authenticatedUsername}) joined room ${userRoom}`);

    socket.on('send_message', async (messageData, callback) => {
        // Enforce the sender's username from verified token
        const enrichedMessage = {
            ...messageData,
            client_username: authenticatedUsername
        };

        // Determine the private recipient username
        let recipient = messageData.recipient_username?.toLowerCase();
        if (!recipient && messageData.conversation_id?.startsWith('dm:')) {
            const parts = messageData.conversation_id.split(':');
            recipient = parts.find(p => p !== 'dm' && p.toLowerCase() !== authenticatedUsername);
        }

        console.log(`Private message from @${authenticatedUsername} to @${recipient || 'unknown'}:`, enrichedMessage.content);

        try {
            // Encrypt message content at rest before writing to PostgreSQL
            const encryptedContent = encryptAtRest(enrichedMessage.content);

            await pool.query(
                `INSERT INTO messages (client_msg_id, conversation_id, sender_username, content, created_at)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (client_msg_id) DO NOTHING;`,
                [
                    enrichedMessage.client_msg_id,
                    enrichedMessage.conversation_id,
                    authenticatedUsername,
                    encryptedContent,
                    enrichedMessage.created_at
                ]
            );

            console.log(`Saved encrypted to Postgres: ${enrichedMessage.client_msg_id}`);

            if (typeof callback === 'function') {
                callback({
                    success: true,
                    message: "Successfully saved to server"
                });
            }

            // Route ONLY to recipient's private user room (not broadcast!)
            if (recipient) {
                io.to(`user:${recipient}`).emit('receive_message', enrichedMessage);
            }

            // Echo to sender's other connected tabs/devices (excluding the originating socket)
            socket.to(userRoom).emit('receive_message', enrichedMessage);

        } catch (error) {
            console.error("Database Error:", error);
            if (typeof callback === 'function') {
                callback({ success: false, error: "Database failure" });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id} (@${authenticatedUsername})`);
    });
});

// Starting the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server started at port ${PORT}`);
});

// Health check endpoints for cloud monitoring (Render, Koyeb, etc.)
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Real-Time Chat App Backend',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});