# Supported Chains for Token Creator Lookup

## Overview
This document outlines which chains are supported for:
1. **Token Detection** (via DexScreener)
2. **Creator Wallet & Creation Transaction Lookup** (via Explorer APIs)
3. **Farcaster/Zora Profile Cross-Reference** (works for all EVM chains)

---

## ✅ Fully Supported Chains

These chains support **all three features** (token detection, creator lookup, profile cross-reference):

### 1. **Ethereum** (Chain ID: 1)
- ✅ Token Detection: Yes (via DexScreener)
- ✅ Creator Wallet: Yes (via Etherscan API)
- ✅ Creation Transaction: Yes (via Etherscan API)
- ✅ Farcaster/Zora: Yes (wallet-based lookup)

### 2. **Base** (Chain ID: 8453)
- ✅ Token Detection: Yes (via DexScreener)
- ✅ Creator Wallet: Yes (via Basescan V2 API)
- ✅ Creation Transaction: Yes (via Basescan API)
- ✅ Farcaster/Zora: Yes (wallet-based lookup)

### 3. **BSC (Binance Smart Chain)** (Chain ID: 56)
- ✅ Token Detection: Yes (via DexScreener)
- ✅ Creator Wallet: Yes (via BSCscan API)
- ✅ Creation Transaction: Yes (via BSCscan API)
- ✅ Farcaster/Zora: Yes (wallet-based lookup)

### 4. **Polygon** (Chain ID: 137)
- ✅ Token Detection: Yes (via DexScreener)
- ✅ Creator Wallet: Yes (via Polygonscan API)
- ✅ Creation Transaction: Yes (via Polygonscan API)
- ✅ Farcaster/Zora: Yes (wallet-based lookup)

### 5. **Arbitrum** (Chain ID: 42161)
- ✅ Token Detection: Yes (via DexScreener)
- ✅ Creator Wallet: Yes (via Arbiscan API)
- ✅ Creation Transaction: Yes (via Arbiscan API)
- ✅ Farcaster/Zora: Yes (wallet-based lookup)

### 6. **Optimism** (Chain ID: 10)
- ✅ Token Detection: Yes (via DexScreener)
- ✅ Creator Wallet: Yes (via Optimistic Etherscan API)
- ✅ Creation Transaction: Yes (via Optimistic Etherscan API)
- ✅ Farcaster/Zora: Yes (wallet-based lookup)

### 7. **Avalanche** (Chain ID: 43114)
- ✅ Token Detection: Yes (via DexScreener)
- ✅ Creator Wallet: Yes (via Snowtrace API)
- ✅ Creation Transaction: Yes (via Snowtrace API)
- ✅ Farcaster/Zora: Yes (wallet-based lookup)

### 8. **Fantom** (Chain ID: 250)
- ✅ Token Detection: Yes (via DexScreener)
- ✅ Creator Wallet: Yes (via FTMscan API)
- ✅ Creation Transaction: Yes (via FTMscan API)
- ✅ Farcaster/Zora: Yes (wallet-based lookup)

### 9. **Mantle** (Chain ID: 5000)
- ✅ Token Detection: Yes (via DexScreener)
- ⚠️ Creator Wallet: Partial (via Mantle Explorer API - may need Blockscout fallback)
- ⚠️ Creation Transaction: Partial (via Mantle Explorer API - may need Blockscout fallback)
- ✅ Farcaster/Zora: Yes (wallet-based lookup)

---

## ⚠️ Partially Supported Chains

These chains support token detection but **may not** support creator lookup:

### 10. **Gnosis** (Chain ID: 100)
- ✅ Token Detection: Yes (via DexScreener)
- ❌ Creator Wallet: No (no explorer API configured)
- ❌ Creation Transaction: No (no explorer API configured)
- ✅ Farcaster/Zora: Yes (wallet-based lookup, if creator wallet is known)

---

## 📊 Summary

| Chain | Token Detection | Creator Wallet | Creation TX | Farcaster/Zora |
|-------|----------------|----------------|------------|----------------|
| Ethereum | ✅ | ✅ | ✅ | ✅ |
| Base | ✅ | ✅ | ✅ | ✅ |
| BSC | ✅ | ✅ | ✅ | ✅ |
| Polygon | ✅ | ✅ | ✅ | ✅ |
| Arbitrum | ✅ | ✅ | ✅ | ✅ |
| Optimism | ✅ | ✅ | ✅ | ✅ |
| Avalanche | ✅ | ✅ | ✅ | ✅ |
| Fantom | ✅ | ✅ | ✅ | ✅ |
| Mantle | ✅ | ⚠️ | ⚠️ | ✅ |
| Gnosis | ✅ | ❌ | ❌ | ✅ |

**Total: 10 chains supported for token detection, 9 chains fully supported for creator lookup**

---

## 🔧 How It Works

### Token Detection
- Uses **DexScreener API** which supports all major EVM chains
- Automatically detects the chain based on token address and liquidity

### Creator Wallet & Creation Transaction
- Uses **block explorer APIs** (Etherscan, Basescan, etc.)
- Falls back to RPC calls for chains without explorer APIs (like Mantle)
- Caches results (creator addresses never change)

### Farcaster/Zora Cross-Reference
- Works for **any EVM chain** since it uses wallet addresses
- Uses `findUserByWallet()` for Farcaster lookup
- Uses `findBestZoraSummary()` for Zora lookup
- Only works if we have the creator wallet address first

---

## 🚀 Adding New Chains

To add support for a new chain:

1. **Add to DexScreener** (usually already supported if it's a major chain)
2. **Add explorer API** to `getExplorerApiBase()` in `src/services/contractCreation.ts`
3. **Add chain name** to `getChainName()` in `src/services/dexscreener.ts`
4. **Add explorer URL** to `getChainExplorerUrl()` in `src/utils/multiChainTokenEmbeds.ts`
5. **Add chain color** to `getChainColor()` in `src/utils/multiChainTokenEmbeds.ts`

---

## 📝 Notes

- **Mantle**: Currently uses experimental Blockscout API support. May need adjustment based on actual API availability.
- **Gnosis**: Token detection works, but creator lookup requires adding Gnosis explorer API support.
- **Farcaster/Zora**: Always works once we have the creator wallet address, regardless of chain.

