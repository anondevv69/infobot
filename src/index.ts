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
import { handleDebugCommand } from "./commands/debug";
import { handleConnectSignerCommand } from "./commands/connectSigner";
import { handleDisconnectSignerCommand } from "./commands/disconnectSigner";
import { parsePaginationButton } from "./utils/pagination";
import { handleGeneralPagination } from "./handlers/pagination";
import { showDiscordTypingIndicator, showDiscordCommandTyping } from "./utils/typingIndicator";
import { initializeBroadcastClient } from "./services/clankerBroadcast";
import { ClankerWatcher } from "./services/clankerWatcher";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  validateRequiredEnv();

  // Log SIWF URL configuration on startup
  console.log("=".repeat(60));
  console.log("[STARTUP] SIWF Configuration Check:");
  try {
    const { generateSIWFUrl } = await import("./services/siwf");
    const testUrl = generateSIWFUrl(
      "startup-test-challenge",
      "startup-test-user",
      "discord",
      env.backendUrl || "https://infobot-production-f74e.up.railway.app",
      env.farcasterReferralCode,
    );
    const hasCorrectUrl = testUrl.includes("farcaster.xyz");
    const hasWrongUrl = testUrl.includes("warpcast.com");
    
    console.log(`[STARTUP] Generated URL: ${testUrl.substring(0, 80)}...`);
    console.log(`[STARTUP] Contains farcaster.xyz: ${hasCorrectUrl ? "✅ YES" : "❌ NO"}`);
    console.log(`[STARTUP] Contains warpcast.com: ${hasWrongUrl ? "❌ YES (WRONG!)" : "✅ NO"}`);
    console.log(`[STARTUP] Status: ${hasCorrectUrl && !hasWrongUrl ? "✅ CORRECT" : "❌ INCORRECT - Railway is running old code!"}`);
    
    if (!hasCorrectUrl || hasWrongUrl) {
      console.error("[STARTUP] 🚨 WARNING: SIWF URL generation is INCORRECT!");
      console.error("[STARTUP] 🚨 Railway is likely running old cached code!");
      console.error("[STARTUP] 🚨 Fix: Clear Railway build cache and redeploy");
    }
  } catch (error) {
    console.error("[STARTUP] Failed to test SIWF URL generation:", error);
  }
  console.log("=".repeat(60));

  // Handle unhandled promise rejections to prevent crashes
  process.on("unhandledRejection", (error) => {
    logger.error("Unhandled promise rejection", error);
    // Log but don't crash - Railway will handle if needed
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", error);
    // Log but allow Railway to restart if needed
  });

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Discord bot logged in as ${readyClient.user.tag}`);
    
    // Check if bot is in the webhook channel's server
    const { getWebhookChannelId } = await import("./utils/webhookChannel");
    const webhookChannelId = await getWebhookChannelId(process.env.LOG_WEBHOOK_URL || null);
    
    if (webhookChannelId) {
      const webhookChannel = await readyClient.channels.fetch(webhookChannelId).catch(() => null);
      if (webhookChannel && webhookChannel.isTextBased() && "guild" in webhookChannel && webhookChannel.guild) {
        const guild = webhookChannel.guild;
        const channelName = "name" in webhookChannel ? webhookChannel.name : "Unknown";
        logger.system(
          `✅ **Bot is in webhook server**\n` +
          `**Server:** ${guild.name}\n` +
          `**Channel:** ${channelName}\n` +
          `**Channel ID:** ${webhookChannelId}\n\n` +
          `You can now use \`!stats\` in this channel to view bot statistics.`,
          {
            guildId: guild.id,
            channelId: webhookChannelId,
          }
        );
      } else {
        logger.system(
          `⚠️ **Bot is NOT in webhook server**\n` +
          `The bot needs to be added to the server containing the webhook channel (ID: ${webhookChannelId}) to respond to \`!stats\` commands.\n\n` +
          `**To fix:** Add the bot to the Discord server where your webhook channel is located.`,
          {
            channelId: webhookChannelId,
          }
        );
      }
    }
    
    // Initialize broadcast client
    initializeBroadcastClient(readyClient);
    
    // Start Clanker watcher
    const watcher = new ClankerWatcher();
    watcher.start();
    logger.system("Clanker Watcher: Started monitoring Clanker deployments");
  });

  // Track when bot is added to a new Discord server
  client.on(Events.GuildCreate, async (guild) => {
    try {
      // Check database FIRST (more reliable than in-memory cache which resets on restart)
      let alreadySeen = false;
      try {
        const { env } = await import("./config");
        if (env.backendUrl) {
          const response = await fetch(`${env.backendUrl}/api/seen/discord-guild?guildId=${encodeURIComponent(guild.id)}`, {
            signal: AbortSignal.timeout(3000), // 3 second timeout
          });
          if (response.ok) {
            const data = await response.json();
            alreadySeen = data.seen === true;
          }
        }
      } catch (error) {
        // If database check fails, don't log - better to miss than duplicate
        // Only log if we're certain it's new
        return;
      }
      
      // Only log if we haven't seen this guild before
      if (!alreadySeen) {
        const memberCount = guild.memberCount || 0;
        const ownerId = guild.ownerId || "Unknown";
        const owner = await guild.fetchOwner().catch(() => null);
        const ownerTag = owner?.user.tag || `ID: ${ownerId}`;
        
        // Mark as seen in database BEFORE logging (prevents race conditions)
        try {
          const { env } = await import("./config");
          if (env.backendUrl) {
            await fetch(`${env.backendUrl}/api/seen/discord-guild`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                guildId: guild.id,
                guildName: guild.name,
                memberCount,
                ownerId,
              }),
              signal: AbortSignal.timeout(3000), // 3 second timeout
            }).catch(() => {
              // Silently fail - database might not be available
            });
          }
        } catch (error) {
          // Silently fail - database might not be available
        }
        
        logger.system(
          `🎉 **NEW DISCORD SERVER**\n` +
          `**Server:** ${guild.name}\n` +
          `**ID:** ${guild.id}\n` +
          `**Members:** ${memberCount}\n` +
          `**Owner:** ${ownerTag}\n` +
          `**Region:** ${guild.preferredLocale || "Unknown"}`,
          {
            guildId: guild.id,
            guildName: guild.name,
            memberCount,
            ownerId,
            ownerTag,
          }
        );
      }
    } catch (error) {
      logger.error("Failed to log new Discord guild", error, {
        guildId: guild.id,
        guildName: guild.name,
      });
    }
  });

  client.on(Events.InteractionCreate, handleInteraction);
  client.on(Events.MessageCreate, async (message) => {
    // Handle webhook channel commands (stats, etc.) - ONLY in webhook channel
    if (message.guild && !message.author.bot) {
      const { getWebhookChannelId } = await import("./utils/webhookChannel");
      const webhookChannelId = await getWebhookChannelId(process.env.LOG_WEBHOOK_URL || null);
      
      // If this is the webhook channel, handle admin commands and return early
      // This prevents any other handlers from running in the webhook channel
      if (webhookChannelId && message.channelId === webhookChannelId) {
        await handleWebhookChannelCommand(message);
        return; // Exit early - don't process any other handlers
      }
    }

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
    case "debug":
      await handleDebugCommand(interaction);
      break;
    case "connect-signer":
      await handleConnectSignerCommand(interaction);
      break;
    case "disconnect-signer":
      await handleDisconnectSignerCommand(interaction);
      break;
    default:
      await interaction.reply({
        content: "Command not recognized. Use `/help` for the list of available commands.",
      });
  }
}

async function handleWebhookChannelCommand(message: import("discord.js").Message): Promise<void> {
  const content = message.content.trim().toLowerCase();
  
  // Only respond to specific admin commands in the webhook channel
  // This is the ONLY place where stats and system info are accessible
  if (content === "!stats" || content === "/stats" || content === "stats" || content === "!info") {
    try {
      const { getBotStats } = await import("./utils/botStats");
      const stats = await getBotStats(message.client);
      
      const { EmbedBuilder } = await import("discord.js");
      const embed = new EmbedBuilder()
        .setTitle("📊 InfoBot Statistics")
        .setColor(0x5865f2)
        .setDescription(
          `**Discord Servers:** ${stats.discordServers}\n` +
          `**Total Users:** ${stats.totalUsers} unique users\n` +
          `**Telegram Chats:** ${stats.telegramChats} groups/channels\n` +
          (stats.telegramTotalMembers > 0 ? `**Telegram Members:** ${stats.telegramTotalMembers} total members\n` : "") +
          `**Total Searches:** ${stats.totalSearches}\n` +
          `**Uptime:** ${stats.uptime}\n` +
          `**Memory:** ${stats.memoryUsage}`
        )
        .setTimestamp()
        .setFooter({ text: "InfoBot Statistics - Admin Only" });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Failed to get stats for webhook channel", error);
      await message.reply("❌ Failed to retrieve statistics.");
    }
    return; // Exit early - don't process any other commands
  }
  
  // Show help for webhook channel commands
  if (content === "!help" || content === "/help" || content === "help") {
    const { EmbedBuilder } = await import("discord.js");
    const embed = new EmbedBuilder()
      .setTitle("🔐 Admin Commands")
      .setColor(0x5865f2)
      .setDescription(
        "**Available Commands:**\n" +
        "• `!stats` - View bot statistics\n" +
        "• `!info` - View bot statistics\n\n" +
        "⚠️ These commands are only available in this channel."
      )
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
    return;
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

