import Dexie from 'dexie';

export const db = new Dexie('ChatAppOfflineDB');

db.version(1).stores({
    messages: 'client_msg_id, conversation_id, sync_status, created_at'
});

db.version(2).stores({
    messages: 'client_msg_id, conversation_id, sync_status, created_at',
    conversations: 'conversation_id, participant_username, updated_at'
});