import { Router } from "express";
import { z } from "zod";
import { hasBroadcastedClankerToken, markClankerTokenAsBroadcasted } from "../db";
import { logger } from "../utils/logger";

const router = Router();

/**
 * Check if a Clanker token has been broadcasted
 * GET /api/clanker/has-broadcasted?contract=0x...
 */
router.get("/has-broadcasted", async (req, res) => {
  const contractAddress = req.query.contract as string;
  
  if (!contractAddress) {
    return res.status(400).json({ error: "Missing contract address" });
  }
  
  try {
    const broadcasted = await hasBroadcastedClankerToken(contractAddress);
    return res.json({ broadcasted });
  } catch (error) {
    logger.error("Failed to check broadcast status", error);
    return res.status(500).json({ error: "Failed to check broadcast status" });
  }
});

/**
 * Mark a Clanker token as broadcasted
 * POST /api/clanker/mark-broadcasted
 */
router.post("/mark-broadcasted", async (req, res) => {
  const schema = z.object({
    contractAddress: z.string().min(1),
    deployerFid: z.number().int().positive(),
    deployerScore: z.number().int().min(0).max(100),
  });
  
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }
  
  try {
    const record = await markClankerTokenAsBroadcasted(
      result.data.contractAddress,
      result.data.deployerFid,
      result.data.deployerScore
    );
    return res.json({ data: record });
  } catch (error) {
    logger.error("Failed to mark token as broadcasted", error);
    return res.status(500).json({ error: "Failed to mark token as broadcasted" });
  }
});

export const clankerRouter = router;

