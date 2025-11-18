import { Message } from "discord.js";
import { findUserByWallet } from "../services/neynar";
import { isEthAddress, isSolAddress } from "../utils/address";
import { buildWalletProfileResponse } from "../utils/walletEmbed";
import { buildZoraWalletProfileResponse } from "../utils/walletEmbed";
import { safeFetchTokensByFid, safeFetchMostRecentCast } from "../utils/farcasterHelpers";
import { collectZoraIdentifiers } from "../utils/zoraPresentation";
import { findBestZoraSummary } from "../services/zora";
import { isSummaryAssociatedWithUser, isSummaryAssociatedWithAddress } from "../utils/zoraAssociation";
import { fetchTokensByAddress } from "../services/clanker";
import { buildTokenEmbed } from "../utils/clankerEmbeds";
import { resolveUserFromToken } from "../utils/clankerEmbeds";
import { safeFetchEarliestCastByQuery } from "../utils/farcasterHelpers";
import { buildZoraCoinResponse } from "./zoraAddress";
import { fetchZoraCoin } from "../services/zora";

const WALLET_SEARCH_REGEX = /(?:^|\s)wallet\s+(.+)/i;

export async function handleWalletSearchMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const match = message.content.match(WALLET_SEARCH_REGEX);
  if (!match) {
    return false;
  }

  const query = match[1].trim();
  if (!query || query.length < 1) {
    return false;
  }

  // Must be a valid wallet address
  if (!isEthAddress(query) && !isSolAddress(query)) {
    await message.reply({
      content: `\`${query}\` is not a valid wallet address. Please provide an Ethereum (0x...) or Solana address.`,
    });
    return true;
  }

  try {
    const address = query;

    // Try Farcaster user by wallet first
    let user;
    try {
      user = await findUserByWallet(address);
    } catch (error) {
      console.warn("Failed Neynar wallet lookup, continuing with other lookups:", error);
    }

    // Try Zora summary
    const zoraSummaryFromAddress = await findBestZoraSummary([address.toLowerCase()]);

    // If we have a Farcaster user, show wallet profile with Farcaster info
    if (user) {
      const zoraIdentifiers = collectZoraIdentifiers(user, address);
      const [tokens, latestCast, zoraSummaryForUser] = await Promise.all([
        safeFetchTokensByFid(user.fid),
        safeFetchMostRecentCast(user.fid),
        findBestZoraSummary(zoraIdentifiers),
      ]);

      const associatedSummary =
        zoraSummaryForUser && isSummaryAssociatedWithUser(user, zoraSummaryForUser)
          ? zoraSummaryForUser
          : zoraSummaryFromAddress;

      const walletResponse = await buildWalletProfileResponse({
        wallet: address,
        user,
        zoraSummary: associatedSummary,
        clankerTokens: tokens,
        latestCast,
      });

      await message.reply({
        embeds: walletResponse.embeds,
        components: walletResponse.components,
      });
      return true;
    }

    // Try Clanker tokens
    const clankerTokens = await fetchTokensByAddress(address);
    if (clankerTokens.length > 0) {
      const firstToken = clankerTokens[0];
      const associatedUser = await resolveUserFromToken(firstToken);
      
      if (associatedUser) {
        const [creatorTokens, latestCast, zoraSummaryForCreator] = await Promise.all([
          safeFetchTokensByFid(associatedUser.fid),
          safeFetchMostRecentCast(associatedUser.fid),
          findBestZoraSummary(collectZoraIdentifiers(associatedUser, address)),
        ]);

        const associatedSummary =
          zoraSummaryForCreator &&
          isSummaryAssociatedWithUser(associatedUser, zoraSummaryForCreator)
            ? zoraSummaryForCreator
            : zoraSummaryFromAddress;

        const walletResponse = await buildWalletProfileResponse({
          wallet: address,
          user: associatedUser,
          zoraSummary: associatedSummary,
          clankerTokens: creatorTokens,
          latestCast,
        });

        await message.reply({
          content: `No Farcaster profile linked directly to \`${address}\`, but the address is associated with this Clanker creator:`,
          embeds: walletResponse.embeds,
          components: walletResponse.components,
        });
        return true;
      }

      // Show Clanker token if no associated user
      const earliestCast = firstToken.contract_address
        ? await safeFetchEarliestCastByQuery(firstToken.contract_address)
        : null;
      
      const tokenEmbed = await buildTokenEmbed(firstToken, {
        zoraSummary: zoraSummaryFromAddress ?? undefined,
        earliestCast,
      });

      await message.reply({
        content: `No Farcaster profile linked directly to \`${address}\`. Showing Clanker token associated with this address:`,
        embeds: [tokenEmbed],
      });
      return true;
    }

    // Try Zora coin
    if (zoraSummaryFromAddress) {
      const lowerAddress = address.toLowerCase();
      let matchedCoin =
        zoraSummaryFromAddress.latestCoin?.coin.address?.toLowerCase() === lowerAddress
          ? zoraSummaryFromAddress.latestCoin.coin
          : null;

      if (
        !matchedCoin &&
        zoraSummaryFromAddress.profile.creatorCoinAddress?.toLowerCase() === lowerAddress
      ) {
        matchedCoin =
          zoraSummaryFromAddress.createdCoins?.find(
            (coin) => coin.address?.toLowerCase() === lowerAddress,
          ) ?? null;
      }

      if (!matchedCoin) {
        matchedCoin = await fetchZoraCoin(address);
      }

      if (matchedCoin) {
        const response = await buildZoraCoinResponse(matchedCoin, zoraSummaryFromAddress);
        await message.reply(response);
        return true;
      }

      // Show Zora wallet profile
      const associated = isSummaryAssociatedWithAddress(zoraSummaryFromAddress, address)
        ? zoraSummaryFromAddress
        : null;

      const zoraResponse = buildZoraWalletProfileResponse({
        wallet: address,
        summary: associated ?? zoraSummaryFromAddress,
      });

      await message.reply({
        content: `No Farcaster profile or Clanker deployments found for \`${address}\`, but the address is associated with this Zora profile:`,
        embeds: zoraResponse.embeds,
        components: zoraResponse.components,
      });
      return true;
    }

    // No results
    await message.reply({
      content: `No Farcaster profile, Clanker deployments, or Zora profile found for wallet \`${address}\`.`,
    });
    return true;
  } catch (error) {
    console.error("Error handling wallet search:", error);
    await message.reply({
      content: `Error searching for wallet: \`${query}\`.`,
    });
    return true;
  }
}



