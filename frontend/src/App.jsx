import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import ChatRoom from './components/ChatRoom';
import { startSyncManager } from './services/syncManager';


// Initialising socket connection for frontend

const socket = io('http://localhost:5000');


function App() {
  
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [pingResponse, setPingResponse] = useState('');
  const [syncManager, setSyncManager] = useState(null);

  useEffect(() => {

    const manager = startSyncManager(socket);
    setSyncManager(manager);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onPong = () => setPingResponse(data.message);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('pong', onPong);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('pong', onPong);
    };
  }, []);

  const sendPing = () => {
    socket.emit('ping');
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Real-Time Chat Infrastructure Test</h1>
      
      <div style={{ marginBottom: '1rem' }}>
        <strong>Status: </strong> 
        <span style={{ color: isConnected ? 'green' : 'red' }}>
          {isConnected ? '🟢 Connected to Server' : '🔴 Disconnected'}
        </span>
      </div>

      <ChatRoom syncManager={ syncManager } />
    </div>
  );
  
}

export default App
