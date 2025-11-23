/**
 * Bot Capacity Monitoring Tool
 * 
 * Monitors the bot's current capacity and limits:
 * - Active Discord servers/guilds
 * - Active Telegram chats
 * - Memory usage
 * - Response times
 * - API rate limits
 * 
 * Usage: npm run monitor-capacity
 */

import { config } from "dotenv";
import { REST, Routes } from "discord.js";

config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;

interface CapacityMetrics {
  timestamp: Date;
  discord: {
    guilds: number;
    users: number;
    shards: number;
  };
  telegram: {
    chats: number;
    users: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  performance: {
    averageResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
  };
  limits: {
    discordRateLimit: {
      remaining: number;
      resetAt: number;
    };
    memoryLimit: number; // MB
    concurrentRequests: number;
  };
}

class CapacityMonitor {
  private metrics: CapacityMetrics[] = [];
  private isMonitoring = false;

  async startMonitoring(intervalMs: number = 5000): Promise<void> {
    this.isMonitoring = true;
    console.log("📊 Starting Capacity Monitoring...");
    console.log(`   Monitoring interval: ${intervalMs}ms\n`);

    while (this.isMonitoring) {
      try {
        const metrics = await this.collectMetrics();
        this.metrics.push(metrics);
        this.printMetrics(metrics);
        
        // Keep only last 100 metrics
        if (this.metrics.length > 100) {
          this.metrics.shift();
        }
      } catch (error) {
        console.error("❌ Error collecting metrics:", error);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    console.log("\n⏹️  Monitoring stopped");
    this.printSummary();
  }

  private async collectMetrics(): Promise<CapacityMetrics> {
    const memory = process.memoryUsage();
    
    // Get Discord guild count (if possible)
    let discordGuilds = 0;
    let discordUsers = 0;
    
    if (DISCORD_TOKEN && DISCORD_CLIENT_ID) {
      try {
        const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
        // Note: Discord API doesn't provide a direct way to get all guilds
        // This would require the bot to be running and tracking guilds
        // For now, we'll estimate based on common limits
        discordGuilds = 0; // Would need to track this in the bot
        discordUsers = 0; // Would need to track this in the bot
      } catch (error) {
        // Ignore - bot might not be running
      }
    }

    return {
      timestamp: new Date(),
      discord: {
        guilds: discordGuilds,
        users: discordUsers,
        shards: 1, // Single shard for now
      },
      telegram: {
        chats: 0, // Would need to track this in the bot
        users: 0, // Would need to track this in the bot
      },
      memory: {
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
        rss: memory.rss,
      },
      performance: {
        averageResponseTime: 0, // Would need to track this
        requestsPerSecond: 0, // Would need to track this
        errorRate: 0, // Would need to track this
      },
      limits: {
        discordRateLimit: {
          remaining: 50, // Estimated
          resetAt: Date.now() + 60000, // Estimated
        },
        memoryLimit: 512, // MB - Railway free tier limit
        concurrentRequests: 100, // Estimated safe limit
      },
    };
  }

  private printMetrics(metrics: CapacityMetrics): void {
    const formatBytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";
    const formatPercent = (used: number, total: number) => ((used / total) * 100).toFixed(2) + "%";

    console.log(`\n⏰ ${metrics.timestamp.toLocaleTimeString()}`);
    console.log(`📊 Capacity Metrics:`);
    console.log(`   Discord: ${metrics.discord.guilds} guilds, ${metrics.discord.users} users`);
    console.log(`   Telegram: ${metrics.telegram.chats} chats, ${metrics.telegram.users} users`);
    console.log(`   Memory: ${formatBytes(metrics.memory.heapUsed)} / ${formatBytes(metrics.memory.heapTotal)} (${formatPercent(metrics.memory.heapUsed, metrics.memory.heapTotal)})`);
    console.log(`   RSS: ${formatBytes(metrics.memory.rss)}`);
    
    if (metrics.memory.heapUsed / 1024 / 1024 > metrics.limits.memoryLimit * 0.8) {
      console.log(`   ⚠️  WARNING: Memory usage is above 80% of limit!`);
    }
  }

  private printSummary(): void {
    if (this.metrics.length === 0) {
      return;
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 MONITORING SUMMARY");
    console.log("=".repeat(60));

    const memoryUsages = this.metrics.map((m) => m.memory.heapUsed);
    const maxMemory = Math.max(...memoryUsages);
    const minMemory = Math.min(...memoryUsages);
    const avgMemory = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;

    const formatBytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";

    console.log(`\n💾 Memory Statistics:`);
    console.log(`   Min: ${formatBytes(minMemory)}`);
    console.log(`   Max: ${formatBytes(maxMemory)}`);
    console.log(`   Average: ${formatBytes(avgMemory)}`);
    console.log(`   Samples: ${this.metrics.length}`);

    console.log("\n" + "=".repeat(60));
  }
}

// Estimated limits based on Railway free tier and Discord/Telegram API limits
function printEstimatedLimits(): void {
  console.log("📋 ESTIMATED BOT CAPACITY LIMITS");
  console.log("=".repeat(60));
  console.log("\n🚀 Discord:");
  console.log("   Max Guilds: ~100 (Discord API limit: 100 guilds per bot)");
  console.log("   Max Users: ~10,000 (estimated based on guild capacity)");
  console.log("   Rate Limit: 50 requests/second");
  console.log("   Concurrent Requests: ~100 (safe limit)");

  console.log("\n📱 Telegram:");
  console.log("   Max Chats: Unlimited (no hard limit)");
  console.log("   Max Users: Unlimited (no hard limit)");
  console.log("   Rate Limit: 30 messages/second per chat");
  console.log("   Concurrent Requests: ~50 (safe limit)");

  console.log("\n💾 Memory (Railway Free Tier):");
  console.log("   Limit: 512 MB");
  console.log("   Recommended Max: 400 MB (80%)");
  console.log("   Current Usage: Check with monitoring");

  console.log("\n⏱️  Performance:");
  console.log("   Average Response Time: < 2 seconds (target)");
  console.log("   Max Response Time: < 5 seconds (acceptable)");
  console.log("   Timeout: 10 seconds (hard limit)");

  console.log("\n🔗 API Limits:");
  console.log("   Neynar API: Check your plan limits");
  console.log("   Zora API: ~100 requests/minute");
  console.log("   DexScreener API: ~300 requests/minute");
  console.log("   Paragraph API: Check your plan limits");

  console.log("\n" + "=".repeat(60));
}

async function main() {
  console.log("🔍 InfoBot Capacity Monitor\n");

  printEstimatedLimits();

  console.log("\n💡 To get accurate metrics, the bot needs to be running");
  console.log("   and tracking guilds/chats/users in real-time.\n");

  const monitor = new CapacityMonitor();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\n🛑 Shutting down monitor...");
    monitor.stopMonitoring();
    process.exit(0);
  });

  // Start monitoring
  await monitor.startMonitoring(5000); // Every 5 seconds
}

main().catch(console.error);

