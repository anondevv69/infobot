import { EmbedBuilder, Message } from "discord.js";
import type {
  Cast,
  EmbedUrlMetadata,
  HtmlMetadataOembed,
  UserVerifiedAddresses,
} from "@neynar/nodejs-sdk/build/api";
import {
  findCastByUrl,
  fetchEmbeddedUrlMetadata,
  NeynarLookupError,
} from "../services/neynar";

const CAST_URL_REGEX =
  /(https?:\/\/(?:www\.)?(?:warpcast\.com|fcast\.me|farcaster\.xyz)\/[^\s]+)/i;
const SUPPORTED_CAST_DOMAINS = new Set([
  "warpcast.com",
  "www.warpcast.com",
  "fcast.me",
  "www.fcast.me",
]);

export async function handleCastLinkMessage(message: Message): Promise<void> {
  if (message.author.bot || !message.content) {
    return;
  }

  const url = extractCastUrl(message.content);
  if (!url) {
    return;
  }

  try {
    const resolvedUrl = await resolveCastUrl(url);
    let cast = await findCastByUrl(resolvedUrl);
    if (!cast && resolvedUrl !== url) {
      cast = await findCastByUrl(url);
    }

    if (!cast) {
      return;
    }

    const embed = buildCastEmbed(cast, normalizeCastUrl(resolvedUrl));
    await message.reply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof NeynarLookupError) {
      console.warn("Neynar lookup error for cast URL:", error.message);
      return;
    }
    console.error("Unexpected error handling cast URL:", error);
  }
}

function extractCastUrl(content: string): string | null {
  const match = content.match(CAST_URL_REGEX);
  if (!match) {
    return null;
  }

  const rawUrl = match[1].trim();
  return rawUrl.replace(/[).,!?\]]*$/, "");
}

async function resolveCastUrl(originalUrl: string): Promise<string> {
  const normalized = normalizeCastUrl(originalUrl);
  if (isSupportedCastDomain(normalized)) {
    return normalized;
  }

  try {
    const metadata = await fetchEmbeddedUrlMetadata(normalized);
    const candidate = extractCanonicalCastUrl(metadata);
    if (candidate && isSupportedCastDomain(candidate)) {
      return normalizeCastUrl(candidate);
    }
  } catch (error) {
    if (error instanceof NeynarLookupError) {
      console.warn("Failed to resolve cast URL via metadata:", error.message);
    } else {
      console.warn("Unexpected error resolving cast URL:", error);
    }
  }

  return normalized;
}

function extractCanonicalCastUrl(
  metadata: EmbedUrlMetadata | null,
): string | null {
  if (!metadata) {
    return null;
  }

  const html = metadata.html;
  const frame = metadata.frame as
    | { post_url?: string; frames_url?: string }
    | undefined;

  const candidates: Array<string | undefined | null> = [
    frame?.post_url,
    frame?.frames_url,
    html?.ogUrl,
    html?.ogWebsite,
    html?.ogVideo?.[0]?.url,
    html?.oembed ? extractUrlFromOembed(html.oembed) : undefined,
  ];

  for (const candidate of candidates) {
    if (candidate && isSupportedCastDomain(candidate)) {
      return candidate;
    }
  }

  if (html?.ogDescription) {
    const match = html.ogDescription.match(
      /(https?:\/\/(?:www\.)?(?:warpcast\.com|fcast\.me)\/\S+)/i,
    );
    if (match) {
      return match[1];
    }
  }

  return null;
}

function extractUrlFromOembed(oembed: HtmlMetadataOembed): string | undefined {
  if (!oembed) {
    return undefined;
  }

  if ("url" in oembed && typeof oembed.url === "string") {
    return oembed.url;
  }

  if ("html" in oembed && typeof oembed.html === "string") {
    const match = oembed.html.match(
      /(https?:\/\/(?:www\.)?(?:warpcast\.com|fcast\.me)\/\S+)/i,
    );
    return match?.[1];
  }

  return undefined;
}

function isSupportedCastDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SUPPORTED_CAST_DOMAINS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export interface CastEmbedOptions {
  title?: string;
  color?: number;
  footer?: string;
  variant?: "full" | "compact";
}

export function buildCastEmbed(
  cast: Cast,
  url: string,
  options?: CastEmbedOptions,
): EmbedBuilder {
  const author = cast.author;
  const verifiedAddresses = author.verified_addresses as
    | UserVerifiedAddresses
    | undefined;
  const variant = options?.variant ?? "full";

  const embed = new EmbedBuilder()
    .setColor(options?.color ?? (variant === "full" ? 0x6f4aff : 0x4f46e5))
    .setAuthor({
      name: `${author.display_name ?? author.username} (@${author.username})`,
      url: `https://warpcast.com/${author.username}`,
      iconURL: author.pfp_url ?? undefined,
    })
    .setDescription(formatCastText(cast.text))
    .setURL(url)
    .setTimestamp(new Date(cast.timestamp));

  if (options?.title) {
    embed.setTitle(options.title);
  }

  if (variant === "full") {
    embed.addFields(
      {
        name: "Author",
        value: `@${author.username} (FID ${author.fid})`,
        inline: true,
      },
      {
        name: "Followers / Following",
        value: `${author.follower_count.toLocaleString()} / ${author.following_count.toLocaleString()}`,
        inline: true,
      },
      {
        name: "Custody Address",
        value: wrapCode(author.custody_address) ?? "N/A",
        inline: false,
      },
    );

    const ethAddresses = verifiedAddresses?.eth_addresses ?? [];
    const solAddresses = verifiedAddresses?.sol_addresses ?? [];
    const walletLines: string[] = [];

    if (ethAddresses.length > 0) {
      walletLines.push(`**ETH:**\n${formatAddressList(ethAddresses)}`);
    }
    if (solAddresses.length > 0) {
      walletLines.push(`**SOL:**\n${formatAddressList(solAddresses)}`);
    }

    const primaryEth = verifiedAddresses?.primary?.eth_address;
    const primarySol = verifiedAddresses?.primary?.sol_address;
    if (primaryEth || primarySol) {
      walletLines.push(
        [
          primaryEth ? `Primary ETH: ${wrapCode(primaryEth)}` : undefined,
          primarySol ? `Primary SOL: ${wrapCode(primarySol)}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    if (walletLines.length > 0) {
      embed.addFields({
        name: "Wallets",
        value: walletLines.join("\n\n"),
        inline: false,
      });
    }
  } else {
    embed.addFields({
      name: "Author",
      value: `@${author.username} • FID ${author.fid}`,
      inline: false,
    });
  }

  embed.addFields({
    name: "Reactions",
    value: `👍 ${cast.reactions.likes_count.toLocaleString()} • 🔁 ${cast.reactions.recasts_count.toLocaleString()}`,
    inline: true,
  });

  if (cast.channel) {
    embed.addFields({
      name: "Channel",
      value: `#${cast.channel.name ?? cast.channel.id}`,
      inline: true,
    });
  }

  if (options?.footer) {
    embed.setFooter({ text: options.footer });
  }

  return embed;
}

function formatCastText(text: string): string {
  const clean = text.trim();
  if (!clean) {
    return "_No text content in this cast._";
  }
  return clean.length > 500 ? `${clean.slice(0, 497)}…` : clean;
}

function formatAddressList(addresses: string[]): string {
  return addresses
    .map((address) => wrapCode(address))
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function normalizeCastUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function wrapCode(address?: string | null): string | undefined {
  if (!address) {
    return undefined;
  }
  return `\`${address}\``;
}

