import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { env, requireEnv, validateRequiredEnv } from "./config";

async function registerCommands(): Promise<void> {
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
      .setName("connect")
      .setDescription("Connect your Farcaster account to enable trading.")
      .addStringOption((option) =>
        option
          .setName("username_or_wallet")
          .setDescription("Your Farcaster username (@username) or wallet address (0x...) - optional")
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("disconnect")
      .setDescription("Disconnect your Farcaster account."),
    new SlashCommandBuilder()
      .setName("balance")
      .setDescription("Check your wallet balance for a token.")
      .addStringOption((option) =>
        option
          .setName("token")
          .setDescription("Token address (0x...) or 'native' for ETH. Default: native")
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("chain")
          .setDescription("Chain ID (1=Ethereum, 8453=Base, etc.). Default: 8453 (Base)")
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("buy")
      .setDescription("Buy tokens with ETH/native token.")
      .addStringOption((option) =>
        option
          .setName("token")
          .setDescription("Token address to buy (0x...)")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("amount")
          .setDescription("Amount of ETH/native token to spend (e.g., 0.1)")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("chain")
          .setDescription("Chain ID (1=Ethereum, 8453=Base, etc.). Default: 8453 (Base)")
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("sell")
      .setDescription("Sell tokens for ETH/native token.")
      .addStringOption((option) =>
        option
          .setName("token")
          .setDescription("Token address to sell (0x...)")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("amount")
          .setDescription("Amount of tokens to sell (e.g., 100)")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("chain")
          .setDescription("Chain ID (1=Ethereum, 8453=Base, etc.). Default: 8453 (Base)")
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("swap")
      .setDescription("Swap between two tokens.")
      .addStringOption((option) =>
        option
          .setName("from")
          .setDescription("Token address to swap from (0x...) or 'native' for ETH")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("to")
          .setDescription("Token address to swap to (0x...) or 'native' for ETH")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("amount")
          .setDescription("Amount to swap (e.g., 0.1)")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("chain")
          .setDescription("Chain ID (1=Ethereum, 8453=Base, etc.). Default: 8453 (Base)")
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("debug")
      .setDescription("Debug SIWF URL generation and check deployment status."),
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

  addGuildIds(env.discordGuildIds);
  addGuildIds(env.discordGuildId);

  if (guildIds.size > 0) {
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log(`Registered guild commands for guild ${guildId}`);
    }
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Registered global commands");
  }
}

registerCommands().catch((error) => {
  console.error("Failed to register Discord commands:", error);
  process.exitCode = 1;
});

