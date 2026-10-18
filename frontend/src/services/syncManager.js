import { db } from '../db/db';

export const startSyncManager = (socket) => {

  const processPendingMessages = async () => {
    try {
      const pendingMessages = await db.messages
        .filter(msg => msg.sync_status === 'pending')
        .toArray();

      if (pendingMessages.length === 0) return;

      console.log(`Attempting to sync ${pendingMessages.length} pending messages...`);

      for (const msg of pendingMessages) {
        socket.emit('send_message', msg, async (serverResponse) => {
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
    console.log("Received new message from server:", incomingMsg.content);
    try {
      await db.messages.put({
        ...incomingMsg,
        sync_status: 'synced'
      });

      // Update conversations list in Dexie
      if (incomingMsg.conversation_id) {
        const existingConv = await db.conversations.get(incomingMsg.conversation_id);
        const sender = incomingMsg.client_username;
        await db.conversations.put({
          conversation_id: incomingMsg.conversation_id,
          participant_username: existingConv?.participant_username || sender,
          participant_name: existingConv?.participant_name || sender,
          last_message: incomingMsg.content,
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