/* eslint-disable no-console */
import { isDevelopment } from "../config";

type LogLevel = "info" | "warn" | "error" | "debug";

function format(level: LogLevel, message: string, meta?: unknown): string {
  const base = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  if (meta === undefined) {
    return base;
  }
  return `${base} ${JSON.stringify(meta)}`;
}

export const logger = {
  info(message: string, meta?: unknown) {
    console.log(format("info", message, meta));
  },
  warn(message: string, meta?: unknown) {
    console.warn(format("warn", message, meta));
  },
  error(message: string, meta?: unknown) {
    console.error(format("error", message, meta));
  },
  debug(message: string, meta?: unknown) {
    if (isDevelopment) {
      console.debug(format("debug", message, meta));
    }
  },
};

