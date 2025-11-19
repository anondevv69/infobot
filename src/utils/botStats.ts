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
  telegramTotalMembers: number;
  totalSearches: number;
  uptime: string;
  memoryUsage: string;
}> {
  // Get Discord server count - from Discord.js client cache
  const discordServers = client.guilds.cache.size;

  // Calculate total unique users (Discord + Telegram)
  // Tracked when users run commands (search, etc.)
  const totalUsers = uniqueUsers.size + uniqueTelegramUsers.size;

  // Telegram chats are tracked when bot receives messages from new groups/channels
  const telegramChats = getTelegramChatCount();

  // Get total Telegram members across all chats
  const telegramTotalMembers = getTotalTelegramMembers();

  // Calculate uptime - time since bot started
  const uptimeMs = Date.now() - startTime;
  const uptime = formatUptime(uptimeMs);

  // Get memory usage - from Node.js process
  const memoryUsage = process.memoryUsage();
  const memoryUsageMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  const memoryUsageFormatted = `${memoryUsageMB} MB`;

  return {
    discordServers,
    totalUsers,
    telegramChats,
    telegramTotalMembers,
    totalSearches: totalSearches.count,
    uptime,
    memoryUsage: memoryUsageFormatted,
  };
}

// Track Telegram chat count and member counts (shared with telegram/index.ts)
let telegramChatCount = 0;
const telegramChatMembers = new Map<number, number>(); // chatId -> memberCount

export function setTelegramChatCount(count: number): void {
  telegramChatCount = count;
}

export function getTelegramChatCount(): number {
  return telegramChatCount;
}

export function setTelegramChatMembers(chatId: number, memberCount: number): void {
  telegramChatMembers.set(chatId, memberCount);
}

export function getTotalTelegramMembers(): number {
  // Sum up all unique members across all Telegram chats
  // Note: This might double-count users who are in multiple groups
  let total = 0;
  for (const count of telegramChatMembers.values()) {
    total += count;
  }
  return total;
}

export function getTelegramChatMembersMap(): Map<number, number> {
  return new Map(telegramChatMembers);
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

