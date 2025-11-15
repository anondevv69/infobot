import { env } from "../config";
import { logger } from "../utils/logger";

const DISCORD_API_BASE = "https://discord.com/api/v10";

interface Embed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
  footer?: { text: string };
  author?: { name: string; url?: string; icon_url?: string };
}

export async function sendDiscordMessage(options: {
  channelId: string;
  content?: string;
  embeds?: Embed[];
}): Promise<void> {
  try {
    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${options.channelId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        },
        body: JSON.stringify({
          content: options.content,
          embeds: options.embeds,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      logger.warn("Failed to send Discord message", {
        status: response.status,
        body: text,
      });
    }
  } catch (error) {
    logger.error("Error sending message to Discord", error);
  }
}

