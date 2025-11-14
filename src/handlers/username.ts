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

function extractCandidateUsernames(content: string): string[] {
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
    let user;
    try {
      user = await findUserByUsername(username);
    } catch (error) {
      if (error instanceof NeynarLookupError) {
        console.warn(
          `Neynar lookup failed for username @${username}: ${error.message}`,
        );
        if (await replyWithZoraSummary(message, username)) {
          return;
        }
        continue;
      }
      throw error;
    }

    if (!user) {
      if (await replyWithZoraSummary(message, username)) {
        return;
      }
      continue;
    }

    const [tokens, latestCast, zoraSummaryForUser] = await Promise.all([
      safeFetchTokensByFid(user.fid),
      safeFetchMostRecentCast(user.fid),
      findBestZoraSummary(collectZoraIdentifiers(user)),
    ]);

    const { deployed: deployedTokens } = splitClankerTokens(tokens, user);

    const associatedZoraSummary =
      zoraSummaryForUser && isSummaryAssociatedWithUser(user, zoraSummaryForUser)
        ? zoraSummaryForUser
        : null;

    const { embed, clankerEntries } = buildUserClankerEmbed(
      user,
      "Username Lookup",
      deployedTokens,
    );

    appendZoraSummaryFields(embed, associatedZoraSummary, { latestCast });
    applyBranding(embed, "farcaster lookup");

    const detailRows = buildTokenDetailRows(
      clankerEntries.map((entry) => entry.token),
      { includeButtons: false },
    );

    const zoraEmbeds: Awaited<ReturnType<typeof buildZoraPresentation>> = [];

    await message.reply({
      embeds: [embed, ...zoraEmbeds],
      components: detailRows,
    });
    return;
  }

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
    const [tokens, latestCast] = await Promise.all([
      safeFetchTokensByFid(user.fid),
      safeFetchMostRecentCast(user.fid),
    ]);
    const { embed, clankerEntries } = buildUserClankerEmbed(
      user,
      "Wallet Lookup",
      tokens,
    );
    applyBranding(embed, "farcaster lookup");
    const detailRows = buildTokenDetailRows(
      clankerEntries.map((entry) => entry.token),
      { includeButtons: false },
    );
    const zoraSummary = await findBestZoraSummary(collectZoraIdentifiers(user));
    const associatedSummary =
      zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

    appendZoraSummaryFields(embed, associatedSummary, { latestCast });

    const zoraEmbeds: Awaited<ReturnType<typeof buildZoraPresentation>> = [];

    await message.reply({
      embeds: [embed, ...zoraEmbeds],
      components: detailRows,
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
  const coinEmbeds = await buildZoraPresentation(summary);

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

  await message.reply({
    embeds: farcasterEmbeds
      ? [...farcasterEmbeds.embeds, profileEmbed, ...coinEmbeds]
      : [profileEmbed, ...coinEmbeds],
    components: farcasterEmbeds?.components ?? [],
  });
  return true;
}


