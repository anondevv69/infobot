# Mini App for Lovable - Complete Guide

## What Your Mini App Should Do (Simple Version)

Your Mini App needs to do **3 things**:

1. **Read URL parameters** (userId, platform, backendUrl)
2. **Authenticate user with Farcaster** (using SDK)
3. **Send data to backend** (one API call)

That's it! The backend already exists - you just need to call it.

## Step-by-Step Implementation

### Step 1: Read URL Parameters

When users click `/connect`, they'll be sent to:
```
https://farcaster.xyz/miniapps/J68v-h9yA2J3/infobot?userId=123&platform=discord&backendUrl=https://infobot-production-f74e.up.railway.app
```

**In Lovable, add this code:**
```javascript
// Get parameters from URL
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('userId');
const platform = urlParams.get('platform') || 'discord';
const backendUrl = urlParams.get('backendUrl') || 'https://infobot-production-f74e.up.railway.app';

console.log('Parameters:', { userId, platform, backendUrl });
```

### Step 2: Authenticate with Farcaster

**If Lovable supports Farcaster SDK:**
```javascript
// Initialize Farcaster SDK
import { initMiniAppSDK } from '@farcaster/miniapp-sdk';

const sdk = await initMiniAppSDK();

// Sign in user
const user = await sdk.actions.signIn();

// user contains: { fid, username, custodyAddress, verifiedAddresses }
```

**If Lovable doesn't support SDK, ask them:**
- "How do I integrate Farcaster authentication?"
- "Can I use @farcaster/miniapp-sdk?"

### Step 3: Send to Backend

After getting the user data, send it to your backend:

```javascript
async function connectToBackend(farcasterUser) {
  const response = await fetch(`${backendUrl}/api/siwf/miniapp-connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: userId,
      platform: platform,
      fid: farcasterUser.fid,
      username: farcasterUser.username,
      custodyAddress: farcasterUser.custodyAddress,
      verifiedAddresses: farcasterUser.verifiedAddresses || [],
    }),
  });

  const result = await response.json();
  
  if (response.ok) {
    // Success!
    document.getElementById('status').innerHTML = 
      '✅ Connected! Return to Discord/Telegram';
  } else {
    // Error
    document.getElementById('status').innerHTML = 
      '❌ Error: ' + (result.error || 'Connection failed');
  }
}
```

## Complete Example Code

Here's what your Mini App page should look like:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Connect Farcaster</title>
</head>
<body>
  <div id="status">Loading...</div>
  <button id="connectBtn" onclick="connect()">Connect with Farcaster</button>

  <script>
    // Step 1: Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const platform = urlParams.get('platform') || 'discord';
    const backendUrl = urlParams.get('backendUrl') || 'https://infobot-production-f74e.up.railway.app';

    let sdk = null;
    let user = null;

    // Step 2: Initialize Farcaster SDK
    async function init() {
      try {
        // Import Farcaster SDK (adjust based on Lovable's setup)
        const { initMiniAppSDK } = await import('@farcaster/miniapp-sdk');
        sdk = await initMiniAppSDK();
        
        // Check if already signed in
        try {
          user = await sdk.actions.signIn();
          if (user) {
            showUserInfo(user);
            connectToBackend(user);
          }
        } catch (error) {
          console.log('Not signed in yet');
        }
      } catch (error) {
        document.getElementById('status').innerHTML = 
          '❌ Failed to initialize: ' + error.message;
      }
    }

    // Step 3: Connect button handler
    async function connect() {
      try {
        document.getElementById('status').innerHTML = '🔄 Connecting...';
        user = await sdk.actions.signIn();
        
        if (user) {
          showUserInfo(user);
          await connectToBackend(user);
        }
      } catch (error) {
        document.getElementById('status').innerHTML = 
          '❌ Connection failed: ' + error.message;
      }
    }

    // Step 4: Send to backend
    async function connectToBackend(farcasterUser) {
      try {
        document.getElementById('status').innerHTML = '🔄 Linking to bot...';
        
        const response = await fetch(`${backendUrl}/api/siwf/miniapp-connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userId,
            platform: platform,
            fid: farcasterUser.fid,
            username: farcasterUser.username,
            custodyAddress: farcasterUser.custodyAddress,
            verifiedAddresses: farcasterUser.verifiedAddresses || [],
          }),
        });

        const result = await response.json();
        
        if (response.ok) {
          document.getElementById('status').innerHTML = 
            '✅ Successfully connected! Return to Discord/Telegram.';
        } else {
          document.getElementById('status').innerHTML = 
            '❌ Error: ' + (result.error || 'Connection failed');
        }
      } catch (error) {
        document.getElementById('status').innerHTML = 
          '❌ Failed to connect: ' + error.message;
      }
    }

    function showUserInfo(user) {
      const info = `
        <div>
          <h3>Connected as:</h3>
          <p>@${user.username} (FID: ${user.fid})</p>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', info);
    }

    // Initialize on page load
    init();
  </script>
</body>
</html>
```

## What Lovable Needs to Support

Ask Lovable support these questions:

1. **"Can I use npm packages?"**
   - Need: `@farcaster/miniapp-sdk`
   - Or: Can they add Farcaster authentication?

2. **"Can I make HTTP requests?"**
   - Need: `fetch()` or `axios` to call backend
   - Or: Can they add API integration?

3. **"Can I read URL parameters?"**
   - Need: `window.location.search` or `URLSearchParams`
   - This is standard JavaScript

4. **"Can I add custom JavaScript?"**
   - Need: Ability to write custom code
   - Or: Do they have Farcaster integration built-in?

## If Lovable Doesn't Support These

**Option 1: Use the existing Mini App code**
- The `miniapp/` folder has working code
- Deploy it to Railway/Vercel/Netlify instead
- Point your Farcaster Mini App to that URL

**Option 2: Ask Lovable to add Farcaster support**
- They might be able to add it as a feature
- Or provide a way to integrate it

**Option 3: Hybrid approach**
- Use Lovable for the UI
- Add a simple backend endpoint that calls your Railway backend
- But you'd still need Farcaster SDK access

## Testing Your Mini App

1. **Test URL parameters:**
   ```
   https://infobot.fun?userId=test123&platform=discord&backendUrl=https://infobot-production-f74e.up.railway.app
   ```
   - Check if your app can read these

2. **Test backend connection:**
   - Use browser console
   - Run: `fetch('https://infobot-production-f74e.up.railway.app/api/siwf/miniapp-connect', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId: 'test', platform: 'discord', fid: 123, username: 'test', custodyAddress: '0x123'}) })`
   - Should return success

3. **Test full flow:**
   - Run `/connect` in Discord
   - Should open Mini App
   - Sign in
   - Should connect

## Summary

**You DON'T need to build a backend** - it already exists at Railway.

**Your Mini App just needs to:**
1. Read URL parameters ✅
2. Authenticate with Farcaster ✅
3. Call the backend endpoint ✅

**Ask Lovable:**
- Can I use Farcaster SDK?
- Can I make HTTP requests?
- Can I read URL parameters?

If yes → Implement the code above
If no → Use the existing `miniapp/` code and deploy elsewhere

