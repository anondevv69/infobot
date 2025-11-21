import { EmbedBuilder, Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, APIEmbed } from "discord.js";
import type { User } from "@neynar/nodejs-sdk/build/api";
import {
  fetchZoraCoin,
  fetchZoraSummary,
  findBestZoraSummary,
  type ZoraLookupResult,
  type ZoraCoin,
} from "../services/zora";
import { buildZoraCoinEmbed } from "../utils/zoraEmbeds";
import { extractZoraContractReference } from "../utils/address";
import { findUserByUsername } from "../services/neynar";
import { safeFetchTokensByFid } from "../utils/farcasterHelpers";
import { splitClankerTokens } from "../utils/clankerAssociation";
import { getClankerDisplayEntries, type ClankerDisplayEntry, buildUserClankerEmbed, formatRecentCastSummary } from "../utils/clankerEmbeds";
import { splitEmbedIntoPages, buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "./pagination";
import { safeFetchMostRecentCast } from "../utils/farcasterHelpers";
import { applyBranding } from "../utils/branding";
import { buildCreatorCoinField, getZoraCoinUrl, formatAddress, formatCompactNumber } from "../utils/zoraEmbeds";
import { fetchBaseTokenData } from "../services/dexscreener";
import { buildTradingLinks } from "../utils/tradingButtons";

const BASE_CHAIN_ID = 8453;

export async function handleZoraAddressMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const reference = extractZoraContractReference(message.content);
  if (!reference) {
    return false;
  }

  console.debug(
    "[zora] detected reference",
    reference.address,
    "chain",
    reference.chainId,
  );

  // First, check if this address is a creator coin by looking up summaries
  const normalizedAddress = reference.address.toLowerCase();
  let summary = await findBestZoraSummary([normalizedAddress]);
  const isCreatorCoin = summary?.profile?.creatorCoinAddress?.toLowerCase() === normalizedAddress;

  let coin = await fetchZoraCoin(reference.address, reference.chainId);

  if (!coin) {
    console.debug("[zora] fetchZoraCoin returned null, trying profile summary");
    if (!summary) {
      summary = await findBestZoraSummary([normalizedAddress]);
    }
    coin = summary?.latestCoin?.coin ?? null;
    
    // If still no coin but we have a summary with creator coin, try fetching the creator coin directly
    if (!coin && isCreatorCoin && summary?.profile?.creatorCoinAddress) {
      coin = await fetchZoraCoin(summary.profile.creatorCoinAddress, reference.chainId);
    }
  }

  if (!coin) {
    console.debug("[zora] no coin found for", reference.address);
    return false;
  }

  // If we don't have a summary yet, try to get it
  if (!summary && coin.creatorProfile?.handle) {
    console.debug("[zora] fetching summary by handle", coin.creatorProfile.handle);
    summary = await fetchZoraSummary(coin.creatorProfile.handle);
    // Re-check if it's a creator coin now that we have the summary
    if (summary && summary.profile.creatorCoinAddress?.toLowerCase() === normalizedAddress) {
      // This is definitely a creator coin
    }
  }
  if (!summary && coin.creatorAddress) {
    console.debug("[zora] fetching summary by creator address", coin.creatorAddress);
    summary = await fetchZoraSummary(coin.creatorAddress);
  }

  const response = await buildZoraCoinResponse(coin, summary);
  await message.reply({
    content: response.content,
    embeds: response.embeds,
    components: response.components ?? [],
  });

  return true;
}

