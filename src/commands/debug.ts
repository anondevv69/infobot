import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { generateSIWFUrl, generateSIWFChallenge } from "../services/siwf";
import { env } from "../config";

export async function handleDebugCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Generate a test URL using the same logic as /connect
    const testUserId = interaction.user.id;
    const testChallenge = generateSIWFChallenge(testUserId, "discord");
    const testUrl = generateSIWFUrl(
      testChallenge.challenge,
      testUserId,
      "discord",
      env.backendUrl,
      env.farcasterReferralCode,
    );

    // Check for issues
    const hasOldUrl = testUrl.includes("farcaster.xyz");
    const hasCorrectUrl = testUrl.includes("warpcast.com");
    const isHealthy = hasCorrectUrl && !hasOldUrl;

    // Get backend debug info
    let backendDebug: any = null;
    try {
      const response = await fetch(`${env.backendUrl}/debug/siwf`);
      if (response.ok) {
        backendDebug = await response.json();
      }
    } catch (error) {
      console.error("[Debug] Failed to fetch backend debug:", error);
    }

    const embed = new EmbedBuilder()
      .setTitle(isHealthy ? "✅ SIWF Debug - Healthy" : "⚠️ SIWF Debug - Issues Detected")
      .setColor(isHealthy ? 0x00ff00 : 0xff9900)
      .addFields(
        {
          name: "🔗 Generated URL",
          value: `\`${testUrl}\``,
          inline: false,
        },
        {
          name: "📊 URL Analysis",
          value:
            `Contains warpcast.com: ${hasCorrectUrl ? "✅ Yes" : "❌ No"}\n` +
            `Contains farcaster.xyz: ${hasOldUrl ? "❌ Yes (PROBLEM!)" : "✅ No"}\n` +
            `Status: ${isHealthy ? "✅ CORRECT" : "❌ INCORRECT"}`,
          inline: false,
        },
        {
          name: "⚙️ Configuration",
          value:
            `Backend URL: \`${env.backendUrl}\`\n` +
            `Referral Code: \`${env.farcasterReferralCode}\`\n` +
            `User ID: \`${testUserId}\``,
          inline: false,
        },
      );

    if (backendDebug) {
      embed.addFields({
        name: "🖥️ Backend Status",
        value:
          `Backend Health: ${backendDebug.health?.urlGeneration || "Unknown"}\n` +
          `Commit: \`${backendDebug.debug?.deployment?.commitHash || "unknown"}\`\n` +
          `Service ID: \`${backendDebug.debug?.deployment?.serviceId || "unknown"}\``,
        inline: false,
      });

      if (backendDebug.health?.recommendation) {
        embed.addFields({
          name: "💡 Recommendation",
          value: backendDebug.health.recommendation,
          inline: false,
        });
      }
    }

    if (!isHealthy) {
      embed.addFields({
        name: "🚨 Action Required",
        value:
          `**The bot is generating incorrect URLs!**\n\n` +
          `1. Check Railway → Deployments (ensure latest commit is deployed)\n` +
          `2. Restart the bot service in Railway\n` +
          `3. Check Railway environment variables (remove any FARCASTER_URL vars)\n` +
          `4. Clear build cache and redeploy\n\n` +
          `Visit: \`${env.backendUrl}/debug/siwf\` for more details`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    console.error("[Debug] Error:", error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Debug Error")
          .setDescription(`Failed to run debug: ${error.message}`)
          .setColor(0xff0000),
      ],
    });
  }
}

