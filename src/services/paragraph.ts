/**
 * Paragraph API integration
 * https://paragraph.com/docs/api-reference/users/get-user-by-wallet-address
 * https://paragraph.com/docs/api-reference/coins/get-coin-by-contract-address
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

export interface ParagraphCoin {
  id: string;
  contractAddress: string;
  symbol: string;
  postId: string;
}

export interface ParagraphCoinHolder {
  walletAddress: string;
  userId?: string | null;
  balance: string; // Balance in wei
  avatarUrl?: string | null;
}

export interface ParagraphCoinHoldersResponse {
  items: ParagraphCoinHolder[];
  pagination: {
    cursor?: string | null;
    hasMore: boolean;
    total: number;
  };
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

/**
 * Get coin by contract address from Paragraph API
 * https://paragraph.com/docs/api-reference/coins/get-coin-by-contract-address
 */
export async function getCoinByContract(contractAddress: string): Promise<ParagraphCoin | null> {
  try {
    const normalizedAddress = contractAddress.toLowerCase();
    const url = `${PARAGRAPH_API_BASE}/v1/coins/contract/${normalizedAddress}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Coin not found
      }
      throw new Error(`Paragraph API error: ${response.status} ${response.statusText}`);
    }

    const coin = await response.json() as ParagraphCoin;
    return coin;
  } catch (error) {
    // Don't throw - just log and return null (graceful degradation)
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    console.warn(`[Paragraph] Failed to fetch coin for contract ${contractAddress}:`, error);
    return null;
  }
}

/**
 * Get coin by ID from Paragraph API
 * https://paragraph.com/docs/api-reference/coins/get-coin-by-id
 */
export async function getCoinById(coinId: string): Promise<ParagraphCoin | null> {
  try {
    const url = `${PARAGRAPH_API_BASE}/v1/coins/${coinId}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Coin not found
      }
      throw new Error(`Paragraph API error: ${response.status} ${response.statusText}`);
    }

    const coin = await response.json() as ParagraphCoin;
    return coin;
  } catch (error) {
    // Don't throw - just log and return null (graceful degradation)
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    console.warn(`[Paragraph] Failed to fetch coin by ID ${coinId}:`, error);
    return null;
  }
}

/**
 * Get coin holders by contract address
 * https://paragraph.com/docs/api-reference/coins/list-coin-holders-by-contract-address
 */
export async function getCoinHoldersByContract(
  contractAddress: string,
  options?: { limit?: number; cursor?: string },
): Promise<ParagraphCoinHoldersResponse | null> {
  try {
    const normalizedAddress = contractAddress.toLowerCase();
    const params = new URLSearchParams();
    if (options?.limit) {
      params.append("limit", options.limit.toString());
    }
    if (options?.cursor) {
      params.append("cursor", options.cursor);
    }
    
    const url = `${PARAGRAPH_API_BASE}/v1/coins/contract/${normalizedAddress}/holders${params.toString() ? `?${params.toString()}` : ""}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Coin not found
      }
      throw new Error(`Paragraph API error: ${response.status} ${response.statusText}`);
    }

    const holders = await response.json() as ParagraphCoinHoldersResponse;
    return holders;
  } catch (error) {
    // Don't throw - just log and return null (graceful degradation)
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    console.warn(`[Paragraph] Failed to fetch coin holders for contract ${contractAddress}:`, error);
    return null;
  }
}

/**
 * Get coin holders by coin ID
 * https://paragraph.com/docs/api-reference/coins/list-coin-holders-by-id
 */
export async function getCoinHoldersById(
  coinId: string,
  options?: { limit?: number; cursor?: string },
): Promise<ParagraphCoinHoldersResponse | null> {
  try {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.append("limit", options.limit.toString());
    }
    if (options?.cursor) {
      params.append("cursor", options.cursor);
    }
    
    const url = `${PARAGRAPH_API_BASE}/v1/coins/${coinId}/holders${params.toString() ? `?${params.toString()}` : ""}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Coin not found
      }
      throw new Error(`Paragraph API error: ${response.status} ${response.statusText}`);
    }

    const holders = await response.json() as ParagraphCoinHoldersResponse;
    return holders;
  } catch (error) {
    // Don't throw - just log and return null (graceful degradation)
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    console.warn(`[Paragraph] Failed to fetch coin holders for coin ID ${coinId}:`, error);
    return null;
  }
}

