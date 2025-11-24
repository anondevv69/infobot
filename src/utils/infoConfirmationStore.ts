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
const TTL = 60 * 60 * 1000; // 1 hour

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

