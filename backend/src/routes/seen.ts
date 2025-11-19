import { Router } from "express";
import {
  hasSeenTelegramChat,
  markTelegramChatAsSeen,
  hasSeenDiscordGuild,
  markDiscordGuildAsSeen,
} from "../db";

export const seenRouter = Router();

// Check if Telegram chat has been seen
seenRouter.get("/telegram-chat", async (req, res) => {
  try {
    const { chatId } = req.query;
    if (!chatId || typeof chatId !== "string") {
      return res.status(400).json({ error: "chatId is required" });
    }

    const seen = await hasSeenTelegramChat(chatId);
    res.json({ seen });
  } catch (error) {
    console.error("[Seen] Error checking Telegram chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mark Telegram chat as seen
seenRouter.post("/telegram-chat", async (req, res) => {
  try {
    const { chatId, chatTitle, chatType, memberCount } = req.body;
    if (!chatId || !chatTitle || !chatType) {
      return res.status(400).json({ error: "chatId, chatTitle, and chatType are required" });
    }

    const result = await markTelegramChatAsSeen(chatId, chatTitle, chatType, memberCount || null);
    res.json({ success: true, isNew: result.isNew });
  } catch (error) {
    console.error("[Seen] Error marking Telegram chat as seen:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Check if Discord guild has been seen
seenRouter.get("/discord-guild", async (req, res) => {
  try {
    const { guildId } = req.query;
    if (!guildId || typeof guildId !== "string") {
      return res.status(400).json({ error: "guildId is required" });
    }

    const seen = await hasSeenDiscordGuild(guildId);
    res.json({ seen });
  } catch (error) {
    console.error("[Seen] Error checking Discord guild:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mark Discord guild as seen
seenRouter.post("/discord-guild", async (req, res) => {
  try {
    const { guildId, guildName, memberCount, ownerId } = req.body;
    if (!guildId || !guildName || memberCount === undefined || !ownerId) {
      return res.status(400).json({ error: "guildId, guildName, memberCount, and ownerId are required" });
    }

    await markDiscordGuildAsSeen(guildId, guildName, memberCount, ownerId);
    res.json({ success: true });
  } catch (error) {
    console.error("[Seen] Error marking Discord guild as seen:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

