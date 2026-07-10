import { User, Lock, MessageSquare, UserCircle, ArrowRight, Search, MoreVertical, Video, Send, CheckCheck, RefreshCw } from 'lucide-react';
import { startSyncManager } from '../services/syncManager';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { io } from 'socket.io-client'
import { useState, useEffect, useRef } from 'react'



// Initialising socket connection for frontend

const socket = io('http://localhost:5000');


export default function ChatDashboard({ currentUser }) {

    const [isConnected, setIsConnected] = useState(socket.connected);
    const [syncManager, setSyncManager] = useState(null);

    const [inputText, setInputText] = useState('');

    const messagesScrollEndRef = useRef(null);

    useEffect(() => {

        const manager = startSyncManager(socket);
        setSyncManager(manager);

        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, []);

    const messages = useLiveQuery(
        () => db.messages.orderBy('created_at').toArray(),
        []
    )

    useEffect(() => {
        messagesScrollEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const formatMessageType = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        })
    }

    const sendMessage = async (e) => {
        e.preventDefault();

        if (!inputText.trim()) return;

        const newMessage = {
            client_msg_id: crypto.randomUUID(),
            client_username: currentUser,
            conversation_id: 'global_room',
            content: inputText,
            sync_status: 'pending',
            created_at: Date.now(),
        }

        await db.messages.put(newMessage);
        setInputText('');

        syncManager?.processPendingMessages();
    }

    const onEnterSendMsg = (e) => {
        if(e.key === 'Enter') {
            sendMessage(e);
        }
    }

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            {/* Sidebar - Chat List */}
            <div className="w-full md:w-1/3 bg-white border-r border-gray-200 flex flex-col">
                {/* User Profile Header */}
                <div className="bg-gray-50 p-4 flex items-center justify-between border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <img
                            src={`https://api.dicebear.com/7.x/identicon/svg?seed=${currentUser}`}
                            alt="avatar"
                            className="w-10 h-10 rounded-full bg-gray-200"
                        />
                        <span className="font-semibold text-gray-800">@{currentUser}</span>
                    </div>
                    <div className="flex gap-4 text-gray-500">
                        <MessageSquare className="w-5 h-5 cursor-pointer hover:text-gray-700" />
                        <MoreVertical className="w-5 h-5 cursor-pointer hover:text-gray-700" />
                    </div>
                </div>

                {/* Search Bar */}
                <div className="p-3 border-b border-gray-200 bg-white">
                    <div className="relative">
                        <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search or start new chat"
                            className="w-full bg-gray-100 text-sm rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Chat List (Mocked for now) */}
                <div className="flex-1 overflow-y-auto">
                    <div className="flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 bg-gray-50">
                        <img
                            src="https://api.dicebear.com/7.x/identicon/svg?seed=GlobalRoom"
                            alt="group"
                            className="w-12 h-12 rounded-full bg-blue-100"
                        />
                        <div className="flex-1">
                            <div className="flex justify-between items-center">
                                <h3 className="font-semibold text-gray-800">Global Chat Room</h3>
                                <span className="text-xs text-gray-500">Now</span>
                            </div>
                            <p className="text-sm text-gray-500 truncate">Tap here to join the conversation!</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Chat View */}
            <div className="hidden md:flex flex-1 flex-col bg-[#efeae2]">
                {/* Chat Header */}
                <div className="bg-gray-50 p-4 flex items-center justify-between border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <img
                            src="https://api.dicebear.com/7.x/identicon/svg?seed=GlobalRoom"
                            alt="group"
                            className="w-10 h-10 rounded-full bg-blue-100"
                        />
                        <span className="font-semibold text-gray-800">Global Chat Room</span>
                    </div>
                    <div className="flex gap-4 text-gray-500 items-center">
                        <button className="text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full transition-colors">
                            <Video className="w-4 h-4" />
                            <span className="text-sm font-medium">Video Call</span>
                        </button>
                        <Search className="w-5 h-5 cursor-pointer hover:text-gray-700 ml-2" />
                        <MoreVertical className="w-5 h-5 cursor-pointer hover:text-gray-700" />
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Sent Message */}

                    {messages?.map((msg) => (
                        (msg.client_username === currentUser) ?
                            <div key={msg.client_msg_id} className="flex justify-end">
                                <div className="bg-[#d9fdd3] text-gray-800 p-2.5 rounded-lg max-w-sm shadow-sm relative">
                                    <p className="text-sm">{msg.content}</p>
                                    <div className='flex justify-end items-center gap-2'>
                                        <span className="text-[10px] text-gray-500 flex justify-end mt-1">{formatMessageType(msg.created_at)}</span>
                                        {msg.sync_status === 'pending' ? <RefreshCw className="w-4 h-4" /> : <CheckCheck className="w-5 h-5" />}
                                    </div>

                                </div>
                            </div>
                            :
                            <div key={msg.client_msg_id} className="flex justify-start">
                                <div className="bg-white text-gray-800 p-2.5 rounded-lg max-w-sm shadow-sm relative">
                                    <p className="text-sm font-semibold text-blue-500 mb-1">@{msg.client_username}</p>
                                    <p className="text-sm">{msg.content}</p>
                                    <span className="text-[10px] text-gray-500 flex justify-end mt-1">{formatMessageType(msg.created_at)}</span>
                                </div>
                            </div>
                    ))}

                    {/* useRef for Scroling the messages screen to bottom */}
                    <div ref={messagesScrollEndRef} />

                </div>

                {/* Input Area */}
                <div className="bg-gray-50 p-4 flex items-center gap-4 border-t border-gray-200">
                    <input
                        type="text"
                        placeholder="Type a message"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={onEnterSendMsg}
                        className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 transition-colors cursor-pointer" 
                    onClick={sendMessage}
                    >
                        <Send className="w-5 h-5 ml-0.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}