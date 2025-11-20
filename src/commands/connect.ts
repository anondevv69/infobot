import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { generateSIWFChallenge, generateSIWFUrl, getSIWFSession, storePendingVerificationInBackend } from "../services/siwf";
import { env } from "../config";

export async function handleConnectCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const usernameOrWallet = interaction.options.getString("username_or_wallet");
  
  // Check if user is already connected (check both SIWF and wallet connections)
  let existingSession = await getSIWFSession(userId, "discord", env.backendUrl);
  
  // Also check wallet connection
  if (!existingSession) {
    try {
      const walletResponse = await fetch(`${env.backendUrl}/api/wallet/connection?userId=${userId}&platform=discord`);
      if (walletResponse.ok) {
        const walletConnection = await walletResponse.json();
        if (walletConnection) {
          // Convert wallet connection to SIWF format for compatibility
          existingSession = {
            fid: walletConnection.fid || 0,
            username: walletConnection.username || "",
            custodyAddress: walletConnection.walletAddress,
            verifiedAddresses: [],
            signature: "",
          };
        }
      }
    } catch (error) {
      console.error("[Connect] Failed to check wallet connection:", error);
    }
  }
  
  if (existingSession) {
    const embed = new EmbedBuilder()
      .setTitle("✅ Already Connected")
      .setDescription(
        `You're already connected with Farcaster!\n\n` +
        `**Farcaster ID:** ${existingSession.fid}\n` +
        `**Username:** ${existingSession.username || "N/A"}\n` +
        `**Custody Wallet:** \`${existingSession.custodyAddress}\`\n\n` +
        `Use \`/disconnect\` to disconnect your account.`
      )
      .setColor(0x00ff00);

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // SECURITY: Direct username connection is disabled for security
  // Users must use SIWF flow to prove ownership of their Farcaster account
  if (usernameOrWallet) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔒 Security Notice")
          .setDescription(
            `For security, you must verify ownership of your Farcaster account.\n\n` +
            `**Direct username connection is disabled** to prevent account hijacking.\n\n` +
            `**Please use the SIWF flow:**\n` +
            `1. Click the "Connect with Farcaster" button below\n` +
            `2. Sign in to your Farcaster account in Warpcast\n` +
            `3. Approve the connection\n` +
            `4. Your account will be securely linked!\n\n` +
            `This ensures only you can connect your own Farcaster account.`
          )
          .setColor(0xff9900),
      ],
      ephemeral: true,
    });
    // Don't return - continue to show the SIWF button below
  }

  // SIMPLIFIED: Use wallet connection (no CORS issues, works with any wallet)
  const challenge = generateSIWFChallenge(userId, "discord");
  
  // Store challenge in backend
  try {
    await fetch(`${env.backendUrl}/api/wallet/pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        challenge: challenge.challenge, 
        userId, 
        platform: "discord" 
      }),
    });
  } catch (error) {
    console.error("[Connect] Failed to store pending verification:", error);
  }
  
  // Generate wallet connection URL
  const walletConnectUrl = `${env.backendUrl}/wallet-connect/index.html?userId=${userId}&platform=discord&backendUrl=${encodeURIComponent(env.backendUrl)}&challenge=${challenge.challenge}`;
  
  const walletButton = new ButtonBuilder()
    .setLabel("🔗 Connect Wallet")
    .setURL(walletConnectUrl)
    .setStyle(ButtonStyle.Link);

  const description =
    `**Connect Your Wallet for Trading**\n\n` +
    `**Step 1:** Click "Connect Wallet" below\n` +
    `**Step 2:** Connect your wallet (MetaMask, WalletConnect, etc.)\n` +
    `**Step 3:** Sign the message to verify ownership\n` +
    `**Step 4:** Return to Discord and use \`/balance\`, \`/buy\`, \`/sell\`, or \`/swap\`\n\n` +
    `✅ **Simple** - Standard wallet connection\n` +
    `🔒 **Secure** - Cryptographic signature verification\n` +
    `⚡ **Fast** - Works with any wallet\n` +
    `💎 **Trading Ready** - Use your wallet for all trades\n\n` +
    `💡 **Note:** If your wallet is your Farcaster custody address, it will be automatically linked!`;

  const embed = new EmbedBuilder()
    .setTitle("🔗 Connect Wallet")
    .setDescription(description)
    .setColor(0x8a63d2)
    .setFooter({ text: "Connect your wallet to start trading on Discord/Telegram" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents([walletButton]);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

