import { EmbedBuilder } from "discord.js";
import type { User } from "@neynar/nodejs-sdk/build/api";
import type { BankrLaunch } from "../services/bankr";
import { findUserByWallet, findUserByUsername } from "../services/neynar";
import { buildTradingLinks } from "./tradingButtons";
import { applyBranding } from "./branding";

const BASESCAN = "https://basescan.org";

function xProfileUrl(handle: string): string {
  const u = handle.startsWith("@") ? handle.slice(1) : handle;
  return `https://x.com/${u}`;
}

function farcasterProfileUrl(handle: string): string {
  const u = String(handle).replace(/^@/, "").replace(/\.eth$/i, "");
  return `https://warpcast.com/${u}`;
}

function walletLink(addr: string): string {
  return `${BASESCAN}/address/${addr}`;
}

function imageUrl(img: string | null | undefined): string | null {
  if (!img) return null;
  if (img.startsWith("ipfs://")) {
    return img.replace("ipfs://", "https://ipfs.io/ipfs/");
  }
  return img;
}

function formatAddressLink(addr: string): string {
  const url = walletLink(addr);
  return `[${addr}](${url})`;
}

function buildEntitySection(
  label: string,
  wallet: string | null | undefined,
  xHandle: string | null | undefined,
  fcHandle: string | null | undefined,
  neynarUser?: User | null,
): string {
  const parts: string[] = [];
  if (wallet) {
    parts.push(`**Wallet:** ${formatAddressLink(wallet)}`);
  }
  const xUsername = xHandle || neynarUser?.verified_accounts?.find((a) => a.platform === "x")?.username;
  if (xUsername) {
    const clean = xUsername.replace(/^@/, "");
    parts.push(`**X:** [@${clean}](${xProfileUrl(clean)})`);
  }
  const fcUsername = fcHandle || neynarUser?.username;
  if (fcUsername) {
    parts.push(`**Farcaster:** [${fcUsername}](${farcasterProfileUrl(fcUsername)})`);
  }
  if (parts.length === 0) return "—";
  return parts.join("\n");
}

export async function buildBankrTokenEmbed(
  launch: BankrLaunch,
): Promise<EmbedBuilder> {
  const tokenName = launch.tokenName ?? "Token";
  const tokenSymbol = launch.tokenSymbol ?? "?";
  const tokenAddress = launch.tokenAddress;
  const bankrUrl = `https://bankr.bot/launches/${tokenAddress}`;
  const basescanTokenUrl = `${BASESCAN}/token/${tokenAddress}`;
  const img = imageUrl(launch.imageUri);

  const deployerWallet = launch.deployer?.walletAddress ?? null;
  const deployerX = launch.deployer?.xUsername ?? null;
  const deployerFc =
    launch.deployer?.farcasterUsername ??
    launch.deployer?.farcaster ??
    launch.deployer?.fcUsername ??
    null;

  const feeWallet = launch.feeRecipient?.walletAddress ?? null;
  const feeX = launch.feeRecipient?.xUsername ?? null;
  const feeFc =
    launch.feeRecipient?.farcasterUsername ??
    launch.feeRecipient?.farcaster ??
    launch.feeRecipient?.fcUsername ??
    null;

  // Neynar lookups for deployer and fee recipient (X/Farcaster enrichment)
  const [deployerUser, feeUser] = await Promise.all([
    deployerWallet
      ? findUserByWallet(deployerWallet).catch(() => null)
      : Promise.resolve(null),
    feeWallet && feeWallet !== deployerWallet
      ? findUserByWallet(feeWallet).catch(() => null)
      : Promise.resolve(null),
  ]);

  const embed = new EmbedBuilder()
    .setColor(0x0052ff)
    .setTitle(`Bankr • ${tokenName} ($${tokenSymbol})`)
    .setURL(bankrUrl)
    .setTimestamp(new Date());

  if (img) embed.setThumbnail(img);

  const tokenLines = [
    `**CA:** [\`${tokenAddress.slice(0, 10)}...\`](${basescanTokenUrl})`,
    `**Bankr:** [View Launch](${bankrUrl})`,
  ];
  embed.addFields({
    name: "Token",
    value: tokenLines.join("\n"),
    inline: false,
  });

  const deployerSection = buildEntitySection(
    "Deployer",
    deployerWallet,
    deployerX,
    deployerFc,
    deployerUser,
  );
  embed.addFields({
    name: "Deployer",
    value: deployerSection,
    inline: false,
  });

  if (feeWallet || feeX || feeFc || feeUser) {
    const feeSection = buildEntitySection(
      "Fee Recipient",
      feeWallet,
      feeX,
      feeFc,
      feeUser,
    );
    embed.addFields({
      name: "Fee Recipient",
      value: feeSection,
      inline: false,
    });
  }

  embed.addFields({
    name: "\u200b",
    value: buildTradingLinks(tokenAddress, 8453),
    inline: false,
  });

  if (launch.tweetUrl) {
    embed.addFields({
      name: "Tweet",
      value: launch.tweetUrl,
      inline: false,
    });
  }
  if (launch.websiteUrl) {
    embed.addFields({
      name: "Website",
      value: launch.websiteUrl,
      inline: true,
    });
  }

  applyBranding(embed, "bankr");
  return embed;
}
