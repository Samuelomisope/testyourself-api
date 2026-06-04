import CryptoJS from "crypto-js";

const SECRET_KEY = "testyourself-chat-secret-2026"; // shared key

export function encryptMessage(text) {
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
}

export function decryptMessage(cipherText) {
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted || cipherText; // fallback to original if decryption fails
  } catch {
    return cipherText; // return as-is if not encrypted
  }
}