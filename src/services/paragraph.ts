/**
 * Paragraph API integration
 * https://paragraph.com/docs/api-reference/users/get-user-by-wallet-address
 */

export interface ParagraphUser {
  id: string;
  walletAddress: string;
  avatarUrl?: string | null;
  publicationId: string;
  name?: string | null;
  bio?: string | null;
  farcaster?: {
    username: string;
    displayName: string;
    fid: number;
  } | null;
}

const PARAGRAPH_API_BASE = "https://public.api.paragraph.com/api";

/**
 * Get user by wallet address from Paragraph API
 */
export async function getUserByWallet(walletAddress: string): Promise<ParagraphUser | null> {
  try {
    const normalizedAddress = walletAddress.toLowerCase();
    const url = `${PARAGRAPH_API_BASE}/v1/users/wallet/${normalizedAddress}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // User not found
      }
      throw new Error(`Paragraph API error: ${response.status} ${response.statusText}`);
    }

    const user = await response.json() as ParagraphUser;
    return user;
  } catch (error) {
    // Don't throw - just log and return null (graceful degradation)
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    console.warn(`[Paragraph] Failed to fetch user for wallet ${walletAddress}:`, error);
    return null;
  }
}

/**
 * Get multiple users by wallet addresses (batch lookup)
 * Note: Paragraph API doesn't have a batch endpoint, so we'll do parallel requests
 */
export async function getUsersByWallets(
  walletAddresses: string[],
): Promise<Map<string, ParagraphUser>> {
  const results = new Map<string, ParagraphUser>();
  
  // Run all lookups in parallel with timeout protection
  const promises = walletAddresses.map(async (address) => {
    try {
      const user = await Promise.race([
        getUserByWallet(address),
        new Promise<ParagraphUser | null>((resolve) => 
          setTimeout(() => resolve(null), 3000)
        ),
      ]);
      
      if (user) {
        results.set(address.toLowerCase(), user);
      }
    } catch (error) {
      // Silently fail for individual lookups
      console.warn(`[Paragraph] Failed to fetch user for ${address}:`, error);
    }
  });

  await Promise.all(promises);
  return results;
}

