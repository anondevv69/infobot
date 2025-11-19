# Server-Side Flow (No CORS Issues)

## Current Problem

Mini App (browser) → Backend API = CORS issues

## Solution: Server-Side Proxy

Bot Server → Backend API = No CORS (server-to-server)

## Recommended Flow

### Option 1: Pure Server-Side (Simplest)

1. **User runs `/connect` in Discord/Telegram**
   - Bot server generates Farcaster SIWF URL
   - Bot sends link to user

2. **User clicks link → Opens in browser**
   - Goes to Farcaster/Warpcast
   - User signs in

3. **Farcaster redirects to backend callback**
   - Backend verifies signature
   - Backend stores connection: `discord:userId` → `farcaster:fid`

4. **Bot server polls backend OR user runs `/connect` again**
   - Bot checks backend: `GET /api/siwf/connection?userId=X&platform=discord`
   - If connected → Show success
   - If not → Show "Please complete the connection"

**Advantages:**
- ✅ No CORS issues (bot server talks to backend)
- ✅ No Mini App needed
- ✅ Simpler architecture
- ✅ More secure (no client-side code)

**Disadvantages:**
- ❌ User has to manually return to Discord/Telegram
- ❌ No QR code support (unless Farcaster provides it)

### Option 2: Hybrid (Best UX)

1. **User runs `/connect` in Discord/Telegram**
   - Bot server generates Farcaster SIWF URL
   - Bot sends link to user

2. **User clicks link → Opens Mini App**
   - Mini App shows "Connecting..." 
   - Mini App redirects to Farcaster SIWF URL
   - User signs in

3. **Farcaster redirects to backend callback**
   - Backend verifies and stores connection
   - Backend redirects back to Mini App with success

4. **Mini App shows success**
   - "✅ Connected! Return to Discord/Telegram"
   - User returns to Discord/Telegram

5. **Bot server checks connection**
   - User runs `/connect` again OR bot polls
   - Bot shows connection status

**Advantages:**
- ✅ Better UX (Mini App provides nice UI)
- ✅ QR code support (via Farcaster)
- ✅ Still uses server-side for actual connection
- ✅ Minimal CORS (only for Mini App status checks)

### Option 3: Current Approach (What We Have)

1. **User runs `/connect` in Discord/Telegram**
   - Bot sends Mini App URL

2. **Mini App (browser) connects Discord OAuth**
   - Mini App connects Farcaster
   - Mini App sends to backend → CORS needed

**Advantages:**
- ✅ Best UX (everything in one place)
- ✅ Can connect Discord directly from Mini App

**Disadvantages:**
- ❌ CORS issues (we've been fixing these)
- ❌ More complex

## Recommendation

**Use Option 2 (Hybrid)** - Best of both worlds:
- Server-side connection (no CORS for actual auth)
- Mini App for better UX
- Minimal CORS (only for status/UI)

## Implementation

I can implement Option 2 by:
1. Making bot server handle SIWF URL generation
2. Having Mini App redirect to Farcaster (not make API calls)
3. Backend callback stores connection
4. Mini App just shows status (minimal CORS)

Would you like me to implement this?

