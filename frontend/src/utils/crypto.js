import CryptoJS from 'crypto-js';

// Retrieve or derive the local AES encryption key for the current authenticated user
export const getLocalEncryptionKey = () => {
    const token = localStorage.getItem('chat_app_jwt_token') || 'local_secure_fallback';
    const userRaw = localStorage.getItem('chat_app_user');
    let username = 'guest';
    try {
        if (userRaw) username = JSON.parse(userRaw).username || 'guest';
    } catch {
        // fallback
    }

    // Derive deterministic key unique to this user & session
    return CryptoJS.SHA256(`client_storage_key_${username}_${token}`).toString();
};

// Encrypt plaintext before storing in IndexedDB (DevTools inspection protection)
export const encryptForStorage = (plainText) => {
    if (!plainText && plainText !== '') return '';
    const key = getLocalEncryptionKey();
    try {
        return CryptoJS.AES.encrypt(String(plainText), key).toString();
    } catch (err) {
        console.error("Local storage encryption error:", err);
        return plainText;
    }
};

// Decrypt ciphertext read from IndexedDB for UI presentation
export const decryptFromStorage = (cipherText) => {
    if (!cipherText) return '';
    // If not encrypted (e.g. legacy plain message), return as-is
    if (typeof cipherText !== 'string' || !cipherText.startsWith('U2FsdGVkX1')) {
        return cipherText;
    }

    const key = getLocalEncryptionKey();
    try {
        const bytes = CryptoJS.AES.decrypt(cipherText, key);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        return originalText || cipherText;
    } catch (err) {
        console.error("Local storage decryption error:", err);
        return cipherText;
    }
};
