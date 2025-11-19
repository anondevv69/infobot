/**
 * Get the channel ID from the webhook URL
 * Webhook URL format: https://discord.com/api/webhooks/{webhook_id}/{webhook_token}
 * We need to fetch the webhook info to get the channel_id
 */

let cachedChannelId: string | null = null;

export async function getWebhookChannelId(webhookUrl: string | null): Promise<string | null> {
  if (!webhookUrl) {
    return null;
  }

  // Return cached value if available
  if (cachedChannelId) {
    return cachedChannelId;
  }

  try {
    // Extract webhook ID and token from URL
    const match = webhookUrl.match(/discord\.com\/api\/webhooks\/(\d+)\/([^\/]+)/);
    if (!match) {
      return null;
    }

    const [, webhookId, webhookToken] = match;

    // Fetch webhook info to get channel_id
    const response = await fetch(`https://discord.com/api/webhooks/${webhookId}/${webhookToken}`, {
      method: "GET",
    });

    if (!response.ok) {
      console.warn("[WebhookChannel] Failed to fetch webhook info");
      return null;
    }

    const webhookInfo = (await response.json()) as { channel_id?: string };
    const channelId = webhookInfo.channel_id;

    if (channelId) {
      cachedChannelId = channelId;
      return channelId;
    }

    return null;
  } catch (error) {
    console.error("[WebhookChannel] Error fetching webhook channel ID:", error);
    return null;
  }
}

export function clearCache(): void {
  cachedChannelId = null;
}

