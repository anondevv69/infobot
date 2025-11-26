// Test QuickNode RPC integration
const QUICKNODE_API_KEY = "QN_c7a430c65dbc451086e19171e4cf3393";

// Test address (Ethereum token not on DexScreener)
const TEST_ADDRESS = "0x6958c870a6d9a7a7cca58fede8acfdf1280c12d5";

async function testRPC(rpcUrl, chainName) {
  console.log(`\n🔍 Testing ${chainName}...`);
  console.log(`   RPC URL: ${rpcUrl.replace(QUICKNODE_API_KEY, "***")}`);
  
  const startTime = Date.now();
  
  try {
    // Test 1: Check if it's a contract
    const codeResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getCode",
        params: [TEST_ADDRESS, "latest"],
        id: 1,
      }),
    });
    
    const codeTime = Date.now() - startTime;
    
    if (!codeResponse.ok) {
      console.log(`   ❌ Failed: ${codeResponse.status} ${codeResponse.statusText}`);
      return { success: false, time: codeTime };
    }
    
    const codeData = await codeResponse.json();
    const hasCode = codeData.result && codeData.result !== "0x";
    
    if (!hasCode) {
      console.log(`   ⚠️  Not a contract on ${chainName}`);
      return { success: true, time: codeTime, isContract: false };
    }
    
    // Test 2: Call token name() function
    const nameStartTime = Date.now();
    const nameResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: TEST_ADDRESS,
            data: "0x06fdde03", // name()
          },
          "latest",
        ],
        id: 1,
      }),
    });
    
    const nameTime = Date.now() - nameStartTime;
    
    if (nameResponse.ok) {
      const nameData = await nameResponse.json();
      if (nameData.result && nameData.result !== "0x" && nameData.result.length > 130) {
        const length = parseInt(nameData.result.slice(66, 130), 16);
        const nameHex = nameData.result.slice(130, 130 + length * 2);
        const name = Buffer.from(nameHex, "hex").toString("utf-8").replace(/\0/g, "");
        console.log(`   ✅ Contract detected!`);
        console.log(`   📝 Token name: ${name}`);
        console.log(`   ⏱️  Response time: ${codeTime}ms (code) + ${nameTime}ms (name) = ${codeTime + nameTime}ms total`);
        return { success: true, time: codeTime + nameTime, isContract: true, tokenName: name };
      }
    }
    
    console.log(`   ✅ Contract detected (but not a token)`);
    console.log(`   ⏱️  Response time: ${codeTime}ms`);
    return { success: true, time: codeTime, isContract: true };
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.log(`   ❌ Error: ${error.message}`);
    console.log(`   ⏱️  Failed after: ${totalTime}ms`);
    return { success: false, time: totalTime, error: error.message };
  }
}

async function testQuickNode() {
  console.log("🚀 QuickNode RPC Integration Test");
  console.log("=" .repeat(50));
  console.log(`\n📋 Test Address: ${TEST_ADDRESS}`);
  console.log(`🔑 QuickNode API Key: ${QUICKNODE_API_KEY.substring(0, 10)}...`);
  
  const chains = [
    { chainId: 1, name: "Ethereum", quicknodeEndpoint: "ethereum" },
    { chainId: 56, name: "BSC", quicknodeEndpoint: "bsc" },
    { chainId: 137, name: "Polygon", quicknodeEndpoint: "polygon" },
    { chainId: 42161, name: "Arbitrum", quicknodeEndpoint: "arbitrum" },
    { chainId: 10, name: "Optimism", quicknodeEndpoint: "optimism" },
    { chainId: 8453, name: "Base", quicknodeEndpoint: "base" },
    { chainId: 43114, name: "Avalanche", quicknodeEndpoint: "avalanche" },
    { chainId: 250, name: "Fantom", quicknodeEndpoint: "fantom" },
    { chainId: 5000, name: "Mantle", quicknodeEndpoint: "mantle" },
  ];
  
  // Test QuickNode endpoints
  console.log("\n" + "=".repeat(50));
  console.log("🔵 QUICKNODE ENDPOINTS");
  console.log("=".repeat(50));
  
  const quicknodeResults = [];
  for (const chain of chains) {
    const rpcUrl = `https://${chain.quicknodeEndpoint}.quiknode.pro/${QUICKNODE_API_KEY}/`;
    const result = await testRPC(rpcUrl, chain.name);
    quicknodeResults.push({ chain: chain.name, ...result });
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Test public RPCs for comparison
  console.log("\n" + "=".repeat(50));
  console.log("🟡 PUBLIC RPC ENDPOINTS (for comparison)");
  console.log("=".repeat(50));
  
  const publicRPCs = {
    "Ethereum": "https://eth.llamarpc.com",
    "BSC": "https://bsc-dataseed.binance.org",
    "Polygon": "https://polygon-rpc.com",
  };
  
  const publicResults = [];
  for (const [chainName, rpcUrl] of Object.entries(publicRPCs)) {
    const result = await testRPC(rpcUrl, chainName);
    publicResults.push({ chain: chainName, ...result });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 PERFORMANCE SUMMARY");
  console.log("=".repeat(50));
  
  const quicknodeAvg = quicknodeResults
    .filter(r => r.success && r.time)
    .reduce((sum, r) => sum + r.time, 0) / quicknodeResults.filter(r => r.success && r.time).length;
  
  const publicAvg = publicResults
    .filter(r => r.success && r.time)
    .reduce((sum, r) => sum + r.time, 0) / publicResults.filter(r => r.success && r.time).length;
  
  console.log(`\n🔵 QuickNode Average: ${quicknodeAvg ? quicknodeAvg.toFixed(0) : "N/A"}ms`);
  console.log(`🟡 Public RPC Average: ${publicAvg ? publicAvg.toFixed(0) : "N/A"}ms`);
  
  if (quicknodeAvg && publicAvg) {
    const improvement = ((publicAvg - quicknodeAvg) / publicAvg * 100).toFixed(1);
    console.log(`\n🚀 Performance Improvement: ${improvement}% faster with QuickNode`);
  }
  
  // Check if token was found
  const tokenFound = quicknodeResults.find(r => r.tokenName);
  if (tokenFound) {
    console.log(`\n✅ Token Detection: SUCCESS`);
    console.log(`   Token: ${tokenFound.tokenName}`);
    console.log(`   Chain: ${tokenFound.chain}`);
  } else {
    console.log(`\n⚠️  Token Detection: Not found (might not be a token or not on tested chains)`);
  }
  
  // Success rate
  const quicknodeSuccess = quicknodeResults.filter(r => r.success).length;
  const quicknodeTotal = quicknodeResults.length;
  console.log(`\n📈 QuickNode Success Rate: ${quicknodeSuccess}/${quicknodeTotal} chains working`);
  
  if (quicknodeSuccess < quicknodeTotal) {
    console.log(`\n⚠️  Some chains failed. This might mean:`);
    console.log(`   1. QuickNode endpoint format is different`);
    console.log(`   2. API key doesn't have access to all chains`);
    console.log(`   3. Need to create separate endpoints in QuickNode dashboard`);
    console.log(`\n💡 Check your QuickNode dashboard for the correct endpoint URLs`);
  } else {
    console.log(`\n✅ All QuickNode endpoints working!`);
  }
}

testQuickNode().catch(console.error);








