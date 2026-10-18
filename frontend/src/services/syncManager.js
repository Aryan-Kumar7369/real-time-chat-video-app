import { db } from '../db/db';
import { encryptForStorage, decryptFromStorage } from '../utils/crypto';

export const startSyncManager = (socket) => {

  const processPendingMessages = async () => {
    try {
      const pendingMessages = await db.messages
        .filter(msg => msg.sync_status === 'pending')
        .toArray();

      if (pendingMessages.length === 0) return;

      console.log(`Attempting to sync ${pendingMessages.length} pending messages...`);

      for (const msg of pendingMessages) {
        // Decrypt the locally encrypted content before transmitting over the secure socket
        const plainContent = decryptFromStorage(msg.content);

        const payload = {
          ...msg,
          content: plainContent
        };

        socket.emit('send_message', payload, async (serverResponse) => {
          if (serverResponse && serverResponse.success) {
            await db.messages.update(msg.client_msg_id, {
              sync_status: 'synced'
            });
            console.log(`Message ${msg.client_msg_id} synced successfully!`);
          }
        });
      }
    } catch (error) {
      console.error("Error in Sync Manager:", error);
    }
  };

  if (socket.connected) {
    console.log("Socket is connected. Running initial sync...");
    processPendingMessages();
  }

  // Listen for socket reconnections
  socket.on('connect', () => {
    console.log("Socket reconnected! Syncing pending messages...");
    processPendingMessages();
  });

  // Listen for incoming private messages
  socket.on('receive_message', async (incomingMsg) => {
    console.log("Received new private message from server");
    try {
      // Encrypt before saving to IndexedDB so DevTools inspector never sees plain text
      const encryptedContent = encryptForStorage(incomingMsg.content);

      await db.messages.put({
        ...incomingMsg,
        content: encryptedContent,
        sync_status: 'synced'
      });

      // Update conversations list in Dexie with encrypted preview
      if (incomingMsg.conversation_id) {
        const existingConv = await db.conversations.get(incomingMsg.conversation_id);
        const sender = incomingMsg.client_username;
        await db.conversations.put({
          conversation_id: incomingMsg.conversation_id,
          participant_username: existingConv?.participant_username || sender,
          participant_name: existingConv?.participant_name || sender,
          last_message: encryptedContent,
          updated_at: incomingMsg.created_at || Date.now()
        });
      }
    } catch (error) {
      console.error("Error saving incoming message to Dexie:", error);
    }
  });

  return {
    processPendingMessages
  };
};