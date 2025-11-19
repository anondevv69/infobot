import { initMiniAppSDK } from '@farcaster/miniapp-sdk';

// Initialize Farcaster Mini App SDK
let sdk: any = null;
let user: any = null;

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('userId');
const platform = urlParams.get('platform') || 'discord';
const backendUrl = urlParams.get('backendUrl') || 'https://infobot-production-f74e.up.railway.app';

async function initSDK() {
  try {
    // Initialize the Mini App SDK
    sdk = await initMiniAppSDK();
    
    // Check if user is already authenticated
    try {
      user = await sdk.actions.signIn();
      if (user) {
        showUserInfo(user);
        showStatus('success', '✅ Connected to Farcaster!');
        document.getElementById('connectBtn')!.style.display = 'none';
        document.getElementById('linkBotBtn')!.style.display = 'block';
      }
    } catch (error) {
      // User not signed in yet
      console.log('User not signed in:', error);
    }
  } catch (error) {
    console.error('Failed to initialize SDK:', error);
    showStatus('error', 'Failed to initialize Farcaster SDK. Make sure you\'re opening this in Warpcast.');
  }
}

// Connect wallet function
(window as any).connectWallet = async function() {
  try {
    showStatus('info', '🔄 Connecting...');
    document.getElementById('connectBtn')!.disabled = true;
    
    // Sign in with Farcaster (this will show QR code on mobile)
    user = await sdk.actions.signIn();
    
    if (user) {
      showUserInfo(user);
      showStatus('success', '✅ Successfully connected to Farcaster!');
      document.getElementById('connectBtn')!.style.display = 'none';
      document.getElementById('linkBotBtn')!.style.display = 'block';
      
      // Automatically link to bot if userId is provided
      if (userId) {
        await linkToBot(user);
      }
    }
  } catch (error: any) {
    console.error('Connection error:', error);
    showStatus('error', `Connection failed: ${error.message || 'Unknown error'}`);
    document.getElementById('connectBtn')!.disabled = false;
  }
};

// Link to Discord/Telegram bot
(window as any).linkBot = async function() {
  if (!user) {
    showStatus('error', 'Please connect your Farcaster account first');
    return;
  }
  
  await linkToBot(user);
};

async function linkToBot(farcasterUser: any) {
  try {
    showStatus('info', '🔄 Linking to bot...');
    
    // Log the request for debugging
    console.log('[Mini App] Making request to:', `${backendUrl}/api/siwf/miniapp-connect`);
    console.log('[Mini App] Request data:', {
      userId,
      platform,
      fid: farcasterUser.fid,
      username: farcasterUser.username,
    });
    
    // Send connection data to backend
    const response = await fetch(`${backendUrl}/api/siwf/miniapp-connect`, {
      method: 'POST',
      mode: 'cors', // Explicitly enable CORS
      credentials: 'include', // Include credentials
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        userId,
        platform,
        fid: farcasterUser.fid,
        username: farcasterUser.username,
        custodyAddress: farcasterUser.custodyAddress,
        verifiedAddresses: farcasterUser.verifiedAddresses || [],
        // Include any signer info if available
        signerPrivateKey: farcasterUser.signerPrivateKey,
        signerPublicKey: farcasterUser.signerPublicKey,
      }),
    });
    
    console.log('[Mini App] Response status:', response.status);
    console.log('[Mini App] Response headers:', Object.fromEntries(response.headers.entries()));

    const result = await response.json();

    if (response.ok) {
      showStatus('success', '✅ Successfully linked to bot! You can now return to Discord/Telegram.');
      
      // Show success message with instructions
      setTimeout(() => {
        showStatus('info', '💡 Return to Discord/Telegram and use /balance or /buy to start trading!');
      }, 2000);
    } else {
      throw new Error(result.error || 'Failed to link to bot');
    }
  } catch (error: any) {
    console.error('[Mini App] Link error:', error);
    console.error('[Mini App] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    // Show more detailed error message
    let errorMessage = 'Failed to link: ';
    if (error.message) {
      errorMessage += error.message;
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage += 'Network error - check CORS configuration on backend';
    } else {
      errorMessage += 'Unknown error - check console for details';
    }
    
    showStatus('error', errorMessage);
  }
}

function showUserInfo(user: any) {
  const userInfoDiv = document.getElementById('userInfo')!;
  userInfoDiv.innerHTML = `
    <div class="user-info">
      <h3>👤 Connected Account</h3>
      <p><strong>Username:</strong> @${user.username || 'N/A'}</p>
      <p><strong>FID:</strong> ${user.fid}</p>
      <p><strong>Custody Address:</strong> ${user.custodyAddress?.slice(0, 10)}...${user.custodyAddress?.slice(-8)}</p>
    </div>
  `;
}

function showStatus(type: 'success' | 'error' | 'info', message: string) {
  const statusDiv = document.getElementById('status')!;
  statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

// Initialize on page load
initSDK();

