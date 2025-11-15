import { Router } from "express";
import { z } from "zod";
import { env } from "../config";
import { listSubscriptionsForFid } from "../db";
import { sendDiscordMessage } from "../services/discord";
import { NeynarWebhookEvent } from "../types/neynar";
import { logger } from "../utils/logger";

const router = Router();

const neynarEventSchema = z.object({
  type: z.literal("cast.created"),
  data: z.object({
    cast: z.object({
      hash: z.string(),
      text: z.string(),
      timestamp: z.string(),
      author: z.object({
        fid: z.number(),
        username: z.string(),
        displayName: z.string().optional(),
        custodyAddress: z.string().optional(),
      }),
    }),
  }),
});

router.post("/neynar", async (req, res) => {
  const secret = req.get("x-webhook-secret");
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const parsed = neynarEventSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn("Received invalid Neynar webhook payload", parsed.error.flatten());
    return res.status(400).json({ error: "Invalid payload" });
  }

  const event: NeynarWebhookEvent = parsed.data;
  const fid = event.data.cast.author.fid;

  const subscriptions = await listSubscriptionsForFid(fid);
  if (subscriptions.length === 0) {
    return res.status(200).json({ status: "no_subscribers" });
  }

  await Promise.all(
    subscriptions.map(async (subscription) => {
      await sendDiscordMessage({
        channelId: subscription.channel_id,
        embeds: [
          {
            title: `New cast from @${event.data.cast.author.username}`,
            url: `https://warpcast.com/${event.data.cast.author.username}/${event.data.cast.hash}`,
            description: event.data.cast.text,
            timestamp: event.data.cast.timestamp,
            color: 0x1d9bf0,
            footer: { text: `FID ${fid}` },
          },
        ],
      });
    }),
  );

  return res.json({ delivered: subscriptions.length });
});

export const webhookRouter = router;

