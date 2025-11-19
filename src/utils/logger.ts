import * as fs from "fs";
import * as path from "path";

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
  private logDir: string;
  private logFile: string;
  private errorLogFile: string;
  private searchLogFile: string;
  private systemLogFile: string;

  constructor() {
    // Create logs directory if it doesn't exist
    this.logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Log files with date rotation
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    this.logFile = path.join(this.logDir, `app-${date}.log`);
    this.errorLogFile = path.join(this.logDir, `errors-${date}.log`);
    this.searchLogFile = path.join(this.logDir, `searches-${date}.log`);
    this.systemLogFile = path.join(this.logDir, `system-${date}.log`);
  }

  private formatLog(entry: LogEntry): string {
    const parts = [
      entry.timestamp,
      `[${entry.level.toUpperCase()}]`,
      entry.message,
    ];

    if (entry.platform) {
      parts.push(`[${entry.platform.toUpperCase()}]`);
    }

    if (entry.userId) {
      parts.push(`[User:${entry.userId}]`);
    }

    if (entry.guildId) {
      parts.push(`[Guild:${entry.guildId}]`);
    }

    if (entry.channelId) {
      parts.push(`[Channel:${entry.channelId}]`);
    }

    if (entry.meta && Object.keys(entry.meta).length > 0) {
      parts.push(JSON.stringify(entry.meta));
    }

    return parts.join(" ");
  }

  private writeLog(entry: LogEntry, files?: string[]): void {
    const logLine = this.formatLog(entry) + "\n";
    const filesToWrite = files || [this.logFile];

    filesToWrite.forEach((file) => {
      try {
        fs.appendFileSync(file, logLine, "utf8");
      } catch (error) {
        // Fallback to console if file write fails
        console.error(`[Logger] Failed to write to ${file}:`, error);
      }
    });
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

  // General logging methods
  info(message: string, meta?: Record<string, any>): void {
    const entry = this.createEntry("info", message, meta);
    console.log(this.formatLog(entry));
    this.writeLog(entry);
  }

  warn(message: string, meta?: Record<string, any>): void {
    const entry = this.createEntry("warn", message, meta);
    console.warn(this.formatLog(entry));
    this.writeLog(entry);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, any>): void {
    const errorMeta: Record<string, any> = { ...meta };
    
    if (error instanceof Error) {
      errorMeta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      errorMeta.error = error;
    }

    const entry = this.createEntry("error", message, errorMeta);
    console.error(this.formatLog(entry));
    this.writeLog(entry, [this.logFile, this.errorLogFile]);
  }

  debug(message: string, meta?: Record<string, any>): void {
    if (process.env.NODE_ENV === "development") {
      const entry = this.createEntry("debug", message, meta);
      console.debug(this.formatLog(entry));
      this.writeLog(entry);
    }
  }

  // Search logging
  search(
    query: string,
    platform: "discord" | "telegram",
    userId?: string,
    guildId?: string,
    channelId?: string,
    result?: { success: boolean; type?: string; count?: number },
  ): void {
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
      `Search: ${query}`,
      meta,
      platform,
      userId,
      guildId,
      channelId,
    );

    console.log(this.formatLog(entry));
    this.writeLog(entry, [this.logFile, this.searchLogFile]);
  }

  // System activity logging (Clanker checks, etc.)
  system(
    activity: string,
    meta?: Record<string, any>,
  ): void {
    const entry = this.createEntry("system", activity, meta);
    console.log(this.formatLog(entry));
    this.writeLog(entry, [this.logFile, this.systemLogFile]);
  }

  // Command logging
  command(
    command: string,
    platform: "discord" | "telegram",
    userId?: string,
    guildId?: string,
    channelId?: string,
    args?: Record<string, any>,
  ): void {
    const meta: Record<string, any> = { command, ...args };
    const entry = this.createEntry(
      "info",
      `Command: /${command}`,
      meta,
      platform,
      userId,
      guildId,
      channelId,
    );

    console.log(this.formatLog(entry));
    this.writeLog(entry);
  }
}

// Export singleton instance
export const logger = new Logger();

