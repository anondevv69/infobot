import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { applyBranding } from "../utils/branding";

const HELP_MESSAGE = [
  "**Commands**",
  "• `/search <query>` — Universal search (wallets, contracts, profiles, transactions)",
  "• `/info <query>` — Alias for `/search`",
  "• `/wallet <address>` — Search wallet across all EVM chains (Ethereum, Base, Monad)",
  "• `/w <address>` — Wallet lookup (Ethereum or Solana)",
  "• `/zora <query>` — Zora accounts, contracts, or creator coins",
  "• `/z <query>` — Alias for `/zora`",
  "• `/clanker <query>` — Clanker token deployments",
  "• `/casts <keyword>` — Search Farcaster casts by keyword",
  "• `/cast <keyword>` — Alias for `/casts`",
  "• `/far <query>` — Search Farcaster users (username or wallet)",
  "• `/x <query>` — Farcaster profile by X/Twitter handle or URL",
  "• `/relay <tx>` — Cross-chain transaction details",
  "• `/help` — Show this help message",
  "",
  "**Auto-Detection**",
  "Paste in chat:",
  "• Addresses (0x... or SOL) — Auto-detects Zora/Clanker/Base tokens",
  "• `@username` — Farcaster profile lookup",
  "• `zora.co/...` — Zora profile/coin",
  "• `clanker.world` — Clanker token",
  "• `x.com/...` or `twitter.com/...` — Farcaster profile (if linked)",
  "• `farcaster.xyz/...` — Farcaster cast/profile",
  "• `base.org/...` or `base.app/...` — Base post",
  "• `cast <keyword>` — Cast search",
  "• `far <keyword>` — Farcaster user search",
  "• `zora <query>` — Zora search",
  "• `wallet 0x...` — Wallet lookup",
  "• `info <query>` — Universal search (no slash needed)",
  "",
  "**Features**",
  "• Multi-page cards with pagination",
  "• Zora coins, profiles, creator detection",
  "• Farcaster profiles, casts, wallet links",
  "• Clanker tokens with deployer info",
  "• Base token factory detection",
  "• Multi-chain token support (Ethereum, Base, Monad, Solana)",
  "• Cross-chain transaction tracking",
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
    .setColor(0x5865f2);

  // Apply InfoBot branding (version, rayblanco.eth, icon)
  applyBranding(embed, "help");

  await interaction.reply({
    embeds: [embed],
  });
}

