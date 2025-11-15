import { Message } from "discord.js";
import { findUserByUsername, findUserByWallet } from "../services/neynar";
import { isEthAddress, isSolAddress } from "../utils/address";
import { buildFarcasterPresentation } from "../utils/farcasterPresentation";
import { buildWalletProfileResponse } from "../utils/walletEmbed";
import { safeFetchTokensByFid, safeFetchMostRecentCast } from "../utils/farcasterHelpers";
import { collectZoraIdentifiers } from "../utils/zoraPresentation";
import { findBestZoraSummary } from "../services/zora";
import { isSummaryAssociatedWithUser } from "../utils/zoraAssociation";

const FAR_SEARCH_REGEX = /(?:^|\s)far\s+(.+)/i;

export async function handleFarSearchMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const match = message.content.match(FAR_SEARCH_REGEX);
  if (!match) {
    return false;
  }

  const query = match[1].trim();
  if (!query || query.length < 1) {
    return false;
  }

  try {
    // Try as wallet address first
    if (isEthAddress(query) || isSolAddress(query)) {
      const user = await findUserByWallet(query);
      if (user) {
        const [tokens, latestCast, zoraSummary] = await Promise.all([
          safeFetchTokensByFid(user.fid),
          safeFetchMostRecentCast(user.fid),
          findBestZoraSummary(collectZoraIdentifiers(user)),
        ]);
        const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

        const walletResponse = await buildWalletProfileResponse({
          wallet: query,
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
    }

    // Try as Farcaster username
    const normalizedUsername = query.replace(/^@/, "").toLowerCase();
    const user = await findUserByUsername(normalizedUsername);
    
    if (user) {
      const [tokens, latestCast, zoraSummary] = await Promise.all([
        safeFetchTokensByFid(user.fid),
        safeFetchMostRecentCast(user.fid),
        findBestZoraSummary(collectZoraIdentifiers(user)),
      ]);
      const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

      const presentation = await buildFarcasterPresentation(user, {
        tokens,
        zoraSummary: associatedSummary,
        latestCast,
        titleSuffix: "Farcaster Search",
      });

      await message.reply({
        embeds: presentation.embeds,
        components: presentation.components,
      });
      return true;
    }

    await message.reply({
      content: `No Farcaster profile found for \`${query}\`.`,
    });
    return true;
  } catch (error) {
    console.error("Error handling far search:", error);
    await message.reply({
      content: `Error searching for Farcaster profile: \`${query}\`.`,
    });
    return true;
  }
}

