import { Router } from "express";
import { z } from "zod";
import {
  createSubscription,
  deleteSubscription,
  listSubscriptionsForGuild,
} from "../db";
import { logger } from "../utils/logger";

const router = Router();

const subscriptionSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  fid: z.coerce.number().int().nonnegative(),
});

router.get("/", async (req, res) => {
  const result = subscriptionSchema.pick({ guildId: true }).safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }
  const subscriptions = await listSubscriptionsForGuild(result.data.guildId);
  return res.json({ data: subscriptions });
});

router.post("/", async (req, res) => {
  const result = subscriptionSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  try {
    const record = await createSubscription(
      result.data.guildId,
      result.data.channelId,
      result.data.fid,
    );
    return res.status(201).json({ data: record });
  } catch (error) {
    logger.error("Failed to create subscription", error);
    return res.status(500).json({ error: "Failed to create subscription" });
  }
});

router.delete("/", async (req, res) => {
  const result = subscriptionSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  try {
    const removed = await deleteSubscription(
      result.data.guildId,
      result.data.channelId,
      result.data.fid,
    );
    return res.status(removed ? 200 : 404).json({ removed });
  } catch (error) {
    logger.error("Failed to delete subscription", error);
    return res.status(500).json({ error: "Failed to delete subscription" });
  }
});

export const subscriptionRouter = router;

