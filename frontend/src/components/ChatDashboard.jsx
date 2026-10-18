import {
    User, Lock, MessageSquare, UserCircle, ArrowRight,
    Search, MoreVertical, Video, Send, CheckCheck, RefreshCw,
    LogOut, X, Plus, ShieldCheck, UserPlus, MessageCircle
} from 'lucide-react';
import { startSyncManager } from '../services/syncManager';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { io } from 'socket.io-client';
import { useState, useEffect, useRef } from 'react';
import { authService } from '../services/authentication';
import { chatService } from '../services/chatService';

// Initialising socket connection with dynamic JWT auth token
const socket = io('http://localhost:5000', {
    autoConnect: false,
    auth: (cb) => {
        cb({ token: authService.getToken() });
    }
});

export default function ChatDashboard({ currentUser, userData, onLogout }) {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [syncManager, setSyncManager] = useState(null);
    const [inputText, setInputText] = useState('');

    // Search bar states
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);

    // Active 1-on-1 private conversation: { conversationId, participant: { username, name } }
    const [activeConversation, setActiveConversation] = useState(null);

    const messagesScrollEndRef = useRef(null);
    const searchContainerRef = useRef(null);

    // Socket lifecycle & SyncManager init
    useEffect(() => {
        if (!socket.connected) {
            socket.connect();
        }

        const manager = startSyncManager(socket);
        setSyncManager(manager);

        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);
        const onConnectError = (err) => {
            console.error("Socket connection error:", err.message);
            setIsConnected(false);
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);
        };
    }, []);

    // Initial load: sync existing conversations from backend to Dexie
    useEffect(() => {
        const loadPastConversations = async () => {
            try {
                const serverConvs = await chatService.getUserConversations();
                if (serverConvs && serverConvs.length > 0) {
                    for (const conv of serverConvs) {
                        await db.conversations.put({
                            conversation_id: conv.conversation_id,
                            participant_username: conv.participant.username,
                            participant_name: conv.participant.name || conv.participant.username,
                            last_message: conv.last_message,
                            updated_at: conv.updated_at
                        });
                    }
                }
            } catch (err) {
                console.warn("Could not sync server conversations (offline or initial):", err.message);
            }
        };

        loadPastConversations();
    }, []);

    // Fetch conversation message history from server when an active conversation is opened
    useEffect(() => {
        if (!activeConversation?.conversationId) return;

        const loadHistory = async () => {
            try {
                const history = await chatService.getConversationMessages(activeConversation.conversationId);
                if (history && history.length > 0) {
                    await db.messages.bulkPut(
                        history.map((m) => ({
                            client_msg_id: m.client_msg_id,
                            conversation_id: m.conversation_id,
                            client_username: m.sender_username,
                            content: m.content,
                            created_at: Number(m.created_at),
                            sync_status: 'synced'
                        }))
                    );
                }
            } catch (err) {
                console.warn("Could not sync message history from server:", err.message);
            }
        };

        loadHistory();
    }, [activeConversation?.conversationId]);

    // Live queries from Dexie IndexedDB
    const conversations = useLiveQuery(
        () => db.conversations.orderBy('updated_at').reverse().toArray(),
        []
    );

    const messages = useLiveQuery(
        () => {
            if (!activeConversation?.conversationId) return [];
            return db.messages
                .where('conversation_id')
                .equals(activeConversation.conversationId)
                .sortBy('created_at');
        },
        [activeConversation?.conversationId]
    );

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesScrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Search user by exact username
    const executeSearch = async (query) => {
        const cleaned = query.trim().replace(/^@/, '');
        if (!cleaned) {
            setSearchResults([]);
            setIsSearching(false);
            setShowSearchDropdown(false);
            return;
        }

        setIsSearching(true);
        setShowSearchDropdown(true);

        try {
            const results = await chatService.searchUsers(cleaned);
            setSearchResults(results);
        } catch (err) {
            console.error("User search failed:", err);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    // Handle user search debounce
    useEffect(() => {
        const cleaned = searchQuery.trim().replace(/^@/, '');
        if (!cleaned) {
            setSearchResults([]);
            setIsSearching(false);
            setShowSearchDropdown(false);
            return;
        }

        setShowSearchDropdown(true);
        setIsSearching(true);

        const debounceTimer = setTimeout(() => {
            executeSearch(cleaned);
        }, 400);

        return () => clearTimeout(debounceTimer);
    }, [searchQuery]);

    // Close search dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
                setShowSearchDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Start or open private chat with a selected user
    const startChatWith = async (targetUser) => {
        const convId = chatService.getDmConversationId(currentUser, targetUser.username);

        await db.conversations.put({
            conversation_id: convId,
            participant_username: targetUser.username,
            participant_name: targetUser.name || targetUser.username,
            last_message: 'Started private chat',
            updated_at: Date.now()
        });

        setActiveConversation({
            conversationId: convId,
            participant: {
                username: targetUser.username,
                name: targetUser.name || targetUser.username
            }
        });

        setSearchQuery('');
        setSearchResults([]);
        setShowSearchDropdown(false);
    };

    // Format message timestamps
    const formatMessageType = (timestamp) => {
        return new Date(Number(timestamp)).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    // Send private message
    const sendMessage = async (e) => {
        e.preventDefault();

        if (!inputText.trim() || !activeConversation) return;

        const timestamp = Date.now();
        const newMessage = {
            client_msg_id: crypto.randomUUID(),
            client_username: currentUser,
            recipient_username: activeConversation.participant.username,
            conversation_id: activeConversation.conversationId,
            content: inputText.trim(),
            sync_status: 'pending',
            created_at: timestamp,
        };

        // Save locally first for instant offline reactivity
        await db.messages.put(newMessage);

        // Update local conversation preview
        await db.conversations.put({
            conversation_id: activeConversation.conversationId,
            participant_username: activeConversation.participant.username,
            participant_name: activeConversation.participant.name,
            last_message: inputText.trim(),
            updated_at: timestamp
        });

        setInputText('');
        syncManager?.processPendingMessages();
    };

    const onEnterSendMsg = (e) => {
        if (e.key === 'Enter') {
            sendMessage(e);
        }
    };

    const handleLogoutClick = () => {
        socket.disconnect();
        onLogout();
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            {/* Sidebar - Contacts & Chat List */}
            <div className="w-full md:w-1/3 bg-white border-r border-gray-200 flex flex-col">
                {/* User Profile Header */}
                <div className="bg-gray-50 p-4 flex items-center justify-between border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <img
                            src={`https://api.dicebear.com/7.x/identicon/svg?seed=${currentUser}`}
                            alt="avatar"
                            className="w-10 h-10 rounded-full bg-gray-200 border border-gray-300"
                        />
                        <div className="flex flex-col">
                            {userData?.name && (
                                <span className="text-sm font-semibold text-gray-900 leading-tight">
                                    {userData.name}
                                </span>
                            )}
                            <span className="text-xs text-gray-500 font-medium">@{currentUser}</span>
                        </div>
                    </div>
                    <div className="flex gap-3 items-center text-gray-500">
                        {isConnected ? (
                            <div className="flex px-3 py-0.5 rounded-full border transition-colors bg-green-50 text-green-600 border-green-200 items-center">
                                <span className="text-xs font-medium">Online</span>
                            </div>
                        ) : (
                            <div className="flex px-3 py-0.5 rounded-full border transition-colors bg-red-50 text-red-600 border-red-200 items-center">
                                <span className="text-xs font-medium">Offline</span>
                            </div>
                        )}

                        <button
                            onClick={handleLogoutClick}
                            className="p-1 hover:text-red-600 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                            title="Log Out"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Search Bar for Finding Friends by Username */}
                <div className="p-3 border-b border-gray-200 bg-white relative" ref={searchContainerRef}>
                    <div className="relative">
                        <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Enter exact @username..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    executeSearch(searchQuery);
                                }
                            }}
                            onFocus={() => {
                                if (searchQuery.trim()) setShowSearchDropdown(true);
                            }}
                            className="w-full bg-gray-100 text-sm rounded-lg pl-10 pr-9 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setSearchResults([]);
                                    setShowSearchDropdown(false);
                                }}
                                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Search Results Dropdown Overlay */}
                    {showSearchDropdown && (
                        <div className="absolute left-3 right-3 top-14 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-72 overflow-y-auto">
                            <div className="p-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                {isSearching ? 'Checking username...' : 'Exact Username Match'}
                            </div>

                            {isSearching ? (
                                <div className="p-4 text-center text-sm text-gray-500">Verifying username...</div>
                            ) : searchResults.length > 0 ? (
                                searchResults.map((user) => (
                                    <div
                                        key={user.id}
                                        onClick={() => startChatWith(user)}
                                        className="flex items-center justify-between p-3 hover:bg-blue-50 transition-colors cursor-pointer border-b border-gray-50 last:border-0"
                                    >
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={`https://api.dicebear.com/7.x/identicon/svg?seed=${user.username}`}
                                                alt="avatar"
                                                className="w-9 h-9 rounded-full bg-blue-100"
                                            />
                                            <div>
                                                <p className="text-sm font-semibold text-gray-800">
                                                    {user.name || user.username}
                                                </p>
                                                <p className="text-xs text-blue-600 font-medium">@{user.username}</p>
                                            </div>
                                        </div>
                                        <button className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors font-medium">
                                            <MessageCircle className="w-3.5 h-3.5" />
                                            <span>Chat</span>
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="p-4 text-center text-sm text-gray-500">
                                    <p className="font-medium text-gray-700">No user found</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Full username must match exactly (e.g. &quot;@{searchQuery.trim().replace(/^@/, '')}&quot;)
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Private Conversations List */}
                <div className="flex-1 overflow-y-auto">
                    {conversations && conversations.length > 0 ? (
                        conversations.map((conv) => {
                            const isSelected = activeConversation?.conversationId === conv.conversation_id;
                            return (
                                <div
                                    key={conv.conversation_id}
                                    onClick={() =>
                                        setActiveConversation({
                                            conversationId: conv.conversation_id,
                                            participant: {
                                                username: conv.participant_username,
                                                name: conv.participant_name
                                            }
                                        })
                                    }
                                    className={`flex items-center gap-3.5 p-3.5 cursor-pointer border-b border-gray-100 transition-colors ${
                                        isSelected
                                            ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                                            : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <img
                                        src={`https://api.dicebear.com/7.x/identicon/svg?seed=${conv.participant_username}`}
                                        alt="avatar"
                                        className="w-12 h-12 rounded-full bg-blue-100 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline mb-0.5">
                                            <h3 className="font-semibold text-gray-800 truncate text-sm">
                                                {conv.participant_name || conv.participant_username}
                                            </h3>
                                            <span className="text-[11px] text-gray-400 shrink-0">
                                                {conv.updated_at ? formatMessageType(conv.updated_at) : ''}
                                            </span>
                                        </div>
                                        <p className="text-xs text-blue-500 font-medium mb-0.5">
                                            @{conv.participant_username}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">
                                            {conv.last_message || 'No messages yet'}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="p-8 text-center text-gray-500 flex flex-col items-center justify-center h-full">
                            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-3">
                                <UserPlus className="w-7 h-7" />
                            </div>
                            <h4 className="font-semibold text-gray-800 mb-1">No chats yet</h4>
                            <p className="text-xs text-gray-500 max-w-xs">
                                Use the search bar above to search for a friend by username and start a private chat.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Chat View */}
            <div className="hidden md:flex flex-1 flex-col bg-[#efeae2]">
                {activeConversation ? (
                    <>
                        {/* Chat Header */}
                        <div className="bg-gray-50 p-4 flex items-center justify-between border-b border-gray-200">
                            <div className="flex items-center gap-3">
                                <img
                                    src={`https://api.dicebear.com/7.x/identicon/svg?seed=${activeConversation.participant.username}`}
                                    alt="avatar"
                                    className="w-10 h-10 rounded-full bg-blue-100"
                                />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-gray-800">
                                            {activeConversation.participant.name || activeConversation.participant.username}
                                        </span>
                                        <span className="flex items-center gap-1 text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                            <ShieldCheck className="w-3 h-3" />
                                            Private
                                        </span>
                                    </div>
                                    <span className="text-xs text-blue-600">
                                        @{activeConversation.participant.username}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-4 text-gray-500 items-center">
                                <button className="text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full transition-colors cursor-pointer">
                                    <Video className="w-4 h-4" />
                                    <span className="text-sm font-medium">Video Call</span>
                                </button>
                                <MoreVertical className="w-5 h-5 cursor-pointer hover:text-gray-700" />
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-3">
                            {messages && messages.length > 0 ? (
                                messages.map((msg) =>
                                    msg.client_username === currentUser ? (
                                        <div key={msg.client_msg_id} className="flex justify-end">
                                            <div className="bg-[#d9fdd3] text-gray-800 p-2.5 rounded-lg max-w-sm shadow-sm relative">
                                                <p className="text-sm break-words">{msg.content}</p>
                                                <div className="flex justify-end items-center gap-1.5 mt-1">
                                                    <span className="text-[10px] text-gray-500">
                                                        {formatMessageType(msg.created_at)}
                                                    </span>
                                                    {msg.sync_status === 'pending' ? (
                                                        <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" />
                                                    ) : (
                                                        <CheckCheck className="w-4 h-4 text-blue-600" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div key={msg.client_msg_id} className="flex justify-start">
                                            <div className="bg-white text-gray-800 p-2.5 rounded-lg max-w-sm shadow-sm relative">
                                                <p className="text-sm break-words">{msg.content}</p>
                                                <span className="text-[10px] text-gray-500 flex justify-end mt-1">
                                                    {formatMessageType(msg.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                )
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-2 text-blue-600">
                                        <Lock className="w-6 h-6" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-700">Private Conversation</p>
                                    <p className="text-xs text-gray-500 max-w-xs mt-1">
                                        Say hello to @{activeConversation.participant.username}! Messages sent here are only visible to the two of you.
                                    </p>
                                </div>
                            )}

                            <div ref={messagesScrollEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="bg-gray-50 p-4 flex items-center gap-4 border-t border-gray-200">
                            <input
                                type="text"
                                placeholder={`Message @${activeConversation.participant.username}...`}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={onEnterSendMsg}
                                className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                            <button
                                className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 transition-colors cursor-pointer disabled:bg-gray-300"
                                onClick={sendMessage}
                                disabled={!inputText.trim()}
                            >
                                <Send className="w-5 h-5 ml-0.5" />
                            </button>
                        </div>
                    </>
                ) : (
                    /* Empty Welcome State when no conversation is selected */
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
                        <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
                            <MessageSquare className="w-10 h-10" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">Private Real-Time Messaging</h2>
                        <p className="text-sm text-gray-500 max-w-sm mb-6">
                            Search for any friend by their username in the search bar on the left to start an exclusive private conversation.
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/70 px-3 py-1.5 rounded-full border border-gray-200">
                            <ShieldCheck className="w-4 h-4 text-green-600" />
                            <span>1-on-1 conversations are strictly confidential and private</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}