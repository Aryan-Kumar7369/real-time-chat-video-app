import { useState } from "react";
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

export default function ChatRoom({syncManager}) {

    const [inputText, setInputText] = useState('');

    const messages = useLiveQuery(
        () => db.messages.orderBy('created_at').toArray(),
        []
    )
    

    const handleSend = async (e) => {
        e.preventDefault();

        if(!inputText.trim()) return;

        const newMessage = {
            client_msg_id: crypto.randomUUID(),
            conversation_id: 'global_room',
            content: inputText,
            sync_status: 'pending',
            created_at: Date.now(),
        }

        await db.messages.put(newMessage);
        setInputText('');

        syncManager?.processPendingMessages();
    }

    return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h2>Global Chat Room</h2>
      
      {/* Message List */}
      <div style={{ 
        height: '400px', 
        overflowY: 'scroll', 
        border: '1px solid #ccc', 
        padding: '10px',
        marginBottom: '10px',
        borderRadius: '8px'
      }}>
        {messages?.map((msg) => (
          <div key={msg.client_msg_id} style={{ marginBottom: '10px' }}>
            <span style={{ 
              background: '#0b57d0', 
              color: 'white', 
              padding: '8px 12px', 
              borderRadius: '16px',
              display: 'inline-block'
            }}>
              {msg.content}
            </span>
            {/* Status Indicator */}
            <span style={{ fontSize: '0.8em', marginLeft: '8px', color: '#666' }}>
              {msg.sync_status === 'pending' ? '⏳ Sending...' : '✓ Synced'}
            </span>
          </div>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} style={{ display: 'flex', gap: '10px' }}>
        <input 
          type="text" 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <button type="submit" style={{ padding: '10px 20px', cursor: 'pointer' }}>
          Send
        </button>
      </form>
    </div>
  );
}