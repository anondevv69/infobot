import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { applyBranding } from "../utils/branding";

const HELP_MESSAGE = [
  "**Commands**",
  "• `/info <query>` — Universal search (wallets, contracts, profiles, transactions)",
  "• `/w <address>` — Wallet lookup (matches Farcaster/Zora first, then shows wallet info)",
  "• `/f <query>` — Farcaster user lookup (username with or without @, or wallet)",
  "• `/c <keyword>` — Farcaster cast search by keyword",
  "• `/cl <query>` — Clanker token deployment search",
  "• `/z <query>` — Zora account, contract, or creator coin search",
  "• `/t <address>` — Token lookup (get all info about a token contract)",
  "• `/r <tx>` — Cross-chain transaction details (Relay.link)",
  "• `/x <query>` — Farcaster profile by X/Twitter handle or URL",
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

