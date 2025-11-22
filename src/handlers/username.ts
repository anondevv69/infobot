import { Message } from "discord.js";
import {
  findUserByUsername,
  findUserByWallet,
  NeynarLookupError,
} from "../services/neynar";
import {
  buildUserClankerEmbed,
  buildTokenDetailRows,
} from "../utils/clankerEmbeds";
import {
  safeFetchMostRecentCast,
  safeFetchTokensByFid,
} from "../utils/farcasterHelpers";
import { findBestZoraSummary } from "../services/zora";
import { buildZoraPresentation, collectZoraIdentifiers } from "../utils/zoraPresentation";
import { buildZoraProfileEmbed, appendZoraSummaryFields } from "../utils/zoraEmbeds";
import { buildFarcasterPresentation } from "../utils/farcasterPresentation";
import { isSummaryAssociatedWithUser } from "../utils/zoraAssociation";
import { splitClankerTokens } from "../utils/clankerAssociation";
import { applyBranding } from "../utils/branding";

const USERNAME_REGEX = /(^|[^<\w])@([a-z0-9][a-z0-9_.-]{0,31})/gi;
const FARCASTER_PROFILE_REGEX = /https?:\/\/(?:www\.)?farcaster\.xyz\/([a-z0-9][a-z0-9_.-]{0,31})/gi;
const PARAGRAPH_URL_REGEX = /https?:\/\/(?:www\.)?paragraph\.(?:com|xyz)\/@/i;

function extractCandidateUsernames(content: string): string[] {
  // Skip username extraction if it's a Paragraph URL (to avoid matching @username in URLs)
  if (PARAGRAPH_URL_REGEX.test(content)) {
    return [];
  }
  
  const candidates = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = USERNAME_REGEX.exec(content)) !== null) {
    const username = match[2].toLowerCase();
    if (username === "everyone" || username === "here") {
      continue;
    }
    candidates.add(username);
  }

  while ((match = FARCASTER_PROFILE_REGEX.exec(content)) !== null) {
    const username = match[1].toLowerCase();
    candidates.add(username);
  }

  return Array.from(candidates);
}

export async function handleUsernameMessage(message: Message): Promise<void> {
  if (message.author.bot || !message.content) {
    return;
  }

  const usernames = extractCandidateUsernames(message.content);
  for (const username of usernames) {
    // Always try Farcaster first
    let user;
    try {
      user = await findUserByUsername(username);
    } catch (error) {
      if (error instanceof NeynarLookupError) {
        console.warn(
          `Neynar lookup failed for username @${username}: ${error.message}`,
        );
        // Only fall back to Zora if Farcaster lookup explicitly fails
        // Don't fall back on errors - let it continue to next username
        continue;
      }
      throw error;
    }

    // If Farcaster user found, show Farcaster profile
    if (user) {
    const [tokens, latestCast, zoraSummaryForUser] = await Promise.all([
      safeFetchTokensByFid(user.fid),
      safeFetchMostRecentCast(user.fid),
      findBestZoraSummary(collectZoraIdentifiers(user)),
    ]);

    const associatedZoraSummary =
      zoraSummaryForUser && isSummaryAssociatedWithUser(user, zoraSummaryForUser)
        ? zoraSummaryForUser
        : null;

    const paginationIdentifier = `farcaster_username_${username}`;

    // Use buildFarcasterPresentation for proper pagination
    const presentation = await buildFarcasterPresentation(user, {
      tokens,
      zoraSummary: associatedZoraSummary,
      latestCast,
      titleSuffix: "Farcaster Profile",
      includeButtons: false,
      paginationIdentifier, // Use custom identifier
    });

    await message.reply({
      embeds: presentation.embeds,
      components: presentation.components,
    });
    return;
  }
  }

  // If no Farcaster user found for any username, try Zora as fallback
  for (const username of usernames) {
    if (await replyWithZoraSummary(message, username)) {
      return;
    }
  }

  // Also check for wallet addresses in usernames
  for (const username of usernames) {
    if (!username.startsWith("0x")) {
      continue;
    }
    const user = await findUserByWallet(username);
    if (!user) {
      if (await replyWithZoraSummary(message, username)) {
        return;
      }
      continue;
    }
    const [tokens, latestCast, zoraSummary] = await Promise.all([
      safeFetchTokensByFid(user.fid),
      safeFetchMostRecentCast(user.fid),
      findBestZoraSummary(collectZoraIdentifiers(user)),
    ]);

    const associatedSummary =
      zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

    const paginationIdentifier = `farcaster_wallet_${username}`;

    // Use buildFarcasterPresentation for proper pagination
    const presentation = await buildFarcasterPresentation(user, {
      tokens,
      zoraSummary: associatedSummary,
      latestCast,
      titleSuffix: "Wallet Lookup",
      includeButtons: false,
      paginationIdentifier, // Use custom identifier
    });

    await message.reply({
      embeds: presentation.embeds,
      components: presentation.components,
    });
    return;
  }
}

async function replyWithZoraSummary(
  message: Message,
  identifier: string,
): Promise<boolean> {
  const summary = await findBestZoraSummary([identifier, identifier.replace(/^@/, "")]);
  if (!summary) {
    return false;
  }

  const normalized = identifier.replace(/^@/, "").toLowerCase();
  const summaryHandle = summary.profile?.farcasterHandle?.replace(/^@/, "").toLowerCase();
  if (normalized && summaryHandle && normalized !== summaryHandle) {
    return false;
  }

  const profileEmbed = buildZoraProfileEmbed(summary);
  const { appendZoraSummaryFields } = await import("../utils/zoraEmbeds");
  await appendZoraSummaryFields(profileEmbed, summary);

  let farcasterEmbeds: Awaited<ReturnType<typeof buildFarcasterPresentation>> | null = null;
  const farcasterHandle = summary.profile.farcasterHandle;
  if (farcasterHandle) {
    try {
      const user = await findUserByUsername(farcasterHandle.replace(/^@/, ""));
      if (user) {
        farcasterEmbeds = await buildFarcasterPresentation(user);
      }
    } catch (error) {
      console.warn("Failed to fetch Farcaster profile for Zora-only summary:", error);
    }
  }

  // If we have Farcaster embeds, use those (they already have pagination)
  // Otherwise, paginate the Zora profile embed
  if (farcasterEmbeds) {
    await message.reply({
      embeds: farcasterEmbeds.embeds,
      components: farcasterEmbeds.components,
    });
  } else {
    const { splitEmbedIntoPages, buildPaginationButtons } = await import("../utils/pagination");
    const { storeEmbedForPagination } = await import("./pagination");
    const embeds = splitEmbedIntoPages(profileEmbed, 15);
    const totalPages = embeds.length;
    const paginationIdentifier = `zora_profile_${identifier}`;

    // Store for pagination
    if (totalPages > 1) {
      embeds.forEach((embed, index) => {
        if (index === 0) {
          storeEmbedForPagination(paginationIdentifier, embed);
        } else {
          storeEmbedForPagination(`${paginationIdentifier}_page${index + 1}`, embed);
        }
      });
    }

    const { ActionRowBuilder, ButtonBuilder } = await import("discord.js");
    const components: typeof buildPaginationButtons extends (...args: any[]) => infer R ? R : never = [];
    if (totalPages > 1) {
      components.push(...buildPaginationButtons(0, totalPages, paginationIdentifier));
    }

    await message.reply({
      embeds: [embeds[0]],
      components,
    });
  }
  return true;
}


