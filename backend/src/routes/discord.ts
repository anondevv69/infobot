import { Router } from "express";
import { logger } from "../utils/logger";

const router = Router();

// Discord OAuth callback endpoint
router.post("/oauth", async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Missing code parameter" });
    }

    // Exchange code for access token
    const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      logger.error("[Discord OAuth] Missing Discord credentials");
      return res.status(500).json({ error: "Discord OAuth not configured" });
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri || process.env.DISCORD_REDIRECT_URI || "",
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      logger.error("[Discord OAuth] Token exchange failed:", error);
      return res.status(400).json({ error: "Failed to exchange code for token" });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info from Discord
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      logger.error("[Discord OAuth] Failed to get user info");
      return res.status(400).json({ error: "Failed to get user info" });
    }

    const discordUser = await userResponse.json();

    logger.info(`[Discord OAuth] User connected: ${discordUser.username}#${discordUser.discriminator} (${discordUser.id})`);

    // Return user info (don't expose access token)
    return res.json({
      success: true,
      user: {
        id: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator,
        avatar: discordUser.avatar,
        email: discordUser.email,
      },
    });
  } catch (error: any) {
    logger.error("[Discord OAuth] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export const discordRouter = router;

