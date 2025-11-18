import crypto from "crypto";

// Encryption key from environment (fallback to a default for dev, but warn)
// This is used in both bot and backend, so we read directly from env
const ENCRYPTION_KEY = process.env.SIGNER_ENCRYPTION_KEY || "dev-key-change-in-production-32chars!!";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

if (!process.env.SIGNER_ENCRYPTION_KEY) {
  console.warn(
    "[SignerEncryption] ⚠️ WARNING: Using default encryption key! Set SIGNER_ENCRYPTION_KEY in production!",
  );
}

/**
 * Derives a key from the encryption key using PBKDF2
 */
function deriveKey(salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, "sha512");
}

/**
 * Encrypts a signer private key
 */
export function encryptSigner(privateKey: string): string {
  try {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(privateKey, "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();

    // Combine: salt + iv + tag + encrypted
    const result = Buffer.concat([salt, iv, tag, encrypted]);

    return result.toString("base64");
  } catch (error) {
    console.error("[SignerEncryption] Failed to encrypt signer:", error);
    throw new Error("Failed to encrypt signer private key");
  }
}

/**
 * Decrypts a signer private key
 */
export function decryptSigner(encryptedKey: string): string {
  try {
    const data = Buffer.from(encryptedKey, "base64");

    // Extract components
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, TAG_POSITION);
    const tag = data.subarray(TAG_POSITION, ENCRYPTED_POSITION);
    const encrypted = data.subarray(ENCRYPTED_POSITION);

    const key = deriveKey(salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  } catch (error) {
    console.error("[SignerEncryption] Failed to decrypt signer:", error);
    throw new Error("Failed to decrypt signer private key - key may be corrupted or wrong encryption key");
  }
}

/**
 * Validates that a private key is a valid Ethereum private key
 */
export function validatePrivateKey(privateKey: string): boolean {
  try {
    // Remove 0x prefix if present
    const cleanKey = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;

    // Must be 64 hex characters
    if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
      return false;
    }

    // Try to create a wallet to validate
    const { Wallet } = require("ethers");
    new Wallet("0x" + cleanKey);

    return true;
  } catch {
    return false;
  }
}

/**
 * Tests if a signer can sign a message (validates the signer works)
 */
export async function testSigner(privateKey: string): Promise<{ address: string; publicKey: string }> {
  try {
    const { Wallet } = require("ethers");
    const wallet = new Wallet(privateKey);

    // Test signature
    const testMessage = "Farcaster Bot Signer Test";
    await wallet.signMessage(testMessage);

    return {
      address: wallet.address,
      publicKey: wallet.publicKey,
    };
  } catch (error) {
    console.error("[SignerEncryption] Failed to test signer:", error);
    throw new Error("Signer validation failed - private key may be invalid");
  }
}

