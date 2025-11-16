import TelegramBot from "node-telegram-bot-api";
import { EmbedBuilder } from "discord.js";
import type { Cast, User } from "@neynar/nodejs-sdk/build/api";
import type { ClankerToken } from "../../../services/clanker";
import { fetchTokensByAddress } from "../../../services/clanker";
import { resolveUserFromToken, buildTokenEmbed, getClankerDisplayEntries, formatClankerTokenDetails, appendWalletFields, sortClankerTokens } from "../../../utils/clankerEmbeds";
import { safeFetchTokensByFid, safeFetchMostRecentCast, safeFetchEarliestCastByQuery } from "../../../utils/farcasterHelpers";
import { splitClankerTokens } from "../../../utils/clankerAssociation";
import { findBestZoraSummary } from "../../../services/zora";
import { collectZoraIdentifiers } from "../../../utils/zoraPresentation";
import { isSummaryAssociatedWithUser } from "../../../utils/zoraAssociation";
import { appendZoraSummaryFields } from "../../../utils/zoraEmbeds";
import { applyBranding } from "../../../utils/branding";
import { sendPaginatedTelegramMessage } from "../utils/sendPaginated";

/**
 * Build all Clanker token pages (same structure as Discord)
 * Returns all embeds that should be sent
 */
export async function buildClankerTokenPages(
  address: string,
): Promise<EmbedBuilder[]> {
  const tokens = await fetchTokensByAddress(address);
  const normalizedAddress = address.toLowerCase();
  const directClankerMatches = tokens.filter(
    (token) => token.contract_address?.toLowerCase() === normalizedAddress,
  );

  // Debug: Log if we found tokens but no direct match
  if (tokens.length > 0 && directClankerMatches.length === 0) {
    console.log(`[Clanker] Found ${tokens.length} tokens for ${address}, but no direct contract match`);
  }

  if (directClankerMatches.length === 0) {
    return [];
  }

  const sortedTokens = sortClankerTokens(directClankerMatches);
  const primaryToken = sortedTokens[sortedTokens.length - 1];
  const associatedUser = await resolveUserFromToken(primaryToken);

  let deployedTokens: ClankerToken[] = [];
  let latestCast: Cast | null = null;
  if (associatedUser) {
    const [creatorTokens, fetchedCast] = await Promise.all([
      safeFetchTokensByFid(associatedUser.fid),
      safeFetchMostRecentCast(associatedUser.fid),
    ]);
    deployedTokens = splitClankerTokens(creatorTokens, associatedUser).deployed;
    latestCast = fetchedCast;
  }

  const zoraSummary = await findBestZoraSummary(
    associatedUser
      ? collectZoraIdentifiers(associatedUser, address)
      : [address],
  );
  const filteredSummary = associatedUser && zoraSummary
    ? isSummaryAssociatedWithUser(associatedUser, zoraSummary) ? zoraSummary : null
    : zoraSummary;
  const earliestCast = primaryToken.contract_address
    ? await safeFetchEarliestCastByQuery(primaryToken.contract_address)
    : null;

  // Build paginated structure: Page 1 = Token + Dev info, Page 2 = Other Clankers, Page 3 = Wallets + Zora
  const embeds: EmbedBuilder[] = [];
  
  // Page 1: Token info + Dev info (who deployed it, but no wallets)
  const page1Embed = await buildTokenEmbed(primaryToken, {
    farcasterUser: associatedUser ?? undefined, // Include dev info on page 1
    clankerTokens: [], // Don't include other clankers on page 1
    latestCast: latestCast ?? null,
    earliestCast,
    zoraSummary: undefined, // Don't include Zora on page 1
    includeWallets: false, // Don't include wallets on page 1
  });
  embeds.push(page1Embed);
  
  // Page 2: Other Clankers (if available)
  if (deployedTokens.length > 0) {
    const clankerEntries = getClankerDisplayEntries(deployedTokens);
    const currentAddress = primaryToken.contract_address?.toLowerCase();
    const filteredEntries = clankerEntries.filter((entry) => {
      const entryAddress = entry.token.contract_address?.toLowerCase();
      // Exclude the current token from "First Clanker" or "Most Recent Clanker"
      return !(entryAddress && entryAddress === currentAddress);
    });

    if (filteredEntries.length > 0) {
      const page2Embed = new EmbedBuilder()
        .setColor(0x4338ca)
        .setTitle(`Clanker • ${primaryToken.name ?? primaryToken.symbol ?? "Token"} • Other Clankers`);
      
      filteredEntries.forEach(({ label, token: entryToken }) => {
        page2Embed.addFields({
          name: label,
          value: formatClankerTokenDetails(entryToken),
          inline: false,
        });
      });
      
      applyBranding(page2Embed, "clanker");
      embeds.push(page2Embed);
    }
  }

  // Page 3: Wallets + Zora info (if available)
  const hasWallets = associatedUser && (
    associatedUser.custody_address ||
    (associatedUser.verified_addresses?.eth_addresses?.length ?? 0) > 0 ||
    (associatedUser.verified_addresses?.sol_addresses?.length ?? 0) > 0
  );
  const hasZora = filteredSummary !== null && filteredSummary !== undefined;
  const hasPage3 = hasWallets || hasZora;

  if (hasPage3) {
    const page3Embed = new EmbedBuilder()
      .setColor(0x4338ca);
    
    // Add wallet fields first to determine what we actually have
    let actuallyHasWallets = false;
    if (associatedUser) {
      const hasWalletData = associatedUser.custody_address ||
        (associatedUser.verified_addresses?.eth_addresses?.length ?? 0) > 0 ||
        (associatedUser.verified_addresses?.sol_addresses?.length ?? 0) > 0;
      
      if (hasWalletData) {
        appendWalletFields(page3Embed, associatedUser);
        actuallyHasWallets = true;
      }
    }

    // Add Zora info if available
    if (hasZora && filteredSummary) {
      await appendZoraSummaryFields(page3Embed, filteredSummary, { latestCast: null });
    }

    // Build title to clearly indicate what's actually on this page
    let page3Title = `Clanker • ${primaryToken.name ?? primaryToken.symbol ?? "Token"}`;
    if (actuallyHasWallets && hasZora) {
      page3Title += " • Wallets & Zora";
    } else if (actuallyHasWallets) {
      page3Title += " • Wallets";
    } else if (hasZora) {
      page3Title += " • Zora";
    }
    page3Embed.setTitle(page3Title);
    
    applyBranding(page3Embed, "clanker");
    embeds.push(page3Embed);
  }

  return embeds;
}

/**
 * Send all Clanker token pages to Telegram with pagination
 */
export async function sendClankerTokenPages(
  bot: TelegramBot,
  chatId: number,
  address: string,
): Promise<boolean> {
  try {
    const embeds = await buildClankerTokenPages(address);
    if (embeds.length === 0) {
      return false;
    }

    // Determine page labels based on what's actually in each page
    const pageLabels: string[] = ["Token & Dev"];
    if (embeds.length > 1) {
      pageLabels.push("Other Clankers");
    }
    if (embeds.length > 2) {
      // Check if page 3 has wallets and/or Zora
      const page3Title = embeds[2].data.title || "";
      if (page3Title.includes("Wallets & Zora")) {
        pageLabels.push("Wallets & Zora");
      } else if (page3Title.includes("Wallets")) {
        pageLabels.push("Wallets");
      } else if (page3Title.includes("Zora")) {
        pageLabels.push("Zora");
      } else {
        pageLabels.push("Page 3");
      }
    }

    const identifier = `clanker_${address.toLowerCase()}`;
    await sendPaginatedTelegramMessage(bot, chatId, embeds, identifier, pageLabels);
    return true;
  } catch (error) {
    console.error("Error sending Clanker token pages:", error);
    return false;
  }
}

