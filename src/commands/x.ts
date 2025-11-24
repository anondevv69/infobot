import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import type { User } from "@neynar/nodejs-sdk/build/api";
import { findUserByUsername, findUserByXHandle } from "../services/neynar";
import { safeFetchMostRecentCast, safeFetchTokensByFid } from "../utils/farcasterHelpers";
import { buildFarcasterPresentation } from "../utils/farcasterPresentation";
import { trackUser, trackSearch, trackResponseTime } from "../utils/botStats";
import { logger } from "../utils/logger";

function parseHandleFromInput(input: string): string | null {
  // Remove @ if present
  let handle = input.replace(/^@/, "").trim();
  
  // If it's a URL, extract handle
  if (handle.includes("x.com/") || handle.includes("twitter.com/")) {
    try {
      const url = new URL(handle.startsWith("http") ? handle : `https://${handle}`);
      const host = url.hostname.replace(/^www\./, "").toLowerCase();
      if (host !== "x.com" && host !== "twitter.com") {
        return null;
      }
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length > 0 && segments[0].toLowerCase() !== "i") {
        handle = segments[0];
      } else {
        const screenName = url.searchParams.get("screen_name");
        if (screenName) {
          handle = screenName;
        } else {
          return null;
        }
      }
    } catch {
      return null;
    }
  }
  
  const normalized = handle.replace(/^@/, "").trim();
  if (!normalized || !/^[a-zA-Z0-9_]{1,15}$/.test(normalized)) {
    return null;
  }
  return normalized.toLowerCase();
}

function userHasMatchingXAccount(user: User | null, handle: string): boolean {
  if (!user?.verified_accounts) {
    return false;
  }
  const normalized = handle.toLowerCase();
  return user.verified_accounts.some((account) => {
    if (account.platform !== "x" || !account.username) {
      return false;
    }
    return account.username.replace(/^@/, "").toLowerCase() === normalized;
  });
}

export async function handleXCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("query", true).trim();
  const userId = interaction.user.id;
  const guildId = interaction.guildId || undefined;
  const channelId = interaction.channelId;

  trackUser(userId, "discord");
  const startTime = Date.now();

  await interaction.deferReply();

  try {
    const handle = parseHandleFromInput(query);
    if (!handle) {
      await interaction.editReply({
        content: `Invalid X/Twitter handle or URL: \`${query}\`. Please provide a valid handle (e.g., @username) or URL (e.g., https://x.com/username).`,
      });
      return;
    }

    // Use Neynar API to search X account directly
    const byXHandle = await findUserByXHandle(handle);
    
    // Fallback to username lookup if X handle lookup fails
    let byUsername: User | null = null;
    if (!byXHandle) {
      try {
        byUsername = await findUserByUsername(handle);
        // Only use if it has matching X account
        if (byUsername && !userHasMatchingXAccount(byUsername, handle)) {
          byUsername = null;
        }
      } catch (error) {
        // User not found, continue
      }
    }

    // Trust the X handle lookup result (it searches X accounts directly)
    // Only use username fallback if X handle lookup failed
    const farcasterUser = byXHandle ?? byUsername;
    if (farcasterUser) {
      const [tokens, latestCast] = await Promise.all([
        safeFetchTokensByFid(farcasterUser.fid),
        safeFetchMostRecentCast(farcasterUser.fid),
      ]);

      const presentation = await buildFarcasterPresentation(farcasterUser, {
        tokens,
        latestCast,
        titleSuffix: "X/Twitter Lookup",
      });

      const responseTime = Date.now() - startTime;
      trackResponseTime(responseTime);
      trackSearch();

      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "x_twitter",
      });

      await interaction.editReply({
        embeds: presentation.embeds,
        components: presentation.components,
      });
      return;
    }

    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
    trackSearch();

    logger.search(query, "discord", userId, guildId, channelId, {
      success: false,
      type: "x_twitter",
    });

    await interaction.editReply({
      content: `No Farcaster profile linked to X handle \`@${handle}\`.`,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
    trackSearch();

    logger.search(query, "discord", userId, guildId, channelId, {
      success: false,
      type: "x_twitter",
    });

    await interaction.editReply({
      content: `Error searching for X/Twitter profile: \`${query}\`.`,
    });
  }
}

