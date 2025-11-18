# Neynar Endpoints Needed for Snapchain Integration

## Current Implementation Assumptions

I've created placeholder endpoints that **may not exist** in Neynar's API:

### ❓ Endpoints We're Assuming (Need Verification)

1. **Create Wallet**
   - `POST /v2/farcaster/wallet/create`
   - Purpose: Create a Snapchain wallet for a FID
   - Request: `{ fid: number, network: "base" | "base-sepolia" }`
   - Response: `{ wallet: { id, address, ... } }`

2. **Get Wallet**
   - `GET /v2/farcaster/wallet/{fid}`
   - Purpose: Retrieve existing wallet for a FID
   - Response: `{ wallet: { id, address, ... } }`

3. **Execute Transaction**
   - `POST /v2/farcaster/wallet/{walletId}/execute`
   - Purpose: Execute a transaction using the wallet
   - Request: `{ transaction: { to, data, value, ... }, network, async }`
   - Response: `{ transaction: { hash, status, ... } }`

## ⚠️ Problem: These Endpoints May Not Exist

Based on Neynar's documentation search, I found:
- ✅ User lookup endpoints
- ✅ On-chain event endpoints
- ✅ NFT minting endpoints (with server wallets)
- ❌ **No clear "wallet creation" or "transaction execution" endpoints**

## Alternative: What Neynar Actually Provides

### Option 1: NFT Minting with Server Wallets
Neynar has endpoints for minting NFTs using "Server Wallets":
- `POST /farcaster/nft/mint` - Mint NFTs to Farcaster users
- Uses `x-wallet-id` header (your server wallet)
- **This is for minting NFTs, not general trading**

### Option 2: Transaction Frames
Neynar supports "Transaction Frames" for user-initiated transactions:
- `POST /v2/farcaster/frame/transaction/pay` - Create payment frames
- Users approve transactions in Warpcast
- **This requires user interaction, not automated trading**

## 💰 API Credit Consumption

**YES - Every API call would consume your credits:**

1. **Wallet Creation**: 1 API call per user (one-time)
2. **Get Wallet**: 1 API call per lookup (cached, but still counts)
3. **Transaction Execution**: 1 API call per trade

**Example Cost:**
- 100 users connect = 100 API calls (wallet creation)
- Each user trades 10 times = 1,000 API calls
- **Total: 1,100 API calls = 1,100 credits consumed**

**Rate Limits:**
- Starter: 300 RPM (5 RPS)
- Growth: 600 RPM (10 RPS)
- Scale: 1,200 RPM (20 RPS)

## 🤔 The Real Question

**Does Neynar actually provide Server Wallets for general trading?**

Based on my research:
- ✅ Neynar has Server Wallets for **NFT minting**
- ❓ Unclear if they have Server Wallets for **general token swaps/trading**

## Alternative Approaches

### Option A: Use Neynar's NFT Minting Pattern
If Neynar only supports Server Wallets for NFT minting, we could:
1. Use their minting infrastructure
2. Adapt it for token swaps (if possible)
3. **Risk**: May not work for DEX swaps

### Option B: Direct RPC + User Signers
Go back to the original approach:
1. Users provide delegated signers (via SIWF)
2. We sign transactions directly using ethers.js
3. **No Neynar API calls for trading** (only for user lookup)
4. **Cost**: Only gas fees, no API credits

### Option C: Hybrid Approach
1. Use SIWF for authentication (Neynar API - minimal credits)
2. Use direct RPC for trading (no Neynar API)
3. **Best of both worlds**: Low API cost + full trading capability

## Recommendation

**Before proceeding, we need to:**

1. ✅ **Verify with Neynar Support**: Do Server Wallets exist for general trading?
2. ✅ **Check Pricing**: How much do Server Wallet operations cost?
3. ✅ **Consider Alternatives**: Is direct RPC + signers better for cost?

## Next Steps

1. Contact Neynar support: `support@neynar.com` or their Discord
2. Ask specifically: "Do you have Server Wallets API for executing general EVM transactions (token swaps, transfers) on Base?"
3. If yes → Get the actual endpoints
4. If no → Use Option C (Hybrid: SIWF + Direct RPC)

## Current Status

- ✅ Code structure ready for Snapchain integration
- ⚠️ Waiting for actual Neynar API endpoints
- ⚠️ Need to verify credit costs
- ⚠️ May need to pivot to direct RPC approach

