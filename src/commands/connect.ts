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
  
  // Check if user is already connected
  const existingSession = await getSIWFSession(userId, "discord", env.backendUrl);
  if (existingSession) {
    // Check if user has a signer
    let hasSigner = false;
    let signerAddress = "";
    try {
      const signerResponse = await fetch(`${env.backendUrl}/api/siwf/signer?userId=${userId}&platform=discord`);
      if (signerResponse.ok) {
        const signerData = await signerResponse.json();
        hasSigner = !!signerData.signerAddress;
        signerAddress = signerData.signerAddress || "";
      }
    } catch (error) {
      console.error("[Connect] Failed to check signer:", error);
    }

    const embed = new EmbedBuilder()
      .setTitle("✅ Already Connected")
      .setDescription(
        `You're already connected with Farcaster!\n\n` +
        `**Farcaster ID:** ${existingSession.fid}\n` +
        `**Username:** ${existingSession.username || "N/A"}\n` +
        `**Custody Wallet:** \`${existingSession.custodyAddress}\`\n\n` +
        (hasSigner
          ? `✅ **Trading Signer:** Connected (\`${signerAddress.slice(0, 10)}...${signerAddress.slice(-8)}\`)\n\n`
          : `⚠️ **Trading Signer:** Not connected\n\n` +
            `To enable trading, run \`/connect-signer <private_key>\`\n\n`) +
        `Use \`/disconnect\` to disconnect your account.`
      )
      .setColor(hasSigner ? 0x00ff00 : 0xff9900);

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

  // Try Mini App first (best UX), fallback to direct SIWF if Mini App URL not configured
  let connectUrl: string;
  let connectLabel: string;
  let description: string;

  if (env.miniappUrl && !env.miniappUrl.includes("your-miniapp-domain.com")) {
    // Use Mini App (best option)
    const miniappUrl = new URL(env.miniappUrl);
    miniappUrl.searchParams.set("userId", userId);
    miniappUrl.searchParams.set("platform", "discord");
    miniappUrl.searchParams.set("backendUrl", env.backendUrl);
    connectUrl = miniappUrl.toString();
    connectLabel = "🔐 Open Mini App to Connect";
    description =
      `To securely connect your Farcaster account:\n\n` +
      `**Step 1:** Click the button below to open the Mini App in Warpcast\n` +
      `**Step 2:** Scan the QR code with your phone (or sign in on desktop)\n` +
      `**Step 3:** Approve the connection in the Mini App\n` +
      `**Step 4:** Return here and you'll be connected!\n\n` +
      `🔒 **Security:** This method verifies you own the Farcaster account.\n\n` +
      `💡 **Better UX:** Mini App provides QR code login and native Farcaster experience!`;
  } else {
    // Fallback to direct SIWF (WARNING: This often fails with "Could not reach Farcaster")
    // The issue is that direct SIWF URLs are unreliable - Mini App is the recommended approach
    const challenge = generateSIWFChallenge(userId, "discord");
    const siwfUrl = generateSIWFUrl(
      challenge.challenge,
      userId,
      "discord",
      env.backendUrl,
      env.farcasterReferralCode,
    );
    await storePendingVerificationInBackend(challenge.challenge, userId, "discord", env.backendUrl);
    connectUrl = siwfUrl;
    connectLabel = "🔐 Connect with Farcaster";
    description =
      `⚠️ **IMPORTANT:** Direct SIWF URLs often fail with "Could not reach Farcaster" error.\n\n` +
      `**To fix this, please:**\n` +
      `1. Deploy the Mini App (see MINIAPP_SETUP.md)\n` +
      `2. Set MINIAPP_URL environment variable\n` +
      `3. This will provide QR code support and reliable authentication\n\n` +
      `**Temporary workaround (may not work):**\n` +
      `**Step 1:** Click the button below to open Warpcast\n` +
      `**Step 2:** Sign in to your Farcaster account\n` +
      `**Step 3:** If you see "Could not reach Farcaster", the URL format is wrong\n` +
      `**Step 4:** You'll need to use the Mini App approach instead\n\n` +
      `🔒 **Security:** This method verifies you own the Farcaster account.\n\n` +
      `💡 **Best Solution:** Deploy Mini App for reliable authentication with QR code support!`;
  }

  const embed = new EmbedBuilder()
    .setTitle("🔗 Connect Farcaster")
    .setDescription(description)
    .setColor(0x8a63d2)
    .setFooter({ text: `Referral code: ${env.farcasterReferralCode} - Secure account linking` });

  const connectButton = new ButtonBuilder()
    .setLabel(connectLabel)
    .setURL(connectUrl)
    .setStyle(ButtonStyle.Link);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(connectButton);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

