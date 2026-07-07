import { db } from '../db/db';


export const startSyncManager = (socket) => {
  
  // 1. Define the actual function
  const processPendingMessages = async () => {
    try {
      
      const pendingMessages = await db.messages
        .filter(msg => msg.sync_status === 'pending')
        .toArray();

      if (pendingMessages.length === 0) return; 

      console.log(`Attempting to sync ${pendingMessages.length} messages...`);

      
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

  
  return {
    processPendingMessages
  };
};