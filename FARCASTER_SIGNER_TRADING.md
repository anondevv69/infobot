# Farcaster Signer & Trading Implementation Guide

## 🎯 Goal
Connect Farcaster wallets to Telegram/Discord bots and enable trading using the connected wallet.

## 🔑 Key Concepts

### 1. SIWF Flow (Sign In With Farcaster)
- User clicks link in bot → Opens Warpcast
- User approves connection in Warpcast
- Warpcast redirects to callback with signature
- Backend verifies signature and stores connection

### 2. Signer for Trading
To perform transactions, you need a **signer**. There are two approaches:

#### Option A: Use Custody Address (Current Implementation)
- Use the user's Farcaster custody address
- User must sign transactions with their wallet (MetaMask, etc.)
- Bot provides transaction data, user signs manually

#### Option B: Delegated Signer (Advanced)
- Farcaster provides a delegated signer
- Bot can sign transactions on behalf of user
- Requires additional Farcaster protocol setup

## 📋 Current Implementation Status

### ✅ What We Have
1. **SIWF URL Generation** - Generates correct `warpcast.com/~/signin` URLs
2. **Challenge Storage** - Stores challenges server-side
3. **Callback Handler** - Receives and verifies Warpcast redirects
4. **Connection Storage** - Stores FID, username, custody address
5. **Signature Verification** - Verifies signatures when provided

### ⚠️ What's Missing for Full Trading
1. **Delegated Signer** - Need to get signer from Farcaster
2. **Transaction Signing** - Need to use signer to sign transactions
3. **Signer Storage** - Need to securely store signer private keys

## 🔧 Implementation Options

### Option 1: Manual Signing (Current - Works Now)
**How it works:**
1. User connects Farcaster account
2. Bot gets custody address
3. Bot generates transaction data
4. User signs transaction with their wallet (MetaMask, WalletConnect, etc.)
5. Transaction is submitted

**Pros:**
- ✅ Works immediately
- ✅ More secure (user controls signing)
- ✅ No need for delegated signer

**Cons:**
- ❌ Requires user to sign each transaction manually
- ❌ Not fully automated

### Option 2: Delegated Signer (Requires Additional Setup)
**How it works:**
1. User connects Farcaster account
2. Farcaster provides delegated signer
3. Bot stores signer private key securely
4. Bot signs transactions automatically

**Pros:**
- ✅ Fully automated trading
- ✅ Better UX (no manual signing)

**Cons:**
- ❌ Requires Farcaster protocol setup
- ❌ Security concerns (storing private keys)
- ❌ More complex implementation

## 🚀 Recommended Approach

For now, use **Option 1 (Manual Signing)** because:
1. It works with current SIWF implementation
2. More secure (user controls their funds)
3. Easier to implement
4. Can upgrade to Option 2 later

## 📝 Current Trading Flow

### Step 1: User Connects
```
User: /connect
Bot: [Shows SIWF link]
User: [Clicks link, approves in Warpcast]
Backend: [Stores connection with custody address]
```

### Step 2: User Trades
```
User: /buy token 0x123... amount 0.1
Bot: [Gets swap quote from 1inch]
Bot: [Generates transaction data]
Bot: [Shows transaction to user]
User: [Signs with MetaMask/WalletConnect]
Transaction: [Executed on-chain]
```

## 🔐 Security Considerations

### Storing Signers
If you implement Option 2 (delegated signer):
- **NEVER** store private keys in plain text
- Use encryption at rest
- Use environment variables for encryption keys
- Consider using a key management service (AWS KMS, etc.)

### Current Implementation (Option 1)
- ✅ No private keys stored
- ✅ User controls signing
- ✅ More secure by default

## 📚 Resources

- **Farcaster Docs**: https://docs.farcaster.xyz/
- **SIWF Docs**: https://docs.farcaster.xyz/developers/siwf/
- **Auth Kit**: https://docs.farcaster.xyz/auth-kit/
- **Snapchain**: https://snapchain.farcaster.xyz/

## 🔄 Next Steps

1. **Test Current Flow**
   - Verify `/connect` works
   - Verify callback stores connection
   - Test `/buy` command with manual signing

2. **If You Want Automated Trading**
   - Research Farcaster delegated signers
   - Implement signer storage (encrypted)
   - Update trading commands to use signer

3. **Improve UX**
   - Add transaction status tracking
   - Add balance checks before trades
   - Add slippage protection

## 💡 ChatGPT's Recommendation

ChatGPT suggested using `@farcaster/auth-kit`, but this appears to be:
- React-specific (for web apps)
- May not exist as an npm package
- The pattern can be implemented manually (which we're doing)

Our current implementation follows the same pattern:
1. Generate challenge ✅
2. Store challenge ✅
3. Generate SIWF URL ✅
4. Handle callback ✅
5. Verify signature ✅
6. Store connection ✅

The main difference is we're using the custody address for signing, which is the recommended approach for bots.

