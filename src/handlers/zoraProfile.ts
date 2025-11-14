import { Message } from "discord.js";
import { findBestZoraSummary } from "../services/zora";
import { buildZoraProfileEmbed } from "../utils/zoraEmbeds";
import { buildZoraPresentation } from "../utils/zoraPresentation";

const ZORA_PROFILE_REGEX = /https:\/\/zora\.co\/@([a-z0-9_.-]+)/gi;

export async function handleZoraProfileMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const matches = [...message.content.matchAll(ZORA_PROFILE_REGEX)];
  if (matches.length === 0) {
    return false;
  }

  const seen = new Set<string>();
  for (const match of matches) {
    const username = match[1].toLowerCase();
    if (seen.has(username)) {
      continue;
    }
    seen.add(username);

    const summary = await findBestZoraSummary([username, `@${username}`]);
    if (!summary) {
      continue;
    }

    const profileEmbed = buildZoraProfileEmbed(summary);
    const coinEmbeds = await buildZoraPresentation(summary, {
      includeLatest: true,
      includeCreatorCoin: true,
    });

    await message.reply({
      embeds: [profileEmbed, ...coinEmbeds],
    });
    return true;
  }

  return false;
}
