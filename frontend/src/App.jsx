import { useState, useEffect } from 'react';
import Auth from './components/Authenticate';
import ChatDashboard from './components/ChatDashboard';
import { authService } from './services/authentication';
import { Loader2 } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Check for existing session on app load
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = authService.getToken();
      const storedUser = authService.getUser();

      if (!storedToken || !storedUser) {
        setIsInitializing(false);
        return;
      }

      try {
        // Optimistically set user from localStorage
        setCurrentUser(storedUser.username);
        setUserData(storedUser);
        setIsAuthenticated(true);

        // Verify token in the background
        const verified = await authService.verifyToken(storedToken);
        if (verified?.user) {
          setCurrentUser(verified.user.username);
          setUserData(verified.user);
        }
      } catch (err) {
        console.warn("Session expired or invalid token:", err.message);
        authService.logout();
        setIsAuthenticated(false);
        setCurrentUser(null);
        setUserData(null);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeAuth();
  }, []);

  const handleLogin = (user, token) => {
    setCurrentUser(user.username);
    setUserData(user);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setUserData(null);
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
        <p className="text-gray-500 text-sm">Loading your chats...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Auth onAuthenticate={handleLogin} />;
  }

  return (
    <ChatDashboard
      currentUser={currentUser}
      userData={userData}
      onLogout={handleLogout}
    />
  );
}

export default App;
