# Farcaster Wallet Integration & Chain Support Analysis

## 1. Chains Supporting Deployer Identification & Transaction Links

### ✅ Currently Supported (9 Chains)

Your bot **already supports** deployer identification and creation transaction links for these chains:

1. **Base** (Chain ID: 8453)
   - Explorer: Basescan API
   - ✅ Deployer identification
   - ✅ Creation transaction hash
   - ✅ Transaction link: `https://basescan.org/tx/{txHash}`

2. **Ethereum** (Chain ID: 1)
   - Explorer: Etherscan API
   - ✅ Deployer identification
   - ✅ Creation transaction hash
   - ✅ Transaction link: `https://etherscan.io/tx/{txHash}`

3. **BSC** (Chain ID: 56)
   - Explorer: BSCscan API
   - ✅ Deployer identification
   - ✅ Creation transaction hash
   - ✅ Transaction link: `https://bscscan.com/tx/{txHash}`

4. **Polygon** (Chain ID: 137)
   - Explorer: Polygonscan API
   - ✅ Deployer identification
   - ✅ Creation transaction hash
   - ✅ Transaction link: `https://polygonscan.com/tx/{txHash}`

5. **Arbitrum** (Chain ID: 42161)
   - Explorer: Arbiscan API
   - ✅ Deployer identification
   - ✅ Creation transaction hash
   - ✅ Transaction link: `https://arbiscan.io/tx/{txHash}`

6. **Optimism** (Chain ID: 10)
   - Explorer: Optimistic Etherscan API
   - ✅ Deployer identification
   - ✅ Creation transaction hash
   - ✅ Transaction link: `https://optimistic.etherscan.io/tx/{txHash}`

7. **Avalanche** (Chain ID: 43114)
   - Explorer: Snowtrace API
   - ✅ Deployer identification
   - ✅ Creation transaction hash
   - ✅ Transaction link: `https://snowtrace.io/tx/{txHash}`

8. **Fantom** (Chain ID: 250)
   - Explorer: FTMScan API
   - ✅ Deployer identification
   - ✅ Creation transaction hash
   - ✅ Transaction link: `https://ftmscan.com/tx/{txHash}`

9. **Mantle** (Chain ID: 5000)
   - Explorer: Mantle Blockscout API (with RPC fallback)
   - ✅ Deployer identification
   - ✅ Creation transaction hash (via RPC)
   - ✅ Transaction link: `https://explorer.mantle.xyz/tx/{txHash}`

### 📋 How It Works

For each token on these chains, your bot:
1. **Fetches creator wallet** - The address that deployed the contract
2. **Fetches creation transaction hash** - The TX that created the contract
3. **Generates explorer link** - Direct link to view the transaction
4. **Checks Farcaster profile** - Looks up creator wallet on Farcaster
5. **Checks Zora profile** - Looks up creator wallet on Zora

**Implementation**: See `src/utils/multiChainTokenEmbeds.ts` and `SUPPORTED_CHAINS.md`

---

## 2. Farcaster & Zora Account Detection

### ✅ Already Implemented

Your bot **already checks** for Farcaster and Zora accounts:

**Current Implementation:**
- **Farcaster**: Uses Neynar API to lookup users by wallet address
  - Checks `custody_address` (primary wallet)
  - Checks `verified_address` (verified ETH addresses)
  - Shows `@username` if found, or "None" if not

- **Zora**: Uses Zora API to lookup profiles by wallet address
  - Shows profile handle/name if found
  - Also extracts Farcaster handle from Zora profile if linked

**Code Locations:**
- `src/services/neynar.ts` - Farcaster lookups
- `src/utils/multiChainTokenEmbeds.ts` - Combined Farcaster/Zora checks
- `src/utils/farcasterPresentation.ts` - Farcaster profile display

**Example Output:**
```
📱 Farcaster: [@username](https://farcaster.xyz/username)
🎨 Zora: [@zora_handle](https://zora.co/@zora_handle)
```

---

## 3. Farcaster Wallet Integration for Trading

### ✅ **YES, It's Possible!**

You can integrate **Sign In with Farcaster (SIWF)** to allow users to:
- Connect their Farcaster account to your bot
- Trade using their Farcaster custody wallet
- Execute transactions within Telegram/Discord

### How It Works

#### A. Sign In with Farcaster (SIWF)

**What SIWF Provides:**
1. **Authentication** - Users sign in with their Farcaster identity
2. **Custody Wallet Access** - Access to the user's Farcaster custody address
3. **Verified Addresses** - Access to verified ETH addresses linked to Farcaster account
4. **Social Graph** - Access to user's social connections

**Process:**
1. User clicks "Sign in with Farcaster" button in your bot
2. Bot generates a QR code or deep link
3. User scans QR code in Warpcast app
4. User approves the request
5. Bot receives and verifies signature
6. Bot can now access user's Farcaster identity and wallet

**Documentation**: https://docs.farcaster.xyz/developers/siwf/

#### B. Implementation Options

**Option 1: AuthKit (Recommended)**
- Farcaster's official SDK for SIWF
- Handles QR code generation, signature verification
- Provides React components (can be adapted for bot UIs)
- **Docs**: https://docs.farcaster.xyz/developers/siwf/authkit

**Option 2: Direct SIWF Implementation**
- Implement FIP-11: Sign In With Farcaster standard
- More control, but requires more implementation
- **Spec**: FIP-11 (referenced in SIWF docs)

#### C. Trading Integration Architecture

