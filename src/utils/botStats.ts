import { Client } from "discord.js";

// Track unique users who have used commands
// NOTE: These grow unbounded but are small (just IDs). Could add cleanup if needed.
const uniqueUsers = new Set<string>();
const uniqueTelegramUsers = new Set<number>();
const totalSearches = { count: 0 };
const startTime = Date.now();

// Track response times for commands (in milliseconds)
const responseTimes: number[] = [];
const MAX_RESPONSE_TIMES = 1000; // Keep last 1000 response times for average

// Periodic cleanup to prevent memory bloat
// Clean up old response times every hour
setInterval(() => {
  if (responseTimes.length > MAX_RESPONSE_TIMES) {
    // Keep only the most recent entries
    responseTimes.splice(0, responseTimes.length - MAX_RESPONSE_TIMES);
  }
}, 60 * 60 * 1000); // Every hour

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

export function trackResponseTime(ms: number): void {
  responseTimes.push(ms);
  // Keep only the most recent response times to prevent memory bloat
  if (responseTimes.length > MAX_RESPONSE_TIMES) {
    responseTimes.shift();
  }
}

export function getAverageResponseTime(): number {
  if (responseTimes.length === 0) {
    return 0;
  }
  const sum = responseTimes.reduce((acc, time) => acc + time, 0);
  return Math.round(sum / responseTimes.length);
}

export async function getBotStats(client: Client): Promise<{
  discordServers: number;
  totalUsers: number;
  telegramChats: number;
  telegramTotalMembers: number;
  totalSearches: number;
  uptime: string;
  memoryUsage: string;
  avgResponseTime: string;
}> {
  // Get Discord server count - from Discord.js client cache
  const discordServers = client.guilds.cache.size;

  // Calculate total unique users (Discord + Telegram)
  // Tracked when users run commands (search, etc.)
  const totalUsers = uniqueUsers.size + uniqueTelegramUsers.size;

  // Telegram chats are tracked when bot receives messages from new groups/channels
  const telegramChats = getTelegramChatCount();

  // Get total Telegram members from database (not memory - reduces memory usage)
  const telegramTotalMembers = await getTotalTelegramMembers();

  // Calculate uptime - time since bot started
  const uptimeMs = Date.now() - startTime;
  const uptime = formatUptime(uptimeMs);

  // Get memory usage - from Node.js process
  const memoryUsage = process.memoryUsage();
  const memoryUsageMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  const memoryUsageFormatted = `${memoryUsageMB} MB`;

  // Calculate average response time
  const avgResponseTimeMs = getAverageResponseTime();
  const avgResponseTimeFormatted = formatResponseTime(avgResponseTimeMs);

  return {
    discordServers,
    totalUsers,
    telegramChats,
    telegramTotalMembers,
    totalSearches: totalSearches.count,
    uptime,
    memoryUsage: memoryUsageFormatted,
    avgResponseTime: avgResponseTimeFormatted,
  };
}

// Track Telegram chat count (shared with telegram/index.ts)
// NOTE: Member counts are stored in database, not memory (to reduce memory usage)
let telegramChatCount = 0;

export function setTelegramChatCount(count: number): void {
  telegramChatCount = count;
}

export function getTelegramChatCount(): number {
  return telegramChatCount;
}

// Get total Telegram members from database (not memory)
export async function getTotalTelegramMembers(): Promise<number> {
  try {
    const { env } = await import("../config");
    if (!env.backendUrl) {
      return 0;
    }
    
    // Query database for total members
    const response = await fetch(`${env.backendUrl}/api/seen/telegram-total-members`, {
      signal: AbortSignal.timeout(2000),
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.totalMembers || 0;
    }
  } catch (error) {
    // Silently fail - return 0 if database unavailable
  }
  return 0;
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

function formatResponseTime(ms: number): string {
  if (ms === 0) {
    return "N/A";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

