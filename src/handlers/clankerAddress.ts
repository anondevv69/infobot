import { Message, ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";
import type { Cast } from "@neynar/nodejs-sdk/build/api";
import { fetchTokensByAddress, type ClankerToken } from "../services/clanker";
import {
  buildTokenEmbed,
  resolveUserFromToken,
  sortClankerTokens,
} from "../utils/clankerEmbeds";
import {
  safeFetchMostRecentCast,
  safeFetchTokensByFid,
  safeFetchEarliestCastByQuery,
} from "../utils/farcasterHelpers";
import {
  extractFirstAddress,
  extractZoraContractReference,
  isEthAddress,
  isSolAddress,
} from "../utils/address";
import { findUserByWallet, findUserByUsername } from "../services/neynar";
import { findBestZoraSummary, fetchZoraCoin, fetchZoraSummary } from "../services/zora";
import { collectZoraIdentifiers } from "../utils/zoraPresentation";
import { buildWalletProfileResponse, buildZoraWalletProfileResponse } from "../utils/walletEmbed";
import { buildFarcasterPresentation } from "../utils/farcasterPresentation";
import {
  isSummaryAssociatedWithAddress,
  isSummaryAssociatedWithUser,
} from "../utils/zoraAssociation";
import { splitClankerTokens } from "../utils/clankerAssociation";
import { buildZoraCoinResponse } from "../handlers/zoraAddress";
import { detectTokenFactory, type BaseFactory } from "../services/baseFactories";
import { buildBaseTokenEmbed } from "../utils/baseTokenEmbeds";
import { fetchBaseTokenData, fetchMultiChainTokenData } from "../services/dexscreener";
import { getContractCreation } from "../services/basescan";
import { getContractCreation as getMultiChainContractCreation, getContractCreationTx } from "../services/contractCreation";
import { env } from "../config";
import { buildMultiChainTokenEmbed } from "../utils/multiChainTokenEmbeds";
import { splitEmbedIntoPages, buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "../handlers/pagination";
import { addProfileSection, appendWalletFields, formatRecentCastSummary, getClankerDisplayEntries, formatClankerTokenDetails } from "../utils/clankerEmbeds";
import { appendZoraSummaryFields } from "../utils/zoraEmbeds";
import { applyBranding } from "../utils/branding";

export async function handleClankerAddressMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const zoraReference = extractZoraContractReference(message.content);
  const address = extractFirstAddress(message.content);
  if (!address) {
    return false;
  }

  const normalizedAddress = address.toLowerCase();

  // FIRST: Check if this is a creator coin or any Zora coin - do this before any other processing
  if (isEthAddress(address) || zoraReference) {
    // Try to fetch the coin directly first
    let coin = await fetchZoraCoin(address, zoraReference?.chainId);
    let summary = await findBestZoraSummary([normalizedAddress]);
    
    // If we got a summary but no coin, try to get the coin from the summary
    if (!coin && summary) {
      // Check if this address matches the creator coin address
      if (summary.profile?.creatorCoinAddress?.toLowerCase() === normalizedAddress) {
        coin = await fetchZoraCoin(summary.profile.creatorCoinAddress);
      }
      // Or check if it's in the createdCoins array
      if (!coin && summary.createdCoins) {
        const matchingCoin = summary.createdCoins.find(c => c.address?.toLowerCase() === normalizedAddress);
        if (matchingCoin) {
          coin = matchingCoin;
        }
      }
      // Or try the latest coin
      if (!coin && summary.latestCoin?.coin?.address?.toLowerCase() === normalizedAddress) {
        coin = summary.latestCoin.coin;
      }
    }
    
    // Check if this address is a creator coin
    const isCreatorCoin = 
      summary?.profile?.creatorCoinAddress?.toLowerCase() === normalizedAddress ||
      (summary?.createdCoins?.some(c => c.address?.toLowerCase() === normalizedAddress) ?? false);
    
    // If we have a coin, show it as a coin card (not a profile)
    if (coin) {
      // Get the full summary if we don't have it yet
      if (!summary) {
        if (coin.creatorProfile?.handle) {
          summary = await fetchZoraSummary(coin.creatorProfile.handle);
        } else if (coin.creatorAddress) {
          summary = await findBestZoraSummary([coin.creatorAddress]);
        }
      }
      
        const response = await buildZoraCoinResponse(coin, summary);
        await message.reply({
          content: response.content,
          embeds: response.embeds,
          components: response.components ?? [],
        });
      return true;
    }
  }

  const tokens = await fetchTokensByAddress(address);
  const directClankerMatches = tokens.filter(
    (token) => token.contract_address?.toLowerCase() === normalizedAddress,
  );

  let user = await findUserByWallet(address).catch((error) => {
    console.warn("Failed Neynar wallet lookup, continuing:", error);
    return null;
  });

  const zoraSummaryFromAddress = await findBestZoraSummary([address]);

  if (!user && zoraSummaryFromAddress?.profile?.farcasterHandle) {
    try {
      const handle = zoraSummaryFromAddress.profile.farcasterHandle.replace(/^@/, "");
      user = await findUserByUsername(handle);
    } catch (error) {
      console.warn("Failed to resolve user from Zora Farcaster handle:", error);
    }
  }

  if (directClankerMatches.length > 0) {
    const sortedTokens = sortClankerTokens(directClankerMatches);
    const primaryToken = sortedTokens[sortedTokens.length - 1];
    const associatedUser = await resolveUserFromToken(primaryToken);

    let deployedTokens: ClankerToken[] = [];
    let latestCast: Cast | null = null;
    if (associatedUser) {
      const [creatorTokens, fetchedCast] = await Promise.all([
        safeFetchTokensByFid(associatedUser.fid),
        safeFetchMostRecentCast(associatedUser.fid),
      ]);
      deployedTokens = splitClankerTokens(creatorTokens, associatedUser).deployed;
      latestCast = fetchedCast;
    }

    const zoraSummary = await findBestZoraSummary(
      associatedUser
        ? collectZoraIdentifiers(associatedUser, address)
        : [address],
    );
    const filteredSummary = associatedUser && zoraSummary
      ? isSummaryAssociatedWithUser(associatedUser, zoraSummary) ? zoraSummary : null
      : zoraSummary;
    const earliestCast = primaryToken.contract_address
      ? await safeFetchEarliestCastByQuery(primaryToken.contract_address)
      : null;

    // Build paginated structure: Page 1 = Token + Dev info, Page 2 = Other Clankers, Page 3 = Wallets + Zora
    const embeds: EmbedBuilder[] = [];
    
    // Page 1: Token info + Dev info (who deployed it, but no wallets)
    const page1Embed = await buildTokenEmbed(primaryToken, {
      farcasterUser: associatedUser ?? undefined, // Include dev info on page 1
      clankerTokens: [], // Don't include other clankers on page 1
      latestCast: latestCast ?? null,
      earliestCast,
      zoraSummary: undefined, // Don't include Zora on page 1
      includeWallets: false, // Don't include wallets on page 1
    });
    embeds.push(page1Embed);
    
    let totalPages = 1;
    const identifier = `clanker_token_${primaryToken.contract_address ?? address}`;

    // Page 2: Other Clankers (if available)
    if (deployedTokens.length > 0) {
      const clankerEntries = getClankerDisplayEntries(deployedTokens);
      const currentAddress = primaryToken.contract_address?.toLowerCase();
      const filteredEntries = clankerEntries.filter((entry) => {
        const entryAddress = entry.token.contract_address?.toLowerCase();
        // Exclude the current token from "First Clanker" or "Most Recent Clanker"
        return !(entryAddress && entryAddress === currentAddress);
      });

      if (filteredEntries.length > 0) {
        const page2Embed = new EmbedBuilder()
          .setColor(0x4338ca)
          .setTitle(`Clanker • ${primaryToken.name ?? primaryToken.symbol ?? "Token"} • Other Clankers`);
        
        filteredEntries.forEach(({ label, token: entryToken }) => {
          page2Embed.addFields({
            name: label,
            value: formatClankerTokenDetails(entryToken),
            inline: false,
          });
        });
        
        applyBranding(page2Embed, "clanker");
        embeds.push(page2Embed);
        totalPages = 2;
      }
    }

    // Page 3: Wallets + Zora info (if available)
    // Check if we have wallet data to display
    const hasWallets = associatedUser && (
      associatedUser.custody_address ||
      (associatedUser.verified_addresses?.eth_addresses?.length ?? 0) > 0 ||
      (associatedUser.verified_addresses?.sol_addresses?.length ?? 0) > 0
    );
    const hasZora = filteredSummary !== null && filteredSummary !== undefined;
    const hasPage3 = hasWallets || hasZora;

    if (hasPage3) {
      const page3Embed = new EmbedBuilder()
        .setColor(0x4338ca);
      
      // Add wallet fields first to determine what we actually have
      let actuallyHasWallets = false;
      if (associatedUser) {
        const hasWalletData = associatedUser.custody_address ||
          (associatedUser.verified_addresses?.eth_addresses?.length ?? 0) > 0 ||
          (associatedUser.verified_addresses?.sol_addresses?.length ?? 0) > 0;
        
        if (hasWalletData) {
          appendWalletFields(page3Embed, associatedUser);
          actuallyHasWallets = true;
        }
      }

      // Add Zora info if available
      if (hasZora && filteredSummary) {
        await appendZoraSummaryFields(page3Embed, filteredSummary, { latestCast: null });
      }

      // Build title to clearly indicate what's actually on this page
      let page3Title = `Clanker • ${primaryToken.name ?? primaryToken.symbol ?? "Token"}`;
      if (actuallyHasWallets && hasZora) {
        page3Title += " • Wallets & Zora";
      } else if (actuallyHasWallets) {
        page3Title += " • Wallets";
      } else if (hasZora) {
        page3Title += " • Zora";
      }
      page3Embed.setTitle(page3Title);
      
      applyBranding(page3Embed, "clanker");
      embeds.push(page3Embed);
      totalPages = 3;
    }

    // Store embeds for pagination
    if (totalPages > 1) {
      storeEmbedForPagination(identifier, embeds[0]);
      if (embeds.length > 1) {
        storeEmbedForPagination(`${identifier}_page2`, embeds[1]);
      }
      if (embeds.length > 2) {
        storeEmbedForPagination(`${identifier}_page3`, embeds[2]);
      }
    }

    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (totalPages > 1) {
      // Create page labels for descriptive buttons
      const pageLabels = [
        { label: "Token & Dev" }, // Page 1
        { label: totalPages > 2 ? "Other Clankers" : "Other Clankers" }, // Page 2
      ];
      if (hasPage3) {
        pageLabels.push({ label: hasWallets && hasZora ? "Wallets & Zora" : hasWallets ? "Wallets" : "Zora" }); // Page 3
      }
      components.push(...buildPaginationButtons(0, totalPages, identifier, pageLabels));
    }

    await message.reply({
      content: `Clanker deployment detected for \`${address}\`.`,
      embeds: [embeds[0]],
      components,
    });
    return true;
  }

  if (directClankerMatches.length === 0) {
    // Check for Base network tokens (Rainbow, ApeStore, Fey, etc.)
    // ONLY if it's NOT a Zora coin and NOT a Clanker token
    // We already checked for Zora coins above, and Clanker tokens are filtered out here
    if (isEthAddress(address)) {
      // First check if it's a Base token (using DexScreener - no rate limits)
      const [baseTokenData, factory] = await Promise.all([
        fetchBaseTokenData(address),
        detectTokenFactory(address),
      ]);

      if (baseTokenData) {
        // Fetch creator address and detect factory for Base tokens
        const [contractCreation, creationTx] = await Promise.all([
          getContractCreation(address).catch((error) => {
            console.error(`[Base Token] Failed to get contract creation for ${address}:`, error);
            return null;
          }),
          getContractCreationTx(address, "base", env.basescanApiKey).catch((error) => {
            console.error(`[Base Token] Failed to get creation transaction for ${address}:`, error);
            return null;
          }),
        ]);
        
        // Debug logging
        if (!contractCreation) {
          console.warn(`[Base Token] No contract creation data found for ${address} - all methods failed`);
        } else {
          console.log(`[Base Token] ✅ Found creator for ${address}: ${contractCreation.contractCreator}, txHash: ${contractCreation.txHash}, createdAt: ${contractCreation.createdAt}`);
        }
        
        if (!creationTx) {
          console.warn(`[Base Token] No creation transaction found for ${address}`);
        } else {
          console.log(`[Base Token] Found creation tx for ${address}: to=${creationTx.to}, from=${creationTx.from}`);
        }

        // Detect TOKEN factory: Get the transaction details to find the token factory address
        // The TOKEN factory is the "to" field in the creation transaction (NOT the pool/DEX factory)
        let detectedFactoryName: string | null = null;
        let detectedFactoryAddress: string | null = null;
        let detectedFactory: BaseFactory | null = null;
        
        if (contractCreation?.txHash) {
          try {
            // Method 1: Use Base RPC directly to get transaction details (more reliable than deprecated Basescan API)
            const BASE_RPC_URL = "https://mainnet.base.org";
            const rpcResponse = await fetch(BASE_RPC_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_getTransactionByHash",
                params: [contractCreation.txHash],
                id: 1,
              }),
            });
            
            if (rpcResponse.ok) {
              const rpcData = (await rpcResponse.json()) as { result?: { from?: string; to?: string | null } };
              if (rpcData.result?.to) {
                // The "to" field is the TOKEN factory address (Fey, ApeStore, KLIK, etc.)
                detectedFactoryAddress = rpcData.result.to.toLowerCase();
                console.log(`[Base Token] Found token factory address from transaction 'to' field: ${detectedFactoryAddress}`);
                
                // Check if it's a known token factory
                const { getTokenFactoryName, createTokenFactory } = await import("../services/baseFactories");
                const tokenFactoryName = getTokenFactoryName(detectedFactoryAddress);
                if (tokenFactoryName) {
                  detectedFactory = createTokenFactory(detectedFactoryAddress);
                  detectedFactoryName = tokenFactoryName;
                  console.log(`[Base Token] Matched token factory: ${tokenFactoryName}`);
                } else {
                  // If not a known token factory, check transaction receipt logs for factory events
                  console.log(`[Base Token] 'to' field (${detectedFactoryAddress}) is not a known token factory, checking logs...`);
                  
                  // Get transaction receipt to check logs
                  const receiptResponse = await fetch(BASE_RPC_URL, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      jsonrpc: "2.0",
                      method: "eth_getTransactionReceipt",
                      params: [contractCreation.txHash],
                      id: 1,
                    }),
                  });
                  
                  if (receiptResponse.ok) {
                    const receiptData = (await receiptResponse.json()) as { result?: { logs?: Array<{ address?: string; topics?: string[] }> } };
                    if (receiptData.result?.logs) {
                      // Look for factory address in logs (factory contracts emit events)
                      for (const log of receiptData.result.logs) {
                        if (log.address && log.address.toLowerCase() !== address.toLowerCase()) {
                          const logFactoryAddress = log.address.toLowerCase();
                          const logFactoryName = getTokenFactoryName(logFactoryAddress);
                          if (logFactoryName) {
                            detectedFactoryAddress = logFactoryAddress;
                            detectedFactory = createTokenFactory(logFactoryAddress);
                            detectedFactoryName = logFactoryName;
                            console.log(`[Base Token] Found token factory from logs: ${logFactoryName} (${logFactoryAddress})`);
                            break;
                          }
                        }
                      }
                    }
                  }
                  
                  // If still not found, check if it matches known patterns
                  if (!detectedFactoryName) {
                    // Check for ApeStore pattern: starts with 0xb3bea12a and ends with 0261dabf
                    // Full address would be 0xb3bea12a + 24 chars + 0261dabf = 42 chars total
                    if (detectedFactoryAddress.startsWith("0xb3bea12a") && detectedFactoryAddress.length === 42 && detectedFactoryAddress.slice(-8) === "0261dabf") {
                      detectedFactoryName = "ApeStore";
                      const { createTokenFactory } = await import("../services/baseFactories");
                      detectedFactory = createTokenFactory(detectedFactoryAddress);
                      console.log(`[Base Token] Matched ApeStore factory by pattern: ${detectedFactoryAddress}`);
                    } else {
                      detectedFactoryName = `${detectedFactoryAddress.slice(0, 10)}...${detectedFactoryAddress.slice(-8)}`;
                      console.log(`[Base Token] ⚠️ UNKNOWN TOKEN FACTORY - Please add to TOKEN_FACTORY_MAP: "${detectedFactoryAddress}": "FactoryName",`);
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error(`[Base Token] Failed to get transaction details for factory detection:`, error);
            // Fallback: Try Basescan API (might be deprecated but worth trying)
            try {
              const apiKeyParam = env.basescanApiKey ? `&apikey=${env.basescanApiKey}` : "";
              const txUrl = `https://api.basescan.org/api?module=proxy&action=eth_getTransactionByHash&txhash=${contractCreation.txHash}&tag=latest${apiKeyParam}`;
              const txResponse = await fetch(txUrl, { headers: { Accept: "application/json" } });
              if (txResponse.ok) {
                const txData = (await txResponse.json()) as { result?: { from?: string; to?: string | null } };
                if (txData.result?.to) {
                  detectedFactoryAddress = txData.result.to.toLowerCase();
                  console.log(`[Base Token] Found token factory address from Basescan API: ${detectedFactoryAddress}`);
                  
                  // Check if it's a known token factory
                  const { getTokenFactoryName, createTokenFactory } = await import("../services/baseFactories");
                  const tokenFactoryName = getTokenFactoryName(detectedFactoryAddress);
                  if (tokenFactoryName) {
                    detectedFactory = createTokenFactory(detectedFactoryAddress);
                    detectedFactoryName = tokenFactoryName;
                  } else {
                    detectedFactoryName = `Factory: ${detectedFactoryAddress.slice(0, 10)}...${detectedFactoryAddress.slice(-8)}`;
                  }
                }
              }
            } catch (fallbackError) {
              console.error(`[Base Token] Basescan API fallback also failed:`, fallbackError);
            }
          }
        }
        
        // Method 2: If we don't have factory from transaction, try logs (last resort)
        if (!detectedFactoryAddress) {
          try {
            const { detectFactoryFromLogs } = await import("../services/basescan");
            const logFactoryAddress = await detectFactoryFromLogs(address);
            if (logFactoryAddress) {
              detectedFactoryAddress = logFactoryAddress.toLowerCase();
              const { getTokenFactoryName, createTokenFactory } = await import("../services/baseFactories");
              const tokenFactoryName = getTokenFactoryName(detectedFactoryAddress);
              if (tokenFactoryName) {
                detectedFactory = createTokenFactory(detectedFactoryAddress);
                detectedFactoryName = tokenFactoryName;
              } else {
                detectedFactoryName = `Factory: ${detectedFactoryAddress.slice(0, 10)}...${detectedFactoryAddress.slice(-8)}`;
              }
            }
          } catch (error) {
            console.error(`[Base Token] Failed to detect factory from logs:`, error);
          }
        }

        // Add creator, factory, and creation date to token data
        baseTokenData.creatorAddress = contractCreation?.contractCreator ?? null;
        // Use detected token factory name (not DEX factory)
        baseTokenData.factoryName = detectedFactoryName ?? null;
        baseTokenData.createdAt = contractCreation?.createdAt ?? null;
        
        // Log what we're passing to the embed
        console.log(`[Base Token] Embed params for ${address}:`, {
          creatorAddress: baseTokenData.creatorAddress,
          createdAt: baseTokenData.createdAt,
          factoryName: baseTokenData.factoryName,
          factoryAddress: detectedFactoryAddress,
          factoryObject: detectedFactory,
        });

        // Use detected token factory (not DEX factory)
        const finalFactory = detectedFactory;

        const { embed, components } = await buildBaseTokenEmbed(
          address,
          baseTokenData?.tokenName ?? null, // Token name from DexScreener
          baseTokenData?.tokenSymbol ?? null, // Token symbol from DexScreener
          baseTokenData,
          finalFactory, // Pass factory object so checkmark can be shown
          contractCreation?.contractCreator ?? null,
          contractCreation?.createdAt ?? null, // Creation timestamp
          contractCreation?.txHash ?? null, // Creation transaction hash
        );

        const factoryDisplayName = finalFactory ? ` (${finalFactory.name})` : "";
        await message.reply({
          content: `Base token detected${factoryDisplayName} for \`${address}\`.`,
          embeds: [embed],
          components,
        });
        return true;
      }

      // Check for tokens on OTHER EVM chains (BSC, Ethereum, Polygon, etc.)
      // BEFORE treating it as a wallet to avoid showing wrong information
      const multiChainTokenData = await fetchMultiChainTokenData(address);
      if (multiChainTokenData) {
        // Only show if it's NOT on Base (we already checked Base above)
        if (multiChainTokenData.chainId.toLowerCase() !== "base" && multiChainTokenData.chainId !== "8453") {
          // Fetch creator address and detect factory for this chain
          const { getContractCreation, getContractCreationTx } = await import("../services/contractCreation");
          const [contractCreation, creationTx] = await Promise.all([
            getContractCreation(address, multiChainTokenData.chainId, env.basescanApiKey).catch(() => null),
            getContractCreationTx(address, multiChainTokenData.chainId, env.basescanApiKey).catch(() => null),
          ]);

          // Detect factory: if creationTx.to exists, that's the factory address
          let factoryName: string | null = null;
          if (creationTx?.to) {
            // Check if it's a known factory (we can expand this later)
            // For now, we'll just show the factory address
            factoryName = `Factory: ${creationTx.to.slice(0, 10)}...${creationTx.to.slice(-8)}`;
          }

          multiChainTokenData.creatorAddress = contractCreation?.contractCreator ?? null;
          multiChainTokenData.factoryName = factoryName;
          multiChainTokenData.createdAt = contractCreation?.createdAt ?? null;

          const { embed, components } = buildMultiChainTokenEmbed(address, multiChainTokenData);
          await message.reply({
            content: `${multiChainTokenData.chainName} token detected for \`${address}\`.`,
            embeds: [embed],
            components,
          });
          return true;
        }
      }
    }
  }

  if (user) {
    const identifiers = collectZoraIdentifiers(user, address);
    const [fidTokens, latestCast, zoraSummary] = await Promise.all([
      safeFetchTokensByFid(user.fid),
      safeFetchMostRecentCast(user.fid),
      findBestZoraSummary(identifiers),
    ]);

    const associatedSummary =
      zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

    const walletResponse = await buildWalletProfileResponse({
      wallet: address,
      user,
      zoraSummary: associatedSummary,
      clankerTokens: fidTokens,
      latestCast,
    });

    await message.reply({
      embeds: walletResponse.embeds,
      components: walletResponse.components,
    });
    return true;
  }

  if (zoraSummaryFromAddress) {

    const hasZoraCoinData =
      Boolean(zoraSummaryFromAddress.latestCoin?.coin) ||
      (zoraSummaryFromAddress.createdCoins ?? []).length > 0;

    if (zoraReference && !hasZoraCoinData && directClankerMatches.length === 0) {
      // Let the zoraAddress handler take over so the coin lookup can reply.
      return false;
    }

    const associated = isSummaryAssociatedWithAddress(zoraSummaryFromAddress, address)
      ? zoraSummaryFromAddress
      : null;

    const zoraResponse = buildZoraWalletProfileResponse({
      wallet: address,
      summary: associated ?? zoraSummaryFromAddress,
    });

    let farcasterEmbeds: Awaited<ReturnType<typeof buildFarcasterPresentation>> | null = null;
    const farcasterHandle = zoraSummaryFromAddress.profile.farcasterHandle;
    if (farcasterHandle) {
      try {
        const user = await findUserByUsername(farcasterHandle.replace(/^@/, ""));
        if (user) {
          farcasterEmbeds = await buildFarcasterPresentation(user, {
            zoraSummary: associated,
          });
        }
      } catch (error) {
        console.warn("Failed to fetch Farcaster profile for Zora summary:", error);
      }
    }

    await message.reply({
      embeds: farcasterEmbeds
        ? [...farcasterEmbeds.embeds, ...zoraResponse.embeds]
        : zoraResponse.embeds,
      components: farcasterEmbeds?.components ?? [],
    });
    return true;
  }

  if (isEthAddress(address) || isSolAddress(address)) {
    if (zoraReference) {
      return false;
    }
    await message.reply({
      content: `We're continuing to add more wallet tracking systems and cannot connect \`${address}\` to any wallet or contract at this time.`,
    });
    return true;
  }

  return false;
}
