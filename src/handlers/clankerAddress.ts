import { Message, ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";
import type { Cast } from "@neynar/nodejs-sdk/build/api";
import { fetchTokensByAddress, type ClankerToken } from "../services/clanker";
import {
  buildTokenEmbed,
  resolveUserFromToken,
  sortClankerTokens,
} from "../utils/clankerEmbeds";
import {
  safeFetchMostRecentCast,
  safeFetchTokensByFid,
  safeFetchEarliestCastByQuery,
} from "../utils/farcasterHelpers";
import {
  extractFirstAddress,
  extractZoraContractReference,
  isEthAddress,
  isSolAddress,
} from "../utils/address";
import { findUserByWallet, findUserByUsername } from "../services/neynar";
import { findBestZoraSummary, fetchZoraCoin, fetchZoraSummary } from "../services/zora";
import { fetchPumpFunToken } from "../services/pumpfun";
import { collectZoraIdentifiers } from "../utils/zoraPresentation";
import { buildWalletProfileResponse, buildZoraWalletProfileResponse } from "../utils/walletEmbed";
import { buildFarcasterPresentation } from "../utils/farcasterPresentation";
import {
  isSummaryAssociatedWithAddress,
  isSummaryAssociatedWithUser,
} from "../utils/zoraAssociation";
import { splitClankerTokens } from "../utils/clankerAssociation";
import { buildPumpFunEmbed } from "../utils/pumpFunEmbeds";
import { buildZoraCoinResponse } from "../handlers/zoraAddress";
import { splitEmbedIntoPages, buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "../handlers/pagination";
import { addProfileSection, appendWalletFields, formatRecentCastSummary } from "../utils/clankerEmbeds";
import { appendZoraSummaryFields } from "../utils/zoraEmbeds";
import { applyBranding } from "../utils/branding";

export async function handleClankerAddressMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const zoraReference = extractZoraContractReference(message.content);
  const address = extractFirstAddress(message.content);
  if (!address) {
    return false;
  }

  const normalizedAddress = address.toLowerCase();

  // FIRST: Check if this is a creator coin or any Zora coin - do this before any other processing
  if (isEthAddress(address) || zoraReference) {
    // Try to fetch the coin directly first
    let coin = await fetchZoraCoin(address, zoraReference?.chainId);
    let summary = await findBestZoraSummary([normalizedAddress]);
    
    // If we got a summary but no coin, try to get the coin from the summary
    if (!coin && summary) {
      // Check if this address matches the creator coin address
      if (summary.profile?.creatorCoinAddress?.toLowerCase() === normalizedAddress) {
        coin = await fetchZoraCoin(summary.profile.creatorCoinAddress);
      }
      // Or check if it's in the createdCoins array
      if (!coin && summary.createdCoins) {
        const matchingCoin = summary.createdCoins.find(c => c.address?.toLowerCase() === normalizedAddress);
        if (matchingCoin) {
          coin = matchingCoin;
        }
      }
      // Or try the latest coin
      if (!coin && summary.latestCoin?.coin?.address?.toLowerCase() === normalizedAddress) {
        coin = summary.latestCoin.coin;
      }
    }
    
    // Check if this address is a creator coin
    const isCreatorCoin = 
      summary?.profile?.creatorCoinAddress?.toLowerCase() === normalizedAddress ||
      (summary?.createdCoins?.some(c => c.address?.toLowerCase() === normalizedAddress) ?? false);
    
    // If we have a coin, show it as a coin card (not a profile)
    if (coin) {
      // Get the full summary if we don't have it yet
      if (!summary) {
        if (coin.creatorProfile?.handle) {
          summary = await fetchZoraSummary(coin.creatorProfile.handle);
        } else if (coin.creatorAddress) {
          summary = await findBestZoraSummary([coin.creatorAddress]);
        }
      }
      
        const response = await buildZoraCoinResponse(coin, summary);
        await message.reply({
          content: response.content,
          embeds: response.embeds,
          components: response.components ?? [],
        });
      return true;
    }
  }

  const tokens = await fetchTokensByAddress(address);
  const directClankerMatches = tokens.filter(
    (token) => token.contract_address?.toLowerCase() === normalizedAddress,
  );

  let user = await findUserByWallet(address).catch((error) => {
    console.warn("Failed Neynar wallet lookup, continuing:", error);
    return null;
  });

  const zoraSummaryFromAddress = await findBestZoraSummary([address]);

  if (!user && zoraSummaryFromAddress?.profile?.farcasterHandle) {
    try {
      const handle = zoraSummaryFromAddress.profile.farcasterHandle.replace(/^@/, "");
      user = await findUserByUsername(handle);
    } catch (error) {
      console.warn("Failed to resolve user from Zora Farcaster handle:", error);
    }
  }

  if (directClankerMatches.length > 0) {
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

    // Build paginated structure: Page 1 = Coin/Deployer, Page 2 = Farcaster, Page 3 = Zora
    const embeds: EmbedBuilder[] = [];
    
    // Page 1: Coin info + Deployer info (without Farcaster and Zora)
    const page1Embed = buildTokenEmbed(primaryToken, {
      farcasterUser: undefined, // Don't include Farcaster on page 1
      clankerTokens: deployedTokens,
      latestCast: null,
      earliestCast,
      zoraSummary: undefined, // Don't include Zora on page 1
    });
    embeds.push(page1Embed);
    
    let totalPages = 1;
    const identifier = `clanker_token_${primaryToken.contract_address ?? address}`;

    // Page 2: Farcaster info (if available)
    if (associatedUser) {
      const page2Embed = new EmbedBuilder()
        .setColor(0x4338ca)
        .setTitle(`Clanker • ${primaryToken.name ?? primaryToken.symbol ?? "Token"} • Page 2`);
      
      addProfileSection(page2Embed, associatedUser, "Dev Profile");
      appendWalletFields(page2Embed, associatedUser);
      
      if (latestCast) {
        page2Embed.addFields({
          name: "Latest Dev Cast",
          value: formatRecentCastSummary(latestCast),
          inline: false,
        });
      }
      
      applyBranding(page2Embed, "clanker");
      embeds.push(page2Embed);
      totalPages = 2;
    }

    // Page 3: Zora info (if available)
    if (filteredSummary) {
      const page3Embed = new EmbedBuilder()
        .setColor(0x4338ca)
        .setTitle(`Clanker • ${primaryToken.name ?? primaryToken.symbol ?? "Token"} • Page 3`);
      
      appendZoraSummaryFields(page3Embed, filteredSummary, { latestCast: null });
      applyBranding(page3Embed, "clanker");
      embeds.push(page3Embed);
      totalPages = 3;
    }

    // Store embeds for pagination
    if (totalPages > 1) {
      storeEmbedForPagination(identifier, embeds[0]);
      if (embeds.length > 1) {
        storeEmbedForPagination(`${identifier}_page2`, embeds[1]);
      }
      if (embeds.length > 2) {
        storeEmbedForPagination(`${identifier}_page3`, embeds[2]);
      }
    }

    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (totalPages > 1) {
      components.push(...buildPaginationButtons(0, totalPages, identifier));
    }

    await message.reply({
      content: `Clanker deployment detected for \`${address}\`.`,
      embeds: [embeds[0]],
      components,
    });
    return true;
  }

  if (directClankerMatches.length === 0) {
    const pumpIdentifier = extractPumpFunIdentifier(message.content, address);
    if (pumpIdentifier) {
      const pumpToken = await fetchPumpFunToken(pumpIdentifier);
      if (pumpToken) {
        const pumpEmbed = buildPumpFunEmbed(pumpToken);
        await message.reply({
          content: `Pump.fun coin detected for \`${pumpIdentifier}\`.`,
          embeds: [pumpEmbed],
        });
        return true;
      }
    }
  }

  if (user) {
    const identifiers = collectZoraIdentifiers(user, address);
    const [fidTokens, latestCast, zoraSummary] = await Promise.all([
      safeFetchTokensByFid(user.fid),
      safeFetchMostRecentCast(user.fid),
      findBestZoraSummary(identifiers),
    ]);

    const associatedSummary =
      zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

    const walletResponse = buildWalletProfileResponse({
      wallet: address,
      user,
      zoraSummary: associatedSummary,
      clankerTokens: fidTokens,
      latestCast,
    });

    await message.reply({
      embeds: walletResponse.embeds,
      components: walletResponse.components,
    });
    return true;
  }

  if (zoraSummaryFromAddress) {

    const hasZoraCoinData =
      Boolean(zoraSummaryFromAddress.latestCoin?.coin) ||
      (zoraSummaryFromAddress.createdCoins ?? []).length > 0;

    if (zoraReference && !hasZoraCoinData && directClankerMatches.length === 0) {
      // Let the zoraAddress handler take over so the coin lookup can reply.
      return false;
    }

    const associated = isSummaryAssociatedWithAddress(zoraSummaryFromAddress, address)
      ? zoraSummaryFromAddress
      : null;

    const zoraResponse = buildZoraWalletProfileResponse({
      wallet: address,
      summary: associated ?? zoraSummaryFromAddress,
    });

    let farcasterEmbeds: Awaited<ReturnType<typeof buildFarcasterPresentation>> | null = null;
    const farcasterHandle = zoraSummaryFromAddress.profile.farcasterHandle;
    if (farcasterHandle) {
      try {
        const user = await findUserByUsername(farcasterHandle.replace(/^@/, ""));
        if (user) {
          farcasterEmbeds = await buildFarcasterPresentation(user, {
            zoraSummary: associated,
          });
        }
      } catch (error) {
        console.warn("Failed to fetch Farcaster profile for Zora summary:", error);
      }
    }

    await message.reply({
      embeds: farcasterEmbeds
        ? [...farcasterEmbeds.embeds, ...zoraResponse.embeds]
        : zoraResponse.embeds,
      components: farcasterEmbeds?.components ?? [],
    });
    return true;
  }

  if (isEthAddress(address) || isSolAddress(address)) {
    if (zoraReference) {
      return false;
    }
    await message.reply({
      content: `We're continuing to add more wallet tracking systems and cannot connect \`${address}\` to any wallet or contract at this time.`,
    });
    return true;
  }

  return false;
}

function extractPumpFunIdentifier(content: string, detectedAddress: string | null): string | null {
  const linkMatch = content.match(/pump\.fun\/coin\/([A-Za-z0-9]+)/i);
  if (linkMatch?.[1]) {
    return linkMatch[1];
  }

  const pumpMatch = content.match(/[1-9A-HJ-NP-Za-km-z]{32,60}pump/);
  if (pumpMatch?.[0]) {
    return pumpMatch[0];
  }

  if (detectedAddress?.toLowerCase().endsWith("pump")) {
    return detectedAddress;
  }

  return null;
}

