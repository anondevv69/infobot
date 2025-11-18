# X Handle Lookup Implementation

## Problem
When searching for `https://x.com/jessepollak`, the bot returns "No Farcaster profile linked to X handle @jessepollak", but the Farcaster profile exists at `https://farcaster.xyz/jesse.base.eth` with the X account `jessepollak` linked.

## Expected Behavior
The Neynar API endpoint `https://api.neynar.com/v2/farcaster/user/by_x_username/?x_username=jessepollak` with header `x-neynar-experimental: true` should return the user `jesse.base.eth` (fid: 99) with verified X account `jessepollak`.

## Current Implementation

### 1. Core Function: `findUserByXHandle` (src/services/neynar.ts)

```typescript
export async function findUserByXHandle(handle: string): Promise<User | null> {
  const normalized = handle.replace(/^@/, "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  
  // Use the Neynar API endpoint directly - it searches X accounts against Farcaster profiles
  const url = new URL(
    "https://api.neynar.com/v2/farcaster/user/by_x_username/",
  );
  url.searchParams.set("x_username", normalized);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "api-key": requireEnv(env.neynarApiKey, "NEYNAR_API_KEY"),
      "x-neynar-experimental": "true", // Always enable experimental for X handle lookups
    };

    const response = await fetch(url, { headers });

    if (response.status === 404) {
      return null;
    }

    if (response.status === 401) {
      console.warn(
        "Failed to lookup user by X handle due to unauthorized response. Check API plan and key.",
      );
      return null;
    }

    if (response.status === 402) {
      // 402 Payment Required - this endpoint requires Enterprise tier or micropayments
      // Log this so we know it's happening, but still return null for fallback
      console.warn(
        `X handle lookup requires Enterprise tier (402) for ${normalized}. Falling back to username lookup.`,
      );
      return null;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "failed to read body");
      console.warn(
        `Failed to lookup user by X handle ${normalized}: ${response.status} ${body}`,
      );
      return null;
    }

    const payload = (await response.json()) as { users?: User[] };
    const users = payload.users ?? [];
    
    if (users.length === 0) {
      return null;
    }

    // Return the first user (the API should return users with matching X accounts)
    const [user] = users;
    
    // Verify the user actually has the X account in verified_accounts (safety check)
    const hasMatchingXAccount = user.verified_accounts?.some(
      (account) =>
        account.platform === "x" &&
        account.username?.replace(/^@/, "").toLowerCase() === normalized,
    );

    if (hasMatchingXAccount) {
      return user;
    }

    // If no matching X account found in verified_accounts, still return the user
    // (the API endpoint should be authoritative, but log a warning)
    console.warn(
      `X handle lookup returned user ${user.username} (fid: ${user.fid}) but verified_accounts doesn't match ${normalized}`,
    );
    return user;
  } catch (error) {
    console.error("Failed to lookup user by X handle", error);
    return null;
  }
}
```

### 2. Discord Handler (src/handlers/xAccount.ts)

```typescript
export async function handleXAccountMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const handles = extractXHandles(message.content);
  for (const handle of handles) {
    if (!handle) {
      continue;
    }

    // Use Neynar API to search X account directly - it searches against Farcaster profiles
    const byXHandle = await findUserByXHandle(handle);
    
    // If the experimental endpoint works, use it directly
    // Only fallback to username lookup if the endpoint fails (402 Payment Required)
    let byUsername: User | null = null;
    if (!byXHandle) {
      // Fallback: try username lookup and check if it has matching X account
      // This is only needed if the experimental endpoint requires Enterprise tier
      try {
        byUsername = await findUserByUsername(handle);
        // Only use if it has matching X account
        if (byUsername && !userHasMatchingXAccount(byUsername, handle)) {
          byUsername = null;
        }
      } catch (error) {
        console.warn(`Failed Neynar username lookup for ${handle}:`, error);
      }
    }

    // Trust the X handle lookup result (it searches X accounts directly)
    // Only use username fallback if X handle lookup failed
    const farcasterUser = byXHandle ?? byUsername;
    if (farcasterUser) {
      // ... show profile
      return true;
    }

    await message.reply({
      content: `No Farcaster profile linked to X handle \`@${handle}\`.`,
    });
    return true;
  }

  return false;
}
```

### 3. Telegram Handler (src/platforms/telegram/handlers/message.ts)

```typescript
// Check if it's an X/Twitter account link
const xLinkRegex = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/gi;
if (xLinkRegex.test(text)) {
  const handles = extractXHandles(text);
  for (const handle of handles) {
    if (!handle) continue;

    // Use Neynar API to search X account directly - it searches against Farcaster profiles
    const byXHandle = await findUserByXHandle(handle);
    
    // If the experimental endpoint works, use it directly
    // Only fallback to username lookup if the endpoint fails (402 Payment Required)
    let byUsername = null;
    if (!byXHandle) {
      // Fallback: try username lookup and check if it has matching X account
      // This is only needed if the experimental endpoint requires Enterprise tier
      try {
        byUsername = await findUserByUsername(handle);
        // Only use if it has matching X account
        if (byUsername && !userHasMatchingXAccount(byUsername, handle)) {
          byUsername = null;
        }
      } catch (error) {
        // User not found, continue
      }
    }

    // Trust the X handle lookup result (it searches X accounts directly)
    // Only use username fallback if X handle lookup failed
    const farcasterUser = byXHandle ?? byUsername;
    if (farcasterUser) {
      // ... show profile
      return;
    }

    // If no Farcaster profile found
    await bot.sendMessage(chatId, `No Farcaster profile linked to X handle @${handle}.`);
    return;
  }
}
```

### 4. URL Parsing (extractXHandles function)

```typescript
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
```

## Expected API Response

When calling:
```
GET https://api.neynar.com/v2/farcaster/user/by_x_username/?x_username=jessepollak
Headers:
  x-api-key: <API_KEY>
  x-neynar-experimental: true
```

Should return:
```json
{
  "users": [{
    "fid": 99,
    "username": "jesse.base.eth",
    "display_name": "Jesse Pollak",
    "verified_accounts": [{
      "platform": "x",
      "username": "jessepollak"
    }]
  }]
}
```

## Potential Issues

1. **API Key Permissions**: The endpoint might require Enterprise tier (402 error)
2. **Response Parsing**: The response structure might be different than expected
3. **Error Handling**: 402 errors are being silently ignored
4. **URL Construction**: The URL might be malformed
5. **Header Format**: Headers might not be sent correctly

## Test Case

**Input**: `https://x.com/jessepollak`

**Expected Flow**:
1. Extract handle: `jessepollak`
2. Call `findUserByXHandle("jessepollak")`
3. API should return user with `username: "jesse.base.eth"` and `verified_accounts: [{platform: "x", username: "jessepollak"}]`
4. Return user and display Farcaster profile

**Actual Result**: Returns "No Farcaster profile linked to X handle @jessepollak"

## Environment Variables

- `NEYNAR_API_KEY`: Required for API calls
- `NEYNAR_EXPERIMENTAL`: Set to `true` (optional, but we hardcode it in the function)

## Files Involved

1. `src/services/neynar.ts` - Core API function
2. `src/handlers/xAccount.ts` - Discord handler
3. `src/platforms/telegram/handlers/message.ts` - Telegram message handler
4. `src/platforms/telegram/handlers/command.ts` - Telegram command handler





