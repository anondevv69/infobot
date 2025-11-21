import type { EmbedBuilder } from "discord.js";
import { convertToTelegramMessage } from "./messageAdapter";

/**
 * Convert Discord embed(s) to Telegram message(s)
 * Telegram has a 4096 character limit per message, so we may need to split
 */
export function embedsToTelegram(embeds: EmbedBuilder[]): string[] {
  const messages: string[] = [];
  
  for (const embed of embeds) {
    const message = convertToTelegramMessage(embed);
    
    // Debug: Log final HTML message before sending (only for trading links)
    // This helps identify malformed <a> tags
    if (message.includes("💱 Trade") || message.includes("<a href")) {
      console.log("[Telegram] FINAL HTML MESSAGE:", message);
      // Also log just the trading links section for easier debugging
      const tradeMatch = message.match(/💱 Trade.*?(?=\n|$)/s);
      if (tradeMatch) {
        console.log("[Telegram] TRADE LINKS SECTION:", tradeMatch[0]);
      }
    }
    
    // If message is too long, split it
    if (message.length > 4000) {
      // Split by fields or lines
      const parts = splitLongMessage(message);
      messages.push(...parts);
    } else {
      messages.push(message);
    }
  }
  
  return messages;
}

/**
 * Split a long message into chunks that fit Telegram's limits
 */
function splitLongMessage(message: string, maxLength = 4000): string[] {
  const parts: string[] = [];
  const lines = message.split("\n");
  let currentPart = "";
  
  for (const line of lines) {
    if ((currentPart + line + "\n").length > maxLength) {
      if (currentPart) {
        parts.push(currentPart.trim());
        currentPart = "";
      }
      // If a single line is too long, truncate it
      if (line.length > maxLength) {
        parts.push(line.substring(0, maxLength - 3) + "...");
        currentPart = line.substring(maxLength - 3);
      } else {
        currentPart = line + "\n";
      }
    } else {
      currentPart += line + "\n";
    }
  }
  
  if (currentPart.trim()) {
    parts.push(currentPart.trim());
  }
  
  return parts;
}

