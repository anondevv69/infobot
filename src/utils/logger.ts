type LogLevel = "info" | "warn" | "error" | "debug" | "search" | "system";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, any>;
  platform?: "discord" | "telegram";
  userId?: string;
  guildId?: string;
  channelId?: string;
}

class Logger {
  private webhookUrl: string | null = null;
  private rateLimitDelay = 0; // Rate limiting to avoid Discord webhook limits

  constructor() {
    // Get webhook URL from environment
    this.webhookUrl = process.env.LOG_WEBHOOK_URL || null;
    
    if (!this.webhookUrl) {
      console.warn("[Logger] LOG_WEBHOOK_URL not set, logs will only go to console");
    }
  }

  private formatMessage(entry: LogEntry): string {
    const parts: string[] = [];

    // Add emoji based on level
    const emoji = {
      search: "🔍",
      system: "⚙️",
      info: "ℹ️",
      warn: "⚠️",
      error: "❌",
      debug: "🐛",
    }[entry.level] || "";

    parts.push(`${emoji} **${entry.level.toUpperCase()}**`);

    if (entry.platform) {
      parts.push(`[${entry.platform.toUpperCase()}]`);
    }

    parts.push(entry.message);

    // Add context in a compact format
    const context: string[] = [];
    if (entry.userId) context.push(`User: ${entry.userId}`);
    if (entry.guildId) context.push(`Guild: ${entry.guildId}`);
    if (context.length > 0) {
      parts.push(`(${context.join(", ")})`);
    }

    // Add meta info if present (compact)
    if (entry.meta && Object.keys(entry.meta).length > 0) {
      const metaStr = Object.entries(entry.meta)
        .map(([key, value]) => {
          if (typeof value === "object") {
            return `${key}: ${JSON.stringify(value)}`;
          }
          return `${key}: ${value}`;
        })
        .join(", ");
      if (metaStr.length < 200) {
        parts.push(`\n\`${metaStr}\``);
      }
    }

    return parts.join(" ");
  }

  private async sendToWebhook(message: string): Promise<void> {
    if (!this.webhookUrl) {
      return;
    }

    // Rate limiting: wait if needed
    const now = Date.now();
    if (this.rateLimitDelay > now) {
      await new Promise((resolve) => setTimeout(resolve, this.rateLimitDelay - now));
    }
    this.rateLimitDelay = Date.now() + 1000; // 1 second between webhook calls

    try {
      await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: message,
        }),
      });
    } catch (error) {
      // Silently fail - don't spam console with webhook errors
      // Only log to console if it's a critical error
      if (error instanceof Error && !error.message.includes("fetch")) {
        console.error("[Logger] Webhook error:", error);
      }
    }
  }

  private createEntry(
    level: LogLevel,
    message: string,
    meta?: Record<string, any>,
    platform?: "discord" | "telegram",
    userId?: string,
    guildId?: string,
    channelId?: string,
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
      platform,
      userId,
      guildId,
      channelId,
    };
  }

  // General logging methods (only console, no webhook)
  info(message: string, meta?: Record<string, any>): void {
    const entry = this.createEntry("info", message, meta);
    console.log(`[INFO] ${entry.message}`);
  }

  warn(message: string, meta?: Record<string, any>): void {
    const entry = this.createEntry("warn", message, meta);
    console.warn(`[WARN] ${entry.message}`);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, any>): void {
    const errorMeta: Record<string, any> = { ...meta };
    
    if (error instanceof Error) {
      errorMeta.error = {
        name: error.name,
        message: error.message,
      };
    } else if (error) {
      errorMeta.error = error;
    }

    const entry = this.createEntry("error", message, errorMeta);
    console.error(`[ERROR] ${entry.message}`, error);
    
    // Send errors to webhook too
    const webhookMessage = this.formatMessage(entry);
    this.sendToWebhook(webhookMessage).catch(() => {
      // Ignore webhook errors
    });
  }

  debug(message: string, meta?: Record<string, any>, sendToWebhook: boolean = false): void {
    const entry = this.createEntry("debug", message, meta);
    
    if (process.env.NODE_ENV === "development" || sendToWebhook) {
      console.debug(`[DEBUG] ${message}`);
      
      // Send to webhook if requested (for important debug messages)
      if (sendToWebhook) {
        const webhookMessage = this.formatMessage(entry);
        this.sendToWebhook(webhookMessage).catch(() => {
          // Ignore webhook errors
        });
      }
    }
  }

  // Search logging - only log failures or when stuck (not routine searches)
  search(
    query: string,
    platform: "discord" | "telegram",
    userId?: string,
    guildId?: string,
    channelId?: string,
    result?: { success: boolean; type?: string; count?: number },
  ): void {
    // Only log to webhook if search failed or got stuck (pending for too long)
    const isFailure = result?.success === false;
    const isStuck = result?.type === "pending";
    
    if (!isFailure && !isStuck) {
      // Routine successful search - only log to console, not webhook
      console.log(`[SEARCH] ${platform.toUpperCase()}: ${query} (✓)`);
      return;
    }

    const meta: Record<string, any> = {
      query,
      result: result?.success ? "success" : "failed",
    };

    if (result) {
      if (result.type) meta.resultType = result.type;
      if (result.count !== undefined) meta.resultCount = result.count;
    }

    const entry = this.createEntry(
      "search",
      `Search: ${query}${isStuck ? " (STUCK)" : isFailure ? " (FAILED)" : ""}`,
      meta,
      platform,
      userId,
      guildId,
      channelId,
    );

    console.log(`[SEARCH] ${platform.toUpperCase()}: ${query} (${result?.success ? "✓" : "✗"})`);
    
    // Send to webhook only for failures or stuck searches
    const webhookMessage = this.formatMessage(entry);
    this.sendToWebhook(webhookMessage).catch(() => {
      // Ignore webhook errors
    });
  }

  // System activity logging - only log errors or important events (not routine checks)
  system(
    activity: string,
    meta?: Record<string, any>,
  ): void {
    // Only log to webhook if it's an error, warning, or important event (not routine checks)
    const isRoutineCheck = activity.includes("Deployment check complete") || 
                          activity.includes("Starting deployment check") ||
                          activity.includes("Found recent tokens");
    
    const isImportant = activity.includes("ERROR") || 
                       activity.includes("WARN") || 
                       activity.includes("NEW") ||
                       activity.includes("Bot is in webhook server") ||
                       activity.includes("Started monitoring");
    
    const entry = this.createEntry("system", activity, meta);
    console.log(`[SYSTEM] ${activity}`);
    
    // Only send to webhook for important events, not routine checks
    if (!isRoutineCheck || isImportant) {
      const webhookMessage = this.formatMessage(entry);
      this.sendToWebhook(webhookMessage).catch(() => {
        // Ignore webhook errors
      });
    }
  }

  // Command logging (only console, no webhook for commands)
  command(
    command: string,
    platform: "discord" | "telegram",
    userId?: string,
    guildId?: string,
    channelId?: string,
    args?: Record<string, any>,
  ): void {
    console.log(`[COMMAND] ${platform.toUpperCase()}: /${command} by ${userId}`);
  }
}

// Export singleton instance
export const logger = new Logger();

