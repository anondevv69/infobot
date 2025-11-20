import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

const HELP_MESSAGE = [
  "**Commands**",
  "• `/search <query>` — Universal search (wallets, contracts, profiles)",
  "• `/zora <query>` — Zora accounts, contracts, or creator coins",
  "• `/clanker <query>` — Clanker token deployments",
  "• `/casts <keyword>` — Search Farcaster casts by keyword",
  "• `/relay <tx>` — Cross-chain transaction details",
  "",
  "**Auto-Detection**",
  "Paste in chat:",
  "• Addresses (0x... or SOL) — Auto-detects Zora/Clanker/Base tokens",
  "• `@username` — Farcaster profile lookup",
  "• `zora.co/...` — Zora profile/coin",
  "• `clanker.world` — Clanker token",
  "• `x.com/...` or `twitter.com/...` — Farcaster profile (if linked)",
  "• `farcaster.xyz/...` — Farcaster cast/profile",
  "• `cast <keyword>` — Cast search",
  "• `far <keyword>` — Farcaster user search",
  "• `zora <query>` — Zora search",
  "• `wallet 0x...` — Wallet lookup",
  "",
  "**Features**",
  "• Multi-page cards with pagination",
  "• Zora coins, profiles, creator detection",
  "• Farcaster profiles, casts, wallet links",
  "• Clanker tokens with deployer info",
  "• Base token factory detection",
  "• Multi-chain token support",
  "",
  "Fast blockchain discovery—drop any address, profile, or link.",
].join("\n");

export async function handleHelpCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // Use embed instead of content to avoid 2000 character limit
  // Embed description can be up to 4096 characters
  const embed = new EmbedBuilder()
    .setTitle("📚 InfoBot Commands & Features")
    .setDescription(HELP_MESSAGE)
    .setColor(0x5865f2)
    .setFooter({ text: "InfoBot - Fast blockchain discovery" });

  await interaction.reply({
    embeds: [embed],
  });
}

