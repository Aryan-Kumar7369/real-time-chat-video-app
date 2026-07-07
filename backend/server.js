import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import Redis from 'ioredis'
import { createAdapter } from '@socket.io/redis-adapter';


// Initialising express and http

const app = express();
app.use(cors());
const server = http.createServer(app);


// Initialising socket.io

const io = new Server(server, {
    cors: {
        origin: "*",
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

    socket.on('send_message', (messageData, callback) => {
    
    console.log(`Message received from ${socket.id}:`, messageData.content);

    
    if (typeof callback === 'function') {
      callback({
        success: true,
        message: "Successfully saved to server"
      });
      console.log(`Acknowledgment sent back to client for msg: ${messageData.client_msg_id}`);
    }
  });
  
    socket.on('ping', () => {
        console.log(`Received ping from: ${socket.id}`);
        socket.emit('pong', {message: 'Hello from socket.io!'});
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});


// Starting the server

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server started at port ${PORT}`);
});


// Listening to the REST API end points

app.get('/', (req, res) => {
    res.send('Server is running!');
});