/**
 * Store for info command confirmation prompts
 * Stores confirmation data temporarily (1 hour TTL)
 */

interface InfoConfirmation {
  query: string;
  searchType: string;
  userId: string;
  guildId?: string;
  channelId: string;
  messageId: string;
  timestamp: number;
}

const STORE = new Map<string, InfoConfirmation>();
const MESSAGE_PROMPTS = new Map<string, number>(); // Track which messages already have prompts
const TTL = 60 * 60 * 1000; // 1 hour
const PROMPT_COOLDOWN = 5 * 60 * 1000; // 5 minutes - prevent duplicate prompts for same message

/**
 * Check if a message already has a prompt (to prevent duplicates)
 */
export function hasMessagePrompt(messageId: string): boolean {
  const timestamp = MESSAGE_PROMPTS.get(messageId);
  if (!timestamp) {
    return false;
  }
  // Check if cooldown has passed
  if (Date.now() - timestamp > PROMPT_COOLDOWN) {
    MESSAGE_PROMPTS.delete(messageId);
    return false;
  }
  return true;
}

/**
 * Mark a message as having a prompt
 */
export function markMessagePrompt(messageId: string): void {
  MESSAGE_PROMPTS.set(messageId, Date.now());
}

/**
 * Store a confirmation prompt
 */
export function storeInfoConfirmation(customId: string, data: Omit<InfoConfirmation, "timestamp">): void {
  STORE.set(customId, {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * Get confirmation data
 */
export function getInfoConfirmation(customId: string): InfoConfirmation | null {
  const data = STORE.get(customId);
  if (!data) {
    return null;
  }
  
  // Check if expired
  if (Date.now() - data.timestamp > TTL) {
    STORE.delete(customId);
    return null;
  }
  
  return data;
}

/**
 * Remove confirmation data
 */
export function removeInfoConfirmation(customId: string): void {
  STORE.delete(customId);
}

/**
 * Cleanup expired entries (call periodically)
 */
export function cleanupExpiredConfirmations(): void {
  const now = Date.now();
  for (const [key, data] of STORE.entries()) {
    if (now - data.timestamp > TTL) {
      STORE.delete(key);
    }
  }
}

// Cleanup every 30 minutes
setInterval(cleanupExpiredConfirmations, 30 * 60 * 1000);

