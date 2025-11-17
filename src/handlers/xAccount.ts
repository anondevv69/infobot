import { Message } from "discord.js";
import type { User } from "@neynar/nodejs-sdk/build/api";
import { findUserByUsername, findUserByXHandle } from "../services/neynar";
import { safeFetchMostRecentCast, safeFetchTokensByFid } from "../utils/farcasterHelpers";
import { buildFarcasterPresentation } from "../utils/farcasterPresentation";

const X_LINK_REGEX =
  /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/gi;

export async function handleXAccountMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const handles = extractXHandles(message.content);
  for (const handle of handles) {
    if (!handle) {
      continue;
    }

    const byXHandle = await findUserByXHandle(handle);
    let byUsername: User | null = null;
    let byEnsName: User | null = null;
    
    if (!byXHandle) {
      // Try username lookup first
      try {
        byUsername = await findUserByUsername(handle);
      } catch (error) {
        console.warn(`Failed Neynar username lookup for ${handle}:`, error);
      }
      
      // If username lookup failed, try ENS name variations (e.g., jessepollak -> jessepollak.eth, jessepollak.base.eth)
      if (!byUsername) {
        const ensVariations = [
          `${handle}.eth`,
          `${handle}.base.eth`,
        ];
        
        for (const ensName of ensVariations) {
          try {
            const user = await findUserByUsername(ensName);
            if (user && userHasMatchingXAccount(user, handle)) {
              byEnsName = user;
              break;
            }
          } catch (error) {
            // Continue to next variation
          }
        }
      }
    }

    // If findUserByXHandle returned a user, trust it (the endpoint specifically looks up by X handle)
    // Otherwise, check if the username lookup found a user with matching X account
    // Or check if ENS name lookup found a user with matching X account
    const farcasterUser = byXHandle ?? byEnsName ?? (byUsername && userHasMatchingXAccount(byUsername, handle) ? byUsername : null);
    if (farcasterUser) {
      const [tokens, latestCast] = await Promise.all([
        safeFetchTokensByFid(farcasterUser.fid),
        safeFetchMostRecentCast(farcasterUser.fid),
      ]);

      const presentation = await buildFarcasterPresentation(farcasterUser, {
        tokens,
        latestCast,
      });

      await message.reply({
        embeds: presentation.embeds,
        components: presentation.components,
      });
      return true;
    }

    await message.reply({
      content: `No Farcaster profile linked to X handle \`@${handle}\`.`,
    });
    return true;
  }

  return false;
}

function extractXHandles(content: string): string[] {
  const handles = new Set<string>();
  const matches = content.matchAll(X_LINK_REGEX);
  for (const match of matches) {
    const url = match[0];
    const handle = parseHandleFromUrl(url);
    if (handle) {
      handles.add(handle.toLowerCase());
    }
  }
  return Array.from(handles);
}

function parseHandleFromUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    let candidate: string | null = null;
    if (segments.length > 0 && segments[0].toLowerCase() !== "i") {
      candidate = segments[0];
    }
    if (!candidate) {
      const screenName = url.searchParams.get("screen_name");
      if (screenName) {
        candidate = screenName;
      }
    }
    if (!candidate) {
      return null;
    }
    const normalized = candidate.replace(/^@/, "").trim();
    if (!normalized || !/^[a-zA-Z0-9_]{1,15}$/.test(normalized)) {
      return null;
    }
    return normalized.toLowerCase();
  } catch {
    return null;
  }
}

function userHasMatchingXAccount(user: User | null, handle: string): boolean {
  if (!user?.verified_accounts) {
    return false;
  }
  const normalized = handle.toLowerCase();
  return user.verified_accounts.some((account) => {
    if (account.platform !== "x" || !account.username) {
      return false;
    }
    return account.username.replace(/^@/, "").toLowerCase() === normalized;
  });
}

