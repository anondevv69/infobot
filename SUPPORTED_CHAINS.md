# Supported Chains for Creator Lookup & Farcaster/Zora Profiles

## ✅ Currently Supported Chains

The bot now supports **creator wallet lookup**, **creation transaction hash**, and **Farcaster/Zora profile checking** for **ALL EVM tokens** on these chains:

### 1. **Base** (Chain ID: 8453)
- ✅ Explorer API: Basescan V2 API
- ✅ Creator lookup: Full support
- ✅ Creation TX: Full support
- ✅ Farcaster/Zora: Full support

### 2. **Ethereum** (Chain ID: 1)
- ✅ Explorer API: Etherscan API
- ✅ Creator lookup: Full support
- ✅ Creation TX: Full support
- ✅ Farcaster/Zora: Full support

### 3. **BSC (Binance Smart Chain)** (Chain ID: 56)
- ✅ Explorer API: BSCscan API
- ✅ Creator lookup: Full support
- ✅ Creation TX: Full support
- ✅ Farcaster/Zora: Full support

### 4. **Polygon** (Chain ID: 137)
- ✅ Explorer API: Polygonscan API
- ✅ Creator lookup: Full support
- ✅ Creation TX: Full support
- ✅ Farcaster/Zora: Full support

### 5. **Arbitrum** (Chain ID: 42161)
- ✅ Explorer API: Arbiscan API
- ✅ Creator lookup: Full support
- ✅ Creation TX: Full support
- ✅ Farcaster/Zora: Full support

### 6. **Optimism** (Chain ID: 10)
- ✅ Explorer API: Optimistic Etherscan API
- ✅ Creator lookup: Full support
- ✅ Creation TX: Full support
- ✅ Farcaster/Zora: Full support

### 7. **Avalanche** (Chain ID: 43114)
- ✅ Explorer API: Snowtrace API
- ✅ Creator lookup: Full support
- ✅ Creation TX: Full support
- ✅ Farcaster/Zora: Full support

### 8. **Fantom** (Chain ID: 250)
- ✅ Explorer API: FTMScan API
- ✅ Creator lookup: Full support
- ✅ Creation TX: Full support
- ✅ Farcaster/Zora: Full support

### 9. **Mantle** (Chain ID: 5000)
- ✅ Explorer API: Mantle Blockscout API (with RPC fallback)
- ✅ Creator lookup: Full support
- ✅ Creation TX: Full support (via RPC)
- ✅ Farcaster/Zora: Full support

## 📋 What Gets Checked

For **ANY EVM token** on the above chains, the bot will:

1. **Fetch Creator Wallet**
   - Uses explorer API or RPC to find the wallet that deployed the contract
   - Cached for performance (creator never changes)

2. **Fetch Creation Transaction Hash**
   - Gets the transaction hash that created the contract
   - Used to link to the creation transaction on the explorer

3. **Check Farcaster Profile**
   - Looks up the creator wallet on Farcaster
   - Shows `@username` if found, or "None" if not

4. **Check Zora Profile**
   - Looks up the creator wallet on Zora
   - Shows profile handle/name if found, or "None" if not

## ⚡ Performance

- **Creator lookup timeout**: 5 seconds
- **Farcaster/Zora lookup timeout**: 3 seconds (within embed builder)
- **Total response time**: ~5-10 seconds (down from 3 minutes)

## 🔄 How It Works

1. User pastes a token address (e.g., `0x9E82eb4E6Cf4DDAd35C32941B2f90112cDB9b99c`)
2. Bot detects it's a token on one of the supported chains
3. Bot fetches token data from DexScreener
4. Bot fetches creator info (wallet + creation TX) from explorer API
5. Bot checks Farcaster/Zora profiles for the creator wallet
6. Bot displays all info in a formatted embed

## 🚫 Not Currently Supported

These chains are **not yet supported** for creator lookup (but tokens can still be detected via DexScreener):

- Gnosis Chain
- Celo
- Linea
- Scroll
- Other EVM chains not listed above

## 📝 Notes

- **All EVM tokens** on supported chains get the same treatment as Base tokens
- Creator lookup uses explorer APIs when available, falls back to RPC for Mantle
- Farcaster/Zora lookups work for any EVM address (not chain-specific)
- Creator info is cached to avoid repeated API calls
