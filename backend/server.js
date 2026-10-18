import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const { Pool } = pg;

// Initialising express and http
const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production';
if (!process.env.JWT_SECRET) {
    console.warn("WARNING: JWT_SECRET is not set in environment variables. Using default fallback.");
}

const pool = new Pool({
    user: process.env.DB_USER,
    host: 'localhost', // Connects to the port mapped by your Docker container
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

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

// ---------------- SOCKET.IO SETUP ----------------

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

// Setting up Redis publisher and subscriber (optional / scalable)
// const pubClient = new Redis({ host: 'localhost', port: 6379 });
// const subClient = pubClient.duplicate();
// io.adapter(createAdapter(pubClient, subClient));

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
    const authenticatedUsername = socket.user?.username || 'unknown';
    console.log(`Authenticated client connected: ${socket.id} (@${authenticatedUsername})`);

    socket.on('send_message', async (messageData, callback) => {
        // Enforce the sender's username from the verified token to prevent identity spoofing
        const enrichedMessage = {
            ...messageData,
            client_username: authenticatedUsername
        };

        console.log(`Message received from @${authenticatedUsername}:`, enrichedMessage.content);

        try {
            await pool.query(
                `INSERT INTO messages (client_msg_id, conversation_id, sender_username, content, created_at)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (client_msg_id) DO NOTHING;`,
                [
                    enrichedMessage.client_msg_id,
                    enrichedMessage.conversation_id,
                    authenticatedUsername,
                    enrichedMessage.content,
                    enrichedMessage.created_at
                ]
            );

            console.log(`Saved to Postgres: ${enrichedMessage.client_msg_id}`);

            if (typeof callback === 'function') {
                callback({
                    success: true,
                    message: "Successfully saved to server"
                });
                console.log(`Acknowledgment sent back to client for msg: ${enrichedMessage.client_msg_id}`);
            }

            socket.broadcast.emit('receive_message', enrichedMessage);
            console.log(`Broadcasted msg to other clients: ${enrichedMessage.client_msg_id}`);

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

// Health check endpoint
app.get('/', (req, res) => {
    res.send('Server is running!');
});