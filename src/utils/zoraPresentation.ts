import type { User } from "@neynar/nodejs-sdk/build/api";
import { EmbedBuilder } from "discord.js";
import {
  fetchZoraCoin,
  type ZoraCoin,
  type ZoraCoinSummary,
  type ZoraLookupResult,
} from "../services/zora";
import { buildZoraCoinEmbed } from "./zoraEmbeds";

export function collectZoraIdentifiers(user: User, primaryAddress?: string): string[] {
  const identifiers = new Set<string>();
  if (primaryAddress) {
    identifiers.add(primaryAddress.toLowerCase());
  }
  if (user.username) {
    identifiers.add(user.username.toLowerCase());
  }
  if (user.custody_address) {
    identifiers.add(user.custody_address.toLowerCase());
  }
  const ethAddresses = user.verified_addresses?.eth_addresses ?? [];
  ethAddresses.forEach((address) => identifiers.add(address.toLowerCase()));
  return Array.from(identifiers);
}

interface BuildZoraPresentationOptions {
  title?: string;
  includeLatest?: boolean;
  includeCreatorCoin?: boolean;
  excludeAddresses?: Iterable<string>;
}

function shouldInclude(
  coin: ZoraCoin | null | undefined,
  exclude: Set<string>,
): coin is ZoraCoin {
  if (!coin?.address) {
    return false;
  }
  return !exclude.has(coin.address.toLowerCase());
}

export async function buildZoraPresentation(
  summary: ZoraLookupResult | null,
  options?: BuildZoraPresentationOptions,
): Promise<EmbedBuilder[]> {
  const includeLatest = options?.includeLatest ?? true;
  const includeCreatorCoin = options?.includeCreatorCoin ?? true;
  const exclude = new Set(
    Array.from(options?.excludeAddresses ?? []).map((value) => value.toLowerCase()),
  );
  const embeds: EmbedBuilder[] = [];

  if (!summary) {
    return embeds;
  }

  if (includeLatest && summary.latestCoin && shouldInclude(summary.latestCoin.coin, exclude)) {
    const latestEmbed = buildZoraCoinEmbed(summary.latestCoin, {
      title: options?.title ?? "Latest Zora Coin",
      profile: summary.profile,
    });
    embeds.push(latestEmbed);
    exclude.add(summary.latestCoin.coin.address.toLowerCase());
  }

  if (includeCreatorCoin && summary.profile.creatorCoinAddress) {
    const creatorAddress = summary.profile.creatorCoinAddress;
    const normalizedCreator = creatorAddress.toLowerCase();
    if (!exclude.has(normalizedCreator)) {
      let creatorCoin =
        summary.createdCoins?.find(
          (coin) => coin.address?.toLowerCase() === normalizedCreator,
        ) ?? null;
      if (!creatorCoin) {
        creatorCoin = await fetchZoraCoin(creatorAddress);
      }
      if (shouldInclude(creatorCoin, exclude)) {
        const coinSummary: ZoraCoinSummary = {
          coin: creatorCoin,
          isCreatorCoin: true,
          source: "created",
        };
        const creatorEmbed = buildZoraCoinEmbed(coinSummary, {
          title: "Creator Coin",
          profile: summary.profile,
        });
        embeds.push(creatorEmbed);
        exclude.add(creatorCoin.address.toLowerCase());
      }
    }
  }

  return embeds;
}