export async function buildZoraCoinResponse(
  coin: ZoraCoin,
  summary: ZoraLookupResult | null,
  options?: { returnAllPages?: boolean }, // If true, return all embeds instead of just first page
): Promise<{ content: string; embeds: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] }> {
  const profile = summary?.profile ?? null;
  const normalizedCoinAddress = coin.address?.toLowerCase();
  const isCreatorCoin = profile?.creatorCoinAddress?.toLowerCase() === normalizedCoinAddress;
  const creatorAddress = profile?.creatorCoinAddress;

  // Parallelize API calls for better performance
  const [dexScreenerMetrics, farcasterUser, creatorCoinData] = await Promise.all([
    // Fetch market cap from DexScreener for Base tokens if Zora doesn't have it
    (coin.chainId === 8453 || coin.chainId === BASE_CHAIN_ID) && (!coin.marketCap || parseFloat(coin.marketCap || "0") === 0)
      ? fetchBaseTokenData(coin.address).catch(() => null)
      : Promise.resolve(null),
    
    // Fetch Farcaster user - ONLY if explicitly linked in Zora profile/coin
    // Don't use coin.creatorProfile?.handle as it may not be a verified Farcaster link
    (async () => {
      // Only use Farcaster handles that are explicitly in the Zora profile or coin's socialAccounts
      // This ensures we only show Farcaster when it's actually linked to the Zora account
      const farcasterHandle = profile?.farcasterHandle ?? coin.creatorProfile?.socialAccounts?.farcaster?.username;
      
      // Only proceed if we have an explicit Farcaster handle from Zora data
      if (!farcasterHandle) {
        return null;
      }
      
      try {
        const user = await findUserByUsername(farcasterHandle.replace(/^@/, ""));
        // Verify the user exists and is valid before returning
        return user || null;
      } catch (error) {
        console.warn("Failed to fetch Farcaster profile for Zora coin:", error);
        return null;
      }
    })(),
    
    // Fetch creator coin data if available
    (async () => {
  if (creatorAddress) {
    const normalizedCreator = creatorAddress.toLowerCase();
        return summary?.createdCoins?.find(
        (created) => created.address?.toLowerCase() === normalizedCreator,
        ) ?? (await fetchZoraCoin(creatorAddress).catch(() => null));
  }
      return null;
    })(),
  ]);

  const finalCreatorCoinData = (!creatorCoinData && isCreatorCoin) ? coin : creatorCoinData;

  let latestCoin: ZoraCoin | null = null;
  if (isCreatorCoin && summary?.latestCoin?.coin) {
    const latestCoinAddress = summary.latestCoin.coin.address?.toLowerCase();
    if (latestCoinAddress && latestCoinAddress !== normalizedCoinAddress) {
      latestCoin = summary.latestCoin.coin;
    }
  }

  // Fetch clanker entries in parallel with other operations
  let clankerEntries: ClankerDisplayEntry[] = [];
  if (farcasterUser) {
    try {
      const clankerTokens = await safeFetchTokensByFid(farcasterUser.fid);
      const { deployed } = splitClankerTokens(clankerTokens, farcasterUser);
      clankerEntries = getClankerDisplayEntries(deployed);
    } catch (error) {
      console.warn("Failed to fetch clanker deployments for Farcaster user:", error);
    }
  }

  // Re-check isCreatorCoin - check multiple sources and also try fetching by creator if needed
  let finalIsCreatorCoin = 
    profile?.creatorCoinAddress?.toLowerCase() === normalizedCoinAddress ||
    summary?.createdCoins?.some(c => c.address?.toLowerCase() === normalizedCoinAddress) ||
    isCreatorCoin;
  
  // If we still don't know, try fetching the summary by the coin's creator
  if (!finalIsCreatorCoin && coin.creatorProfile?.handle) {
    const creatorSummary = await fetchZoraSummary(coin.creatorProfile.handle);
    if (creatorSummary) {
      finalIsCreatorCoin = 
        creatorSummary.profile?.creatorCoinAddress?.toLowerCase() === normalizedCoinAddress ||
        creatorSummary.createdCoins?.some(c => c.address?.toLowerCase() === normalizedCoinAddress) ||
        false;
      // Update summary if we got a better one
      if (creatorSummary && !summary) {
        summary = creatorSummary;
      }
    }
  }
  
  // Also check by creator address
  if (!finalIsCreatorCoin && coin.creatorAddress) {
    const creatorSummary = await findBestZoraSummary([coin.creatorAddress]);
    if (creatorSummary) {
      finalIsCreatorCoin = 
        creatorSummary.profile?.creatorCoinAddress?.toLowerCase() === normalizedCoinAddress ||
        creatorSummary.createdCoins?.some(c => c.address?.toLowerCase() === normalizedCoinAddress) ||
        false;
      if (creatorSummary && !summary) {
        summary = creatorSummary;
      }
    }
  }

  // Build coin embed (Page 1) - Coin details + Basic creator info (deploy address only)
  const coinEmbed = buildZoraCoinEmbed(
    {
      coin,
      isCreatorCoin: finalIsCreatorCoin,
      source: "direct",
    },
    {
      title: finalIsCreatorCoin ? "Creator Coin" : "Zora Coin",
      profile,
      creatorCoin: undefined, // Don't show creator coin on page 1
      latestCoin: undefined, // Don't show latest coin on page 1
      farcasterUser: farcasterUser ?? undefined, // Include creator info
      clankerEntries: [], // Don't include Clankers on coin page
      excludeCreatorField: false, // Show creator field on page 1 (but without wallets)
      includeCreatorWallets: false, // Don't include wallets on page 1
    },
  );
  
  // Add trading links right after contract field for Base chain tokens
  if (coin.chainId === 8453 || coin.chainId === BASE_CHAIN_ID) {
    try {
      // Simply add trading links at the end - this is safer and works reliably
      coinEmbed.addFields({
        name: "\u200b", // Zero-width space to make it appear on same line
        value: buildTradingLinks(coin.address),
        inline: false,
      });
    } catch (error) {
      // If adding trading links fails, just log and continue without them
      console.error(`[Zora] Failed to add trading links:`, error);
    }
  }

  const embeds: EmbedBuilder[] = [coinEmbed];
  let totalPages = 1;

    // Build Page 2: Creator coin + Farcaster info (if available)
  // Always show Farcaster page if creator has Farcaster, even for creator coins
  if (finalCreatorCoinData || farcasterUser) {
    // Determine page 2 title based on content
    let page2Title = `${finalIsCreatorCoin ? "Creator Coin" : "Zora Coin"}`;
    if (finalCreatorCoinData && farcasterUser) {
      page2Title += " • Creator Coin & Farcaster";
    } else if (finalCreatorCoinData) {
      page2Title += " • Creator Coin";
    } else if (farcasterUser) {
      page2Title += " • Farcaster Profile";
    }
    
    const page2Embed = new EmbedBuilder()
      .setColor(finalIsCreatorCoin ? 0x1d4ed8 : 0x2563eb)
      .setTitle(page2Title);

    // Add creator coin if available (only if it's different from the main coin)
    if (finalCreatorCoinData && finalCreatorCoinData.address !== coin.address) {
      // Fetch market cap for creator coin
      let creatorCoinMarketCap: number | null = null;
      if (finalCreatorCoinData.marketCap) {
        const parsed = parseFloat(finalCreatorCoinData.marketCap);
        if (!isNaN(parsed) && parsed > 0) {
          creatorCoinMarketCap = parsed;
        }
      }
      // Fallback to DexScreener for Base chain
      if (!creatorCoinMarketCap && finalCreatorCoinData.address && (finalCreatorCoinData.chainId === 8453 || finalCreatorCoinData.chainId === BASE_CHAIN_ID)) {
        try {
          const metrics = await fetchBaseTokenData(finalCreatorCoinData.address);
          creatorCoinMarketCap = metrics?.marketCap ?? null;
        } catch (error) {
          // Silently fail
        }
      }
      const creatorCoinField = buildCreatorCoinField(profile, true, finalCreatorCoinData, creatorCoinMarketCap);
      if (creatorCoinField) {
        page2Embed.addFields(creatorCoinField);
      }
    }

    // Add latest coin if available
    if (latestCoin) {
      // Fetch market cap for latest coin
      let latestCoinMarketCap: number | null = null;
      if (latestCoin.marketCap) {
        const parsed = parseFloat(latestCoin.marketCap);
        if (!isNaN(parsed) && parsed > 0) {
          latestCoinMarketCap = parsed;
        }
      }
      // Fallback to DexScreener for Base chain
      if (!latestCoinMarketCap && latestCoin.address && (latestCoin.chainId === 8453 || latestCoin.chainId === BASE_CHAIN_ID)) {
        try {
          const metrics = await fetchBaseTokenData(latestCoin.address);
          latestCoinMarketCap = metrics?.marketCap ?? null;
        } catch (error) {
          // Silently fail
        }
      }
      
      const coinUrl = getZoraCoinUrl(latestCoin);
      const label = latestCoin.name ?? latestCoin.symbol ?? latestCoin.address;
      const truncatedLabel = label.length > 50 ? `${label.slice(0, 47)}...` : label;
      const value = coinUrl
        ? `[${truncatedLabel}](${coinUrl})\n${formatAddress(latestCoin.address, latestCoin.chainId)}`
        : `${truncatedLabel}\n${formatAddress(latestCoin.address, latestCoin.chainId)}`;
      
      let title = "Latest Zora Coin";
      if (latestCoinMarketCap != null && latestCoinMarketCap > 0) {
        const formattedMC = formatCompactNumber(latestCoinMarketCap);
        title = `Latest Zora Coin • MC: ${formattedMC}`;
      }
      
      page2Embed.addFields({
        name: title,
        value,
        inline: false,
      });
    }

    // Add Farcaster profile if available
    if (farcasterUser) {
      // Add creator field with full wallet details for page 2
      const { buildCreatorField } = await import("../utils/zoraEmbeds");
      const creatorFieldWithWallets = buildCreatorField(coin, farcasterUser, true, profile);
      if (creatorFieldWithWallets) {
        page2Embed.addFields(creatorFieldWithWallets);
      }

      // Add Farcaster profile details
      const { embed: farcasterEmbed } = await buildUserClankerEmbed(
        farcasterUser,
        "Farcaster Profile",
        clankerEntries.length > 0 ? clankerEntries.map(e => e.token) : undefined,
      );
      
      // Add latest cast if available
      const latestCast = await safeFetchMostRecentCast(farcasterUser.fid);
      if (latestCast) {
        farcasterEmbed.addFields({
          name: "Most Recent Cast",
          value: formatRecentCastSummary(latestCast),
          inline: false,
        });
      }

      // Copy all fields from farcaster embed to page 2 (excluding duplicate creator info)
      farcasterEmbed.data.fields?.forEach(field => {
        // Skip fields that are already in the creator field
        if (!field.name.includes("Profile") && !field.name.includes("Deployer")) {
        page2Embed.addFields(field);
        }
      });

      applyBranding(page2Embed, "zora coin", finalIsCreatorCoin ? "creator coin" : null);
    } else {
      applyBranding(page2Embed, "zora coin", finalIsCreatorCoin ? "creator coin" : null);
    }

    embeds.push(page2Embed);
    totalPages = 2;
  }

  const identifier = `zora_coin_${coin.address}`;

  // Pagination buttons
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    // Create page labels for descriptive buttons
    const pageLabels = [
      { label: "Coin Details" }, // Page 1
      { label: finalCreatorCoinData && farcasterUser ? "Creator Coin & Farcaster" : finalCreatorCoinData ? "Creator Coin" : "Farcaster Profile" }, // Page 2
    ];
    components.push(...buildPaginationButtons(0, totalPages, identifier, pageLabels));
  }

  // Store both embeds for pagination
  if (totalPages > 1) {
    // Store a combined identifier that we can use to rebuild pages
    storeEmbedForPagination(identifier, embeds[0]); // Store first page
    if (embeds.length > 1) {
      storeEmbedForPagination(`${identifier}_page2`, embeds[1]); // Store second page
    }
  }

  return {
    content: `Zora coin detected for \`${coin.address}\`.`,
    embeds: options?.returnAllPages ? embeds : [embeds[0]], // Return all pages if requested, otherwise first page only
    components,
  };
}


