import { EmbedBuilder, Message, ActionRowBuilder, ButtonBuilder } from "discord.js";
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
import { buildCreatorCoinField, getZoraCoinUrl, formatAddress } from "../utils/zoraEmbeds";

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
): Promise<{ content: string; embeds: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] }> {
  const profile = summary?.profile ?? null;

  let farcasterUser: User | null = null;
  const farcasterHandle = profile?.farcasterHandle;
  if (farcasterHandle) {
    try {
      farcasterUser = await findUserByUsername(farcasterHandle.replace(/^@/, ""));
    } catch (error) {
      console.warn("Failed to fetch Farcaster profile for Zora coin:", error);
    }
  }

  let creatorCoinData: ZoraCoin | null = null;
  const creatorAddress = profile?.creatorCoinAddress;
  const normalizedCoinAddress = coin.address?.toLowerCase();
  const isCreatorCoin = profile?.creatorCoinAddress?.toLowerCase() === normalizedCoinAddress;

  if (creatorAddress) {
    const normalizedCreator = creatorAddress.toLowerCase();
    creatorCoinData =
      summary?.createdCoins?.find(
        (created) => created.address?.toLowerCase() === normalizedCreator,
      ) ?? (await fetchZoraCoin(creatorAddress));
  }

  if (!creatorCoinData && isCreatorCoin) {
    creatorCoinData = coin;
  }

  let latestCoin: ZoraCoin | null = null;
  if (isCreatorCoin && summary?.latestCoin?.coin) {
    const latestCoinAddress = summary.latestCoin.coin.address?.toLowerCase();
    if (latestCoinAddress && latestCoinAddress !== normalizedCoinAddress) {
      latestCoin = summary.latestCoin.coin;
    }
  }

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

  // Build coin embed (Page 1) - Coin details + Creator info
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
      excludeCreatorField: false, // Show creator field on page 1
    },
  );

  const embeds: EmbedBuilder[] = [coinEmbed];
  let totalPages = 1;

  // Build Page 2: Creator coin + Farcaster info (if available)
  if (creatorCoinData || farcasterUser) {
    const page2Embed = new EmbedBuilder()
      .setColor(finalIsCreatorCoin ? 0x1d4ed8 : 0x2563eb)
      .setTitle(`${finalIsCreatorCoin ? "Creator Coin" : "Zora Coin"} • Page 2`);

    // Add creator coin if available
    if (creatorCoinData && creatorCoinData.address !== coin.address) {
      const creatorCoinField = buildCreatorCoinField(profile, true, creatorCoinData);
      if (creatorCoinField) {
        page2Embed.addFields(creatorCoinField);
      }
    }

    // Add latest coin if available
    if (latestCoin) {
      const coinUrl = getZoraCoinUrl(latestCoin);
      const label = latestCoin.name ?? latestCoin.symbol ?? latestCoin.address;
      const truncatedLabel = label.length > 50 ? `${label.slice(0, 47)}...` : label;
      const value = coinUrl
        ? `[${truncatedLabel}](${coinUrl})\n${formatAddress(latestCoin.address, latestCoin.chainId)}`
        : `${truncatedLabel}\n${formatAddress(latestCoin.address, latestCoin.chainId)}`;
      page2Embed.addFields({
        name: "Latest Zora Coin",
        value,
        inline: false,
      });
    }

    // Add Farcaster profile if available
    if (farcasterUser) {
      const { embed: farcasterEmbed } = buildUserClankerEmbed(
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

      // Copy all fields from farcaster embed to page 2
      farcasterEmbed.data.fields?.forEach(field => {
        page2Embed.addFields(field);
      });

      applyBranding(page2Embed, "zora coin", finalIsCreatorCoin ? "creator coin" : null);
    } else {
      applyBranding(page2Embed, "zora coin", finalIsCreatorCoin ? "creator coin" : null);
    }

    embeds.push(page2Embed);
    totalPages = 2;
  }

  const identifier = `zora_coin_${coin.address}`;

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    components.push(...buildPaginationButtons(0, totalPages, identifier));
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
    embeds: [embeds[0]], // Return first page only
    components,
  };
}


