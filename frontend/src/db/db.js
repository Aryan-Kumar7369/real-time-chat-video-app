import Dexie from 'dexie'

export const db = new Dexie('ChatAppOfflineDB')

db.version(1).stores({
    messages: 'client_msg_id, conversation_id, sync_status, created_at'
})