import { ChatInputCommandInteraction, MessageFlags } from "discord.js";

const HELP_MESSAGE = [
  "**Slash Commands**",
  "• `/search <query>` — Search wallets, contracts (Clanker/Zora), Farcaster profiles, or Zora accounts. Shows all associated tokens and profiles.",
  "• `/zora <query>` — Search Zora accounts, contracts, or creator coins. Shows profile, creator coin, and latest posts.",
  "• `/casts <keyword> [recent_count]` — Search casts by keyword. Shows earliest match first, then 2 most recent (paginated).",
  "• `/clanker <query>` — Search Clanker tokens by wallet, Farcaster username, or token name/ticker. Shows all deployments with pagination.",
  "• `/help` — Display this overview.",
  "",
  "**Auto-Detection (Drop in Chat)**",
  "• **Zora Contracts** — Paste any Zora coin address or `zora.co/coin/...` link",
  "• **Clanker Contracts** — Paste any Clanker token contract address",
  "• **Wallet Addresses** — Paste any ETH (0x...) or SOL wallet address",
  "• **Farcaster Usernames** — Type `@username` or paste a Farcaster profile link",
  "• **X/Twitter Accounts** — Paste X.com or Twitter.com profile links (if linked to Farcaster)",
  "• **Cast Links** — Paste Warpcast, Fcast, or Farcaster cast URLs",
  "• **Cast Keywords** — Type `cast <keyword>` or `search <keyword>` to find casts",
  "",
  "**Features**",
  "• **Multi-Page Cards** — All cards support pagination when there's more information",
  "• **Zora Coins** — Shows coin details, creator info, creator coin, and Farcaster profile",
  "• **Farcaster Profiles** — Shows profile, wallets, recent cast, Clanker deployments, and Zora info",
  "• **Clanker Tokens** — Shows token details, deployer info, Farcaster profile, and Zora info",
  "• **Wallet Lookups** — Automatically detects and shows Farcaster profiles, Zora accounts, and Clanker tokens",
  "",
  "Designed for fast, accurate blockchain discovery—drop a contract, wallet, or profile and get the essentials instantly.",
].join("\n");

export async function handleHelpCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.reply({
    content: HELP_MESSAGE,
    flags: MessageFlags.Ephemeral,
  });
}

