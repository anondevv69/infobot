import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { env, requireEnv, validateRequiredEnv } from "./config";

export async function registerCommands(): Promise<void> {
  validateRequiredEnv();

  const clientId = requireEnv(env.discordClientId, "DISCORD_CLIENT_ID");
  const token = requireEnv(env.discordToken, "DISCORD_TOKEN");

  const commands = [
    new SlashCommandBuilder()
      .setName("search")
      .setDescription("Search wallets, contracts, Farcaster profiles, Zora accounts, or transactions.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Wallet (0x...), contract, Farcaster username, Zora account, or transaction hash")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("casts")
      .setDescription("Show the earliest and recent Farcaster casts that mention a keyword.")
      .addStringOption((option) =>
        option
          .setName("keyword")
          .setDescription("Keyword or phrase to search for in casts")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("recent_count")
          .setDescription("Number of recent casts to include (0-5, default 2)")
          .setMinValue(0)
          .setMaxValue(5),
      ),
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Display a rundown of commands and automatic responses."),
    new SlashCommandBuilder()
      .setName("zora")
      .setDescription("Search Zora accounts, contracts, or creator coins.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Zora account handle, contract address, or creator coin")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("clanker")
      .setDescription("Search Clanker deployments by keyword, symbol, address, username, or wallet.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Keyword, symbol, contract, Farcaster username, or wallet")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("relay")
      .setDescription("Get cross-chain transaction details from Relay.link. Provide a transaction link.")
      .addStringOption((option) =>
        option
          .setName("transaction")
          .setDescription("Full transaction link (e.g., https://basescan.org/tx/0x...) or transaction hash")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("cast")
      .setDescription("Search Farcaster casts by keyword (alias for /casts).")
      .addStringOption((option) =>
        option
          .setName("keyword")
          .setDescription("Keyword or phrase to search for in casts")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("recent_count")
          .setDescription("Number of recent casts to include (0-5, default 2)")
          .setMinValue(0)
          .setMaxValue(5),
      ),
    new SlashCommandBuilder()
      .setName("far")
      .setDescription("Search Farcaster users by username or wallet address.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Farcaster username (@username) or wallet address (0x...)")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("z")
      .setDescription("Search Zora accounts, contracts, or creator coins (alias for /zora).")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Zora account handle, contract address, or creator coin")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("w")
      .setDescription("Lookup wallet address (Ethereum or Solana).")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Wallet address (0x... for Ethereum or base58 for Solana)")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("wallet")
      .setDescription("Search wallet address across all EVM chains (Ethereum, Base, Monad).")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Wallet address (0x...)")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("x")
      .setDescription("Lookup Farcaster profile by X/Twitter handle or URL.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("X/Twitter handle (@username) or URL (https://x.com/username)")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("info")
      .setDescription("Universal search for wallets, contracts, profiles, or transactions (alias for /search).")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Wallet (0x...), contract, Farcaster username, Zora account, or transaction hash")
          .setRequired(true),
      ),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);

  const guildIds = new Set<string>();

  const addGuildIds = (value: string | undefined | null) => {
    if (!value) {
      return;
    }
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .forEach((part) => guildIds.add(part));
  };

  // ALWAYS register globally first (for all servers)
  // This ensures commands work universally across all servers the bot is in
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Registered global commands (works in ALL servers)");
    console.log("   ⏳ Global commands may take up to 1 hour to propagate, but usually appear within minutes.");
  } catch (error: any) {
    if (error?.code === 50001) {
      console.warn(`⚠️ Missing permissions to register global commands. Bot needs "applications.commands" scope.`);
      console.warn(`   Tip: Re-invite the bot with the "applications.commands" scope in the OAuth2 URL.`);
    } else {
      console.error(`❌ Failed to register global commands:`, error);
    }
    // Don't throw - try guild-specific registration as fallback
  }

  // Optionally also register to specific guilds (for faster testing/development)
  // This is useful for instant command updates during development
  addGuildIds(env.discordGuildIds);
  addGuildIds(env.discordGuildId);

  if (guildIds.size > 0) {
    console.log(`\n📋 Also registering to ${guildIds.size} specific guild(s) for instant updates...`);
    for (const guildId of guildIds) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
          body: commands,
        });
        console.log(`   ✅ Registered guild commands for guild ${guildId} (instant updates)`);
      } catch (error: any) {
        if (error?.code === 50001) {
          console.warn(`   ⚠️ Missing permissions to register commands in guild ${guildId}. Bot needs "applications.commands" permission.`);
        } else {
          console.warn(`   ⚠️ Failed to register commands for guild ${guildId}:`, error?.message || error);
        }
        // Continue to next guild - this is optional
      }
    }
  }
}

// Only run if this file is executed directly (not imported)
if (require.main === module) {
  registerCommands().catch((error) => {
    console.error("Failed to register Discord commands:", error);
    process.exitCode = 1;
  });
}