```
┌─────────────────┐
│  User in Bot    │
│ (Telegram/Discord)
└────────┬────────┘
         │
         │ 1. "Connect Farcaster"
         ▼
┌─────────────────┐
│  SIWF Flow      │
│  - Generate QR   │
│  - User approves│
│  - Verify sig   │
└────────┬────────┘
         │
         │ 2. Get custody wallet
         ▼
┌─────────────────┐
│  Wallet Access  │
│  - custody_address│
│  - verified_addresses│
└────────┬────────┘
         │
         │ 3. Trading Commands
         ▼
┌─────────────────┐
│  Trading Bot    │
│  - /buy <token> │
│  - /sell <token>│
│  - /swap <pair> │
└─────────────────┘
```

### Implementation Steps

#### Step 1: Add SIWF to Your Bot

**For Telegram:**
```typescript
// Generate SIWF challenge
const challenge = generateSIWFChallenge();
const qrCode = generateQRCode(`https://warpcast.com/~/signin?challenge=${challenge}`);

// Send QR code to user
await bot.sendPhoto(chatId, qrCode, {
  caption: "Scan this QR code with Warpcast to connect your Farcaster account"
});

// Poll for verification
const verified = await pollForVerification(challenge);
if (verified) {
  const custodyAddress = verified.custodyAddress;
  // Store user's Farcaster connection
  await storeUserConnection(chatId, custodyAddress, verified.fid);
}
```

**For Discord:**
```typescript
// Similar flow but with Discord buttons/embeds
const embed = new EmbedBuilder()
  .setTitle("Connect Farcaster")
  .setDescription("Click the button below to connect your Farcaster account");

const button = new ButtonBuilder()
  .setLabel("Connect Farcaster")
  .setURL(`https://your-app.com/siwf?discord_user=${userId}`)
  .setStyle(ButtonStyle.Link);

// Handle callback when user returns
```

#### Step 2: Access User's Wallet

Once authenticated, you can access:
- **Custody Address**: Primary wallet for the Farcaster account
- **Verified Addresses**: Additional wallets linked to the account

```typescript
// After SIWF authentication
const user = await findUserByWallet(custodyAddress);
// user.custodyAddress - primary wallet
// user.verifiedAddresses - array of verified wallets
```

#### Step 3: Enable Trading

With wallet access, you can:
- Check balances
- Execute swaps (via DEX aggregators like 1inch, 0x)
- Buy/sell tokens
- Transfer tokens

**Example Trading Command:**
```typescript
// /buy <token_address> <amount>
bot.onText(/\/buy (.+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenAddress = match[1];
  const amount = match[2];
  
  // Get user's connected Farcaster wallet
  const userConnection = await getUserConnection(chatId);
  if (!userConnection) {
    return bot.sendMessage(chatId, "Please connect your Farcaster account first: /connect");
  }
  
  const walletAddress = userConnection.custodyAddress;
  
  // Execute swap via DEX
  const txHash = await executeSwap({
    fromToken: "ETH", // or native token
    toToken: tokenAddress,
    amount: amount,
    wallet: walletAddress,
    // User will need to sign transaction
  });
  
  await bot.sendMessage(chatId, `Transaction submitted: ${txHash}`);
});
```

### Important Considerations

#### 1. **Transaction Signing**
- Users need to sign transactions with their wallet
- Options:
  - **Wallet Connect**: Connect to user's external wallet (MetaMask, etc.)
  - **Custody Wallet**: If user has custody wallet, they can sign via Warpcast
  - **Smart Contract Wallets**: Use account abstraction for gasless transactions

#### 2. **Security**
- Never store private keys
- Always verify SIWF signatures
- Use secure session management
- Implement rate limiting for trading commands

#### 3. **User Experience**
- Make connection flow simple
- Show clear instructions
- Provide transaction status updates
- Handle errors gracefully

#### 4. **Limitations**
- **Custody Wallet**: Users may not have direct control over custody wallet
- **Verified Addresses**: Users need to link their trading wallet as a verified address
- **Transaction Signing**: Users must approve each transaction (can't auto-trade)

### Recommended Approach

**Hybrid Model:**
1. **SIWF for Authentication** - Connect Farcaster account to bot
2. **Wallet Connect for Trading** - Connect user's trading wallet (MetaMask, etc.)
3. **Link Both** - Associate Farcaster identity with trading wallet

This gives you:
- ✅ Social identity (Farcaster)
- ✅ Trading capability (connected wallet)
- ✅ Best of both worlds

### Next Steps

1. **Research AuthKit SDK**
   - Review: https://docs.farcaster.xyz/developers/siwf/authkit
   - Check if it supports bot integrations (may need adaptation)

2. **Prototype SIWF Flow**
   - Create a simple web page for SIWF
   - Generate QR codes for bot users
   - Verify signatures

3. **Integrate Trading**
   - Choose DEX aggregator (1inch, 0x, etc.)
   - Implement swap execution
   - Add transaction signing flow

4. **Test with Small Transactions**
   - Start with testnet
   - Test with small amounts on mainnet
   - Iterate based on feedback

### Resources

- **SIWF Docs**: https://docs.farcaster.xyz/developers/siwf/
- **AuthKit**: https://docs.farcaster.xyz/developers/siwf/authkit
- **FIP-11 Spec**: Referenced in SIWF docs
- **Neynar SDK**: Already using for lookups, can extend for SIWF
- **Wallet Connect**: For transaction signing

---

## Summary

✅ **Chains**: You already support 9 chains with full deployer identification  
✅ **Farcaster/Zora**: Already checking for both accounts  
✅ **Trading Integration**: **YES, possible** via SIWF + Wallet Connect

The main work needed is:
1. Implement SIWF authentication flow
2. Add wallet connection for trading
3. Integrate DEX aggregator for swaps
4. Build trading commands (`/buy`, `/sell`, `/swap`)

This is definitely feasible and would be a powerful feature for your bot!

