import { useState, useEffect } from 'react'
import ChatRoom from './components/ChatRoom';
import { startSyncManager } from './services/syncManager';
import Auth from './components/Authenticate'
import ChatDashboard from './components/ChatDashboard';




function App() {
  

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const handleLogin = (username) => {
    // In the future, this will save a token to localStorage
    setCurrentUser(username);
    setIsAuthenticated(true);
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
