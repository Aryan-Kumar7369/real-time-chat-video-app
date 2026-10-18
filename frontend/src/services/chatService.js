import { authService } from './authentication';

const API_BASE_URL = 'http://localhost:5000/api';

export const chatService = {
    // Generate deterministic 1-on-1 private room ID
    getDmConversationId(user1, user2) {
        return 'dm:' + [user1.toLowerCase(), user2.toLowerCase()].sort().join(':');
    },

    // Search users by username or name
    async searchUsers(query) {
        const token = authService.getToken();
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to search users');
        }

        return data.users || [];
    },

    // Fetch past conversations for the current user
    async getUserConversations() {
        const token = authService.getToken();
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(`${API_BASE_URL}/conversations`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch conversations');
        }

        return data.conversations || [];
    },

    // Fetch messages for a specific conversation
    async getConversationMessages(conversationId) {
        const token = authService.getToken();
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(`${API_BASE_URL}/messages/${encodeURIComponent(conversationId)}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch messages');
        }

        return data.messages || [];
    }
};
