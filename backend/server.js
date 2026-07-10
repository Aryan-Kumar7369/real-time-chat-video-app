import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import Redis from 'ioredis'
import { createAdapter } from '@socket.io/redis-adapter';
import pg from 'pg';
import 'dotenv/config'

const { Pool } = pg;


// Initialising express and http

const app = express();
app.use(cors());
const server = http.createServer(app);


const pool = new Pool({
    user: process.env.DB_USER,
    host: 'localhost', // Connects to the port mapped by your Docker container
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// 3. Create our messages table if it doesn't exist yet
pool.query(`
  CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    client_msg_id VARCHAR(255) UNIQUE NOT NULL,
    conversation_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
`).then(() => console.log("Postgres 'messages' table ready!"))
    .catch(err => console.error("Postgres Init Error:", err));



// Initialising socket.io

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});


// Setting up Redis publisher and subscriber

const pubClient = new Redis({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();


// Attaching Redis adapter to socket.io

io.adapter(createAdapter(pubClient, subClient));


// Listening for connections

io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    socket.on('send_message', async (messageData, callback) => {

        console.log(`Message received from ${socket.id}:`, messageData.content);

        try {

            await pool.query(
                `INSERT INTO messages (client_msg_id, conversation_id, content, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_msg_id) DO NOTHING;`,
                [
                    messageData.client_msg_id,
                    messageData.conversation_id,
                    messageData.content,
                    messageData.created_at
                ]
            );

            console.log(`Saved to Postgres: ${messageData.client_msg_id}`);


            if (typeof callback === 'function') {
                callback({
                    success: true,
                    message: "Successfully saved to server"
                });
                console.log(`Acknowledgment sent back to client for msg: ${messageData.client_msg_id}`);
            }

            socket.broadcast.emit('receive_message', messageData);
            console.log(`Broadcasted msg to other clients: ${messageData.client_msg_id}`);


        } catch (error) {

            console.error("Database Error:", error);
            if (typeof callback === 'function') {
                callback({ success: false, error: "Database failure" });
            }

        }


    });


    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});


// Starting the server

const PORT = process.env.PORT;
server.listen(PORT, () => {
    console.log(`Server started at port ${PORT}`);
});


// Listening to the REST API end points

app.get('/', (req, res) => {
    res.send('Server is running!');
});