import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { env, requireEnv, validateRequiredEnv } from "./config";

export async function registerCommands(): Promise<void> {
  validateRequiredEnv();

  const clientId = requireEnv(env.discordClientId, "DISCORD_CLIENT_ID");
  const token = requireEnv(env.discordToken, "DISCORD_TOKEN");

  const commands = [
    new SlashCommandBuilder()
      .setName("info")
      .setDescription("Universal search for wallets, contracts, Farcaster profiles, Zora accounts, or transactions.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Wallet (0x...), contract, Farcaster username, Zora account, or transaction hash")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("w")
      .setDescription("Wallet lookup - matches to Farcaster/Zora first, then shows wallet info.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Wallet address (0x... for Ethereum/Base/Monad or base58 for Solana)")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("f")
      .setDescription("Farcaster user lookup by username or wallet address.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Farcaster username (with or without @) or wallet address (0x...)")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("c")
      .setDescription("Search Farcaster casts by keyword.")
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
      .setName("cl")
      .setDescription("Clanker token deployment search.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Keyword, symbol, contract, Farcaster username, or wallet")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("z")
      .setDescription("Zora account, contract, or creator coin search.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Zora account handle, contract address, or creator coin")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("t")
      .setDescription("Token lookup - get all information about a token contract address.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("Token contract address (0x...)")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("r")
      .setDescription("Cross-chain transaction details from Relay.link.")
      .addStringOption((option) =>
        option
          .setName("transaction")
          .setDescription("Full transaction link (e.g., https://basescan.org/tx/0x...) or transaction hash")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("x")
      .setDescription("Farcaster profile lookup by X/Twitter handle or URL.")
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription("X/Twitter handle (@username) or URL (https://x.com/username)")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Display a rundown of commands and automatic responses."),
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
  // Global commands will automatically replace any old guild-specific commands over time
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Registered global commands (works in ALL servers)");
    console.log(`   📋 Registered ${commands.length} commands: ${commands.map((c: any) => c.name).join(", ")}`);
    console.log("   ⏳ Global commands may take up to 1 hour to propagate to all servers, but usually appear within minutes.");
    console.log("   💡 All servers will eventually show the same commands once Discord's cache updates.");
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
  // NOTE: Guild-specific commands take precedence over global commands in those specific guilds
  // This is useful for instant command updates during development, but can cause inconsistency
  // For production, it's recommended to leave DISCORD_GUILD_ID empty to use only global commands
  addGuildIds(env.discordGuildIds);
  addGuildIds(env.discordGuildId);

  if (guildIds.size > 0) {
    console.log(`\n📋 Also registering to ${guildIds.size} specific guild(s) for instant updates...`);
    console.log("   ⚠️  Note: Guild-specific commands override global commands in these servers.");
    console.log("   💡 For consistency across all servers, consider removing DISCORD_GUILD_ID to use only global commands.");
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
  } else {
    console.log("\n💡 No DISCORD_GUILD_ID set - using global commands only (recommended for production)");
    console.log("   All servers will show the same commands once Discord's cache updates.");
  }
}

// Only run if this file is executed directly (not imported)
if (require.main === module) {
  registerCommands().catch((error) => {
    console.error("Failed to register Discord commands:", error);
    process.exitCode = 1;
  });
}

