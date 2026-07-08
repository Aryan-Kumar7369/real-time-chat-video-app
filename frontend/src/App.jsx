import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import ChatRoom from './components/ChatRoom';
import { startSyncManager } from './services/syncManager';
import Auth from './components/Authenticate'
import ChatDashboard from './components/ChatDashboard';


// Initialising socket connection for frontend

const socket = io('http://localhost:5000');


function App() {
  
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [pingResponse, setPingResponse] = useState('');
  const [syncManager, setSyncManager] = useState(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const handleLogin = (username) => {
    // In the future, this will save a token to localStorage
    setCurrentUser(username);
    setIsAuthenticated(true);
  };

  

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

  // 1. If not logged in, show the beautiful Tailwind Auth screen
  if (!isAuthenticated) {
    return <Auth onAuthenticate={handleLogin} />;
  }

  return (
    <ChatDashboard currentUser={currentUser} />
  );
  
}

export default App
