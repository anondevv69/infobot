import { Client } from "discord.js";

// Track unique users who have used commands
const uniqueUsers = new Set<string>();
const uniqueTelegramUsers = new Set<number>();
const totalSearches = { count: 0 };
const startTime = Date.now();

export function trackUser(userId: string, platform: "discord" | "telegram"): void {
  if (platform === "discord") {
    uniqueUsers.add(userId);
  } else {
    uniqueTelegramUsers.add(Number(userId));
  }
}

export function trackSearch(): void {
  totalSearches.count++;
}

export async function getBotStats(client: Client): Promise<{
  discordServers: number;
  totalUsers: number;
  telegramChats: number;
  totalSearches: number;
  uptime: string;
  memoryUsage: string;
}> {
  // Get Discord server count
  const discordServers = client.guilds.cache.size;

  // Calculate total unique users (Discord + Telegram)
  const totalUsers = uniqueUsers.size + uniqueTelegramUsers.size;

  // Telegram chats are tracked in telegram/index.ts
  // We'll need to import that or track it here
  // For now, we'll estimate or get it from a shared state
  const telegramChats = getTelegramChatCount();

  // Calculate uptime
  const uptimeMs = Date.now() - startTime;
  const uptime = formatUptime(uptimeMs);

  // Get memory usage
  const memoryUsage = process.memoryUsage();
  const memoryUsageMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  const memoryUsageFormatted = `${memoryUsageMB} MB`;

  return {
    discordServers,
    totalUsers,
    telegramChats,
    totalSearches: totalSearches.count,
    uptime,
    memoryUsage: memoryUsageFormatted,
  };
}

// Track Telegram chat count (shared with telegram/index.ts)
let telegramChatCount = 0;

export function setTelegramChatCount(count: number): void {
  telegramChatCount = count;
}

export function getTelegramChatCount(): number {
  return telegramChatCount;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

