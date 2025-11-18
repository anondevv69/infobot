import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
} from "discord.js";
import { env, requireEnv, validateRequiredEnv } from "./config";
import { handleHelpCommand } from "./commands/help";
import { handleSearchCommand } from "./commands/search";
import { handleCastsCommand } from "./commands/casts";
import { handleCastLinkMessage } from "./handlers/castLink";
import { handleCastKeywordMessage } from "./handlers/castKeyword";
import { handleFarSearchMessage } from "./handlers/farSearch";
import { handleZoraSearchMessage } from "./handlers/zoraSearch";
import { handleWalletSearchMessage } from "./handlers/walletSearch";
import { handleClankerAddressMessage } from "./handlers/clankerAddress";
import { handleTokenDetailButton } from "./handlers/tokenDetailButton";
import { handleZoraAddressMessage } from "./handlers/zoraAddress";
import { handleUsernameMessage } from "./handlers/username";
import { handleBasePostMessage } from "./handlers/basePost";
import { handleZoraProfileMessage } from "./handlers/zoraProfile";
import { handleZoraProfileCommand } from "./commands/zora";
import { TOKEN_DETAIL_BUTTON_PREFIX } from "./utils/clankerEmbeds";
import { COPY_BUTTON_PREFIX } from "./utils/copyButtons";
import { handleXAccountMessage } from "./handlers/xAccount";
import { handleCopyValueButton } from "./handlers/copyValueButton";
import { handleClankerCommand, handleClankerPagination } from "./commands/clanker";
import { handleRelayCommand } from "./commands/relay";
import { handleConnectCommand } from "./commands/connect";
import { handleDisconnectCommand } from "./commands/disconnect";
import { handleBalanceCommand } from "./commands/balance";
import { handleBuyCommand, handleSellCommand, handleSwapCommand } from "./commands/trade";
import { parsePaginationButton } from "./utils/pagination";
import { handleGeneralPagination } from "./handlers/pagination";
import { showDiscordTypingIndicator, showDiscordCommandTyping } from "./utils/typingIndicator";

async function main(): Promise<void> {
  validateRequiredEnv();

  // Handle unhandled promise rejections to prevent crashes
  process.on("unhandledRejection", (error) => {
    console.error("Unhandled promise rejection:", error);
    // Log but don't crash - Railway will handle if needed
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    // Log but allow Railway to restart if needed
  });

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, handleInteraction);
  client.on(Events.MessageCreate, async (message) => {
    // Skip bot messages and DMs (only respond in guilds)
    if (message.author.bot || !message.guild) {
      return;
    }

    // Show typing indicator (eye emoji reaction) for auto-detected messages
    // We'll add it early, but only if the message might trigger a response
    const text = message.content?.toLowerCase() || "";
    const mightTriggerResponse = 
      text.includes("0x") || // Address
      text.includes("cast") || // Cast keyword
      text.includes("far ") || // Far search
      text.includes("zora ") || // Zora search
      text.includes("wallet ") || // Wallet search
      text.startsWith("@") || // Username
      text.includes("x.com") || text.includes("twitter.com") || // X links
      text.includes("farcaster.xyz") || // Farcaster links
      text.includes("zora.co") || // Zora links
      text.includes("clanker.world"); // Clanker links

    if (mightTriggerResponse) {
      await showDiscordTypingIndicator(message);
    }

    await handleUsernameMessage(message);
    if (await handleXAccountMessage(message)) {
      return;
    }
    if (await handleZoraProfileMessage(message)) {
      return;
    }
    if (await handleBasePostMessage(message)) {
      return;
    }
    if (await handleClankerAddressMessage(message)) {
      return;
    }
    if (await handleZoraAddressMessage(message)) {
      return;
    }
    if (await handleCastKeywordMessage(message)) {
      return;
    }
    if (await handleFarSearchMessage(message)) {
      return;
    }
    if (await handleZoraSearchMessage(message)) {
      return;
    }
    if (await handleWalletSearchMessage(message)) {
      return;
    }
    await handleCastLinkMessage(message);
  });

  await client.login(requireEnv(env.discordToken, "DISCORD_TOKEN"));
}

async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) {
    await handleChatCommand(interaction);
    return;
  }

  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
}

async function handleChatCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // Show typing indicator for slash commands
  await showDiscordCommandTyping(interaction);

  switch (interaction.commandName) {
    case "search":
      await handleSearchCommand(interaction);
      break;
    case "casts":
      await handleCastsCommand(interaction);
      break;
    case "zora":
      await handleZoraProfileCommand(interaction);
      break;
    case "help":
      await handleHelpCommand(interaction);
      break;
    case "clanker":
      await handleClankerCommand(interaction);
      break;
    case "relay":
      await handleRelayCommand(interaction);
      break;
    case "connect":
      await handleConnectCommand(interaction);
      break;
    case "disconnect":
      await handleDisconnectCommand(interaction);
      break;
    case "balance":
      await handleBalanceCommand(interaction);
      break;
    case "buy":
      await handleBuyCommand(interaction);
      break;
    case "sell":
      await handleSellCommand(interaction);
      break;
    case "swap":
      await handleSwapCommand(interaction);
      break;
    default:
      await interaction.reply({
        content: "Command not recognized. Use `/help` for the list of available commands.",
      });
  }
}

async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId.startsWith(TOKEN_DETAIL_BUTTON_PREFIX)) {
    await handleTokenDetailButton(interaction);
    return;
  }

  if (interaction.customId.startsWith(COPY_BUTTON_PREFIX)) {
    await handleCopyValueButton(interaction);
    return;
  }

  if (interaction.customId.startsWith("clanker_page_")) {
    const match = interaction.customId.match(/^clanker_page_(-?\d+)\|(.+)$/);
    if (match) {
      const page = parseInt(match[1], 10);
      const encodedQuery = match[2];
      try {
        const query = Buffer.from(encodedQuery, "base64url").toString("utf-8");
        if (!isNaN(page)) {
          await handleClankerPagination(interaction, page, query);
        }
      } catch (error) {
        console.warn("Failed to decode query from button:", error);
      }
    }
    return;
  }

  // Handle general pagination buttons
  if (interaction.customId.startsWith("page_")) {
    const parsed = parsePaginationButton(interaction.customId);
    if (parsed) {
      await handleGeneralPagination(interaction, parsed.page, parsed.identifier);
    }
    return;
  }
}

// Start both Discord and Telegram bots
async function startBots(): Promise<void> {
  try {
    // Start Discord bot
    await main();
    
    // Start Telegram bot (if token is provided)
    const { startTelegramBot } = await import("./platforms/telegram");
    await startTelegramBot();
  } catch (error) {
    console.error("Failed to start bots:", error);
    process.exitCode = 1;
  }
}

void startBots();

