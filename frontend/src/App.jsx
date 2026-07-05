import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'


// Initialising socket connection for frontend

const socket = io('http://localhost:5000');


function App() {
  
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [pingResponse, setPingResponse] = useState('');

  useEffect(() => {

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

      <button 
        onClick={sendPing}
        style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        disabled={!isConnected}
      >
        Send Ping to Server
      </button>

      {pingResponse && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0f0f0' }}>
          <strong>Server says:</strong> {pingResponse}
        </div>
      )}
    </div>
  );
  
}

export default App
