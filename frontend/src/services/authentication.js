const API_URL = 'http://localhost:5000/api/auth';

const TOKEN_KEY = 'chat_app_jwt_token';
const USER_KEY = 'chat_app_user';

export const authService = {
    getToken() {
        return localStorage.getItem(TOKEN_KEY);
    },

    setToken(token) {
        if (token) {
            localStorage.setItem(TOKEN_KEY, token);
        } else {
            localStorage.removeItem(TOKEN_KEY);
        }
    },

    getUser() {
        const user = localStorage.getItem(USER_KEY);
        try {
            return user ? JSON.parse(user) : null;
        } catch {
            return null;
        }
    },

    setUser(user) {
        if (user) {
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(USER_KEY);
        }
    },

    logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    },

    async signup({ username, name, password }) {
        return this.authenticate('signup', { username, name, password });
    },

    async login({ username, password }) {
        return this.authenticate('login', { username, password });
    },

    async authenticate(endpoint, credentials) {
        try {
            const response = await fetch(`${API_URL}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || 'Authentication Failed');
            }

            if (data.token) {
                this.setToken(data.token);
            }
            if (data.user) {
                this.setUser(data.user);
            }

            return data;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Could not connect to server. Ensure backend is running.');
            }
            throw error;
        }
    },

    async verifyToken(token) {
        const authToken = token || this.getToken();
        if (!authToken) {
            throw new Error('No token found');
        }

        const response = await fetch(`${API_URL}/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            this.logout();
            throw new Error(data.message || 'Token verification failed');
        }

        if (data.user) {
            this.setUser(data.user);
        }

        return data;
    }
};