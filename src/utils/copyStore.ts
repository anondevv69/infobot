import { randomBytes } from "crypto";

interface CopyPayload {
  label: string;
  value: string;
  expiresAt: number;
}

const STORE = new Map<string, CopyPayload>();
const TTL_MS = 1000 * 60 * 60; // 1 hour

function sweep(): void {
  const now = Date.now();
  for (const [key, payload] of STORE.entries()) {
    if (payload.expiresAt <= now) {
      STORE.delete(key);
    }
  }
}

export function registerCopyValue(label: string, value: string): string {
  sweep();
  const key = randomBytes(6).toString("base64url");
  STORE.set(key, {
    label,
    value,
    expiresAt: Date.now() + TTL_MS,
  });
  return key;
}

export function getCopyValue(key: string): CopyPayload | null {
  const payload = STORE.get(key);
  if (!payload) {
    return null;
  }
  if (payload.expiresAt <= Date.now()) {
    STORE.delete(key);
    return null;
  }
  return payload;
}
