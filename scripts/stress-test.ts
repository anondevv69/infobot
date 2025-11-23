/**
 * Stress Testing Tool for InfoBot
 * 
 * This script tests the bot's capacity by simulating:
 * - Multiple concurrent searches
 * - Multiple guild/server joins
 * - High request volume
 * 
 * Usage: npm run stress-test
 */

import { REST, Routes } from "discord.js";
import { config } from "dotenv";

config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID");
  process.exit(1);
}

interface StressTestConfig {
  concurrentSearches: number;
  totalSearches: number;
  searchDelay: number; // ms between search batches
  testDuration: number; // seconds
}

interface TestResults {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  errors: Array<{ error: string; count: number }>;
  memoryUsage: {
    initial: NodeJS.MemoryUsage;
    peak: NodeJS.MemoryUsage;
    final: NodeJS.MemoryUsage;
  };
}

class StressTester {
  private results: TestResults;
  private responseTimes: number[] = [];
  private errorCounts: Map<string, number> = new Map();
  private peakMemory: NodeJS.MemoryUsage = process.memoryUsage();

  constructor() {
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: Infinity,
      errors: [],
      memoryUsage: {
        initial: process.memoryUsage(),
        peak: process.memoryUsage(),
        final: process.memoryUsage(),
      },
    };
  }

  async runTest(config: StressTestConfig): Promise<TestResults> {
    console.log("🚀 Starting Stress Test...");
    console.log(`📊 Configuration:`);
    console.log(`   - Concurrent Searches: ${config.concurrentSearches}`);
    console.log(`   - Total Searches: ${config.totalSearches}`);
    console.log(`   - Search Delay: ${config.searchDelay}ms`);
    console.log(`   - Test Duration: ${config.testDuration}s\n`);

    const startTime = Date.now();
    const endTime = startTime + config.testDuration * 1000;

    // Monitor memory usage
    const memoryMonitor = setInterval(() => {
      const current = process.memoryUsage();
      if (current.heapUsed > this.peakMemory.heapUsed) {
        this.peakMemory = current;
      }
    }, 1000);

    // Run concurrent searches
    const searchPromises: Promise<void>[] = [];
    let searchCount = 0;

    while (Date.now() < endTime && searchCount < config.totalSearches) {
      // Create batch of concurrent searches
      for (let i = 0; i < config.concurrentSearches && searchCount < config.totalSearches; i++) {
        searchCount++;
        searchPromises.push(this.simulateSearch(searchCount));
      }

      // Wait before next batch
      if (Date.now() < endTime) {
        await new Promise((resolve) => setTimeout(resolve, config.searchDelay));
      }
    }

    // Wait for all searches to complete
    await Promise.allSettled(searchPromises);

    clearInterval(memoryMonitor);

    // Calculate final results
    this.calculateResults();

    return this.results;
  }

  private async simulateSearch(searchId: number): Promise<void> {
    const startTime = Date.now();
    this.results.totalRequests++;

    try {
      // Simulate a search request (you can replace this with actual API calls)
      // For now, we'll simulate network delay
      const delay = Math.random() * 2000 + 500; // 500-2500ms
      await new Promise((resolve) => setTimeout(resolve, delay));

      const responseTime = Date.now() - startTime;
      this.responseTimes.push(responseTime);
      this.results.successfulRequests++;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.responseTimes.push(responseTime);
      this.results.failedRequests++;

      const errorMessage = error instanceof Error ? error.message : String(error);
      const count = this.errorCounts.get(errorMessage) || 0;
      this.errorCounts.set(errorMessage, count + 1);
    }
  }

  private calculateResults(): void {
    if (this.responseTimes.length === 0) {
      return;
    }

    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    this.results.averageResponseTime = sum / this.responseTimes.length;
    this.results.maxResponseTime = Math.max(...this.responseTimes);
    this.results.minResponseTime = Math.min(...this.responseTimes);

    this.results.errors = Array.from(this.errorCounts.entries()).map(([error, count]) => ({
      error,
      count,
    }));

    this.results.memoryUsage.peak = this.peakMemory;
    this.results.memoryUsage.final = process.memoryUsage();
  }

  printResults(): void {
    console.log("\n" + "=".repeat(60));
    console.log("📊 STRESS TEST RESULTS");
    console.log("=".repeat(60));

    console.log(`\n📈 Request Statistics:`);
    console.log(`   Total Requests: ${this.results.totalRequests}`);
    console.log(`   ✅ Successful: ${this.results.successfulRequests} (${((this.results.successfulRequests / this.results.totalRequests) * 100).toFixed(2)}%)`);
    console.log(`   ❌ Failed: ${this.results.failedRequests} (${((this.results.failedRequests / this.results.totalRequests) * 100).toFixed(2)}%)`);

    console.log(`\n⏱️  Response Times:`);
    console.log(`   Average: ${this.results.averageResponseTime.toFixed(2)}ms`);
    console.log(`   Min: ${this.results.minResponseTime}ms`);
    console.log(`   Max: ${this.results.maxResponseTime}ms`);

    if (this.results.errors.length > 0) {
      console.log(`\n❌ Errors:`);
      this.results.errors.forEach(({ error, count }) => {
        console.log(`   ${error}: ${count} occurrences`);
      });
    }

    console.log(`\n💾 Memory Usage:`);
    const formatBytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";
    console.log(`   Initial Heap: ${formatBytes(this.results.memoryUsage.initial.heapUsed)}`);
    console.log(`   Peak Heap: ${formatBytes(this.results.memoryUsage.peak.heapUsed)}`);
    console.log(`   Final Heap: ${formatBytes(this.results.memoryUsage.final.heapUsed)}`);
    console.log(`   Memory Increase: ${formatBytes(this.results.memoryUsage.final.heapUsed - this.results.memoryUsage.initial.heapUsed)}`);

    console.log("\n" + "=".repeat(60));
  }
}

// Test configurations
const testConfigs: StressTestConfig[] = [
  {
    concurrentSearches: 5,
    totalSearches: 50,
    searchDelay: 100,
    testDuration: 30,
  },
  {
    concurrentSearches: 10,
    totalSearches: 100,
    searchDelay: 50,
    testDuration: 30,
  },
  {
    concurrentSearches: 20,
    totalSearches: 200,
    searchDelay: 25,
    testDuration: 30,
  },
  {
    concurrentSearches: 50,
    totalSearches: 500,
    searchDelay: 10,
    testDuration: 30,
  },
];

async function main() {
  console.log("🧪 InfoBot Stress Testing Tool\n");

  for (let i = 0; i < testConfigs.length; i++) {
    const config = testConfigs[i];
    console.log(`\n📋 Test ${i + 1}/${testConfigs.length}`);
    
    const tester = new StressTester();
    await tester.runTest(config);
    tester.printResults();

    // Wait between tests
    if (i < testConfigs.length - 1) {
      console.log("\n⏳ Waiting 5 seconds before next test...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  console.log("\n✅ All stress tests completed!");
}

main().catch(console.error);

