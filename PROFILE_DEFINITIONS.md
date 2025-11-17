# Profile Type Definitions

This document clearly defines what each profile type shows when displayed by the bot.

---

## 🔷 **WALLET PROFILE**

**Trigger**: When someone pastes a wallet address (ETH or SOL) that matches a Farcaster account

**What It Shows** (Single Page):
- **Title**: `0x7d2e…4090 • Wallet Profile`
- **Input Wallet**: The wallet address that was searched
- **Farcaster Profile Section**:
  - Username (@malbek.eth)
  - Display name
  - FID
  - Followers / Following count
  - Custody address
  - Verified ETH addresses
  - Verified SOL addresses
- **Most Recent Cast**: Latest cast from the Farcaster user
- **First Clanker** (if deployed): Name, ticker, contract, timestamp
- **Latest Clanker** (if deployed): Name, ticker, contract, timestamp
- **Zora Wallets** (if has Zora): List of Zora-associated wallets
- **Creator Coin** (if has Zora): Creator coin address
- **Latest Zora Coin** (if has Zora): Latest Zora post coin
- **Socials**: Farcaster, X, Zora links (F • X • Z format)

**Key Point**: This is a **Farcaster user** whose wallet was searched. It combines Farcaster + Zora + Clanker data for that user.

**Location**: `src/utils/walletEmbed.ts` - `buildWalletProfileResponse()`

---

## 🟦 **ZORA PROFILE**

**Trigger**: When someone pastes a Zora profile link (`https://zora.co/@username`) or searches a wallet that only matches a Zora account (no Farcaster)

**What It Shows** (Single Page):
- **Title**: `@username • Zora Profile`
- **Profile Section**:
  - Handle (@username)
  - Display name
  - Farcaster handle (if linked)
  - Socials (F • X • Z format)
- **Input Wallet**: The wallet address that was searched (if searched by wallet)
- **Zora Wallets**: All wallets associated with this Zora account
- **Creator Coin**: Creator coin address (if they have one)
- **Latest Coin**: Latest Zora post coin (if they have posts)
- **Wallets**: Associated wallet addresses

**Key Point**: This is a **Zora-only account** (no Farcaster). Shows Zora profile info, wallets, creator coin, and latest posts.

**Location**: 
- `src/utils/walletEmbed.ts` - `buildZoraWalletProfileResponse()` (for wallet searches)
- `src/utils/zoraEmbeds.ts` - `buildZoraProfileEmbed()` (for profile link searches)

---

## 📝 **CAST LINK**

**Trigger**: When someone pastes a Farcaster/Warpcast cast URL (e.g., `https://warpcast.com/username/hash`)

**What It Shows** (Single Page):
- **Author Info**:
  - Author name and username (clickable to Warpcast profile)
  - Author profile picture
- **Cast Content**:
  - Full cast text (truncated if > 500 chars)
  - Timestamp
  - Link to cast
- **Author Details** (Full variant):
  - Username and FID
  - Followers / Following count
  - Custody address
  - Verified ETH addresses
  - Verified SOL addresses
- **Reactions**: Likes and recasts count
- **Channel**: Channel name (if posted in a channel)

**Key Point**: Shows **the cast itself** and **the person who posted it** (the cast author). It does NOT show:
- ❌ The dev/creator of any tokens mentioned in the cast
- ❌ Any Zora or Clanker info unless the cast author has those
- ❌ Any other users mentioned in the cast

**It's just**: The cast + the cast author's profile info

**Location**: `src/handlers/castLink.ts` - `buildCastEmbed()`

---

## 📊 **Summary Table**

| Profile Type | Shows | Does NOT Show |
|-------------|-------|---------------|
| **Wallet Profile** | Farcaster user + their wallets + Clankers + Zora | Other users' data |
| **Zora Profile** | Zora account + wallets + creator coin + latest posts | Farcaster profile (unless linked) |
| **Cast Link** | The cast + cast author's profile | Dev/creator of tokens mentioned in cast |

---

## 🔍 **Examples**

### Wallet Profile Example:
```
Input: 0x7d2e4d645c0acc5a6bf596b612cab351864f4090

Shows:
- Farcaster: @malbek.eth (FID 477861)
- Wallets: custody + verified ETH/SOL
- First Clanker: Oracle (ORCL) - 0x275B9a8f...
- Latest Clanker: Farcaster Ops (FOPS) - 0x455efF69...
- Creator Coin: 0x1b63995bcb434ee64a877547cf23e03faf028d6e
- Latest Zora Coin: Base Logo - 0x0aa8a83b...
- Most Recent Cast: "you will airdrop guys ?"
```

### Zora Profile Example:
```
Input: https://zora.co/@username

Shows:
- Handle: @username
- Display Name: Creator Name
- Farcaster: @username (if linked)
- Creator Coin: 0x1234...
- Latest Coin: Token Name - 0x5678...
- Wallets: 0xabcd..., 0xefgh...
```

### Cast Link Example:
```
Input: https://warpcast.com/username/0xabc123

Shows:
- Cast Text: "Check out this new token!"
- Author: @username (FID 12345)
- Author Wallets: custody + verified addresses
- Reactions: 👍 50 • 🔁 10
- Channel: #general
```

---

## 💡 **Key Distinctions**

1. **Wallet Profile** = Farcaster user found by wallet address
2. **Zora Profile** = Zora account (may or may not have Farcaster)
3. **Cast Link** = Just the cast and its author (not token creators/devs mentioned in the cast)



