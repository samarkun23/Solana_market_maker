// FILE: src/examples/monitor-example.ts

import { PoolMonitor } from "../services/pool-monitor.js";
import { PositionStorageManager } from "../services/position_storage.js";
import type  { PositionSnapshot } from "../model/position.js";
import { v4 as uuidv4 } from "uuid";

const main = async () => {
  console.log(" Starting Pool Monitor Test...\n");

  const storageManager = new PositionStorageManager("./position-data");
  const poolMonitor = new PoolMonitor(storageManager);

  // ============ STEP 1: CREATE A TEST POSITION ============
  console.log(" STEP 1: Creating test position...");

  const testPosition: PositionSnapshot = {
    // Identity
    positionId: uuidv4(), // Generate unique ID
    poolId: "SOL-USDC",
    owner: "wallet_5KH8bhWYRFZVAJKJHp3K7x9P8m",

    // Tokens
    tokenAmint: "So11111111111111111111111111111111111111112", // SOL
    tokenBmint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    tokenADecimal: 9,
    tokenBDecimal: 6,

    // Entry state
    createdAt: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
    entryPrice: 120, // 1 SOL = 120 USDC at entry
    entryTick: Math.log(120) / Math.log(1.0001), // Convert to tick

    // Amounts deposited
    tokenAAmount: BigInt(10_000_000_000), // 10 SOL
    tokenBAmount: BigInt(1_200_000_000), // 1200 USDC
    entryValueUSD: 2400, // 10 SOL * 120 + 1200 USDC

    // Range
    lowerTick: -1000,
    upperTick: 1000,

    // Liquidity
    liquidity: BigInt(109544511501), // sqrt(10 * 1200) in smallest units

    // Fees baseline
    feeGrowthInsideA: BigInt(50_000_000), // Small amount for testing
    feeGrowthInsideB: BigInt(500_000), // Small amount for testing

    // Execution
    txSignature:
      "5KH8bhWYRFZVAJKJHp3K7x9P8mN6O7P8Q9R0S1T2U3V4W5X6Y7Z8A9B0C1D2E3F", // Fake TX hash
    creationGasCost: 0.005, // 0.005 SOL

    // Strategy
    strategyId: "strategy-mm-v1",
    strategyName: "Market Maker - SOL/USDC",
    status: "ACTIVE",
  };

  // Save position
  const positionId = await storageManager.savePositionSnapshot(testPosition);
  console.log(` Position created with ID: ${positionId}\n`);

  // ============ STEP 2: TEST DIFFERENT SCENARIOS ============
  console.log(" STEP 2: Monitoring position in different scenarios...\n");

  // Scenario A: Price at entry (no change)
  console.log("=" + "=".repeat(79));
  console.log("SCENARIO A: Price at entry (No change)");
  console.log("=" + "=".repeat(79));

  let poolState = {
    currentPrice: 120, // Same as entry
    tokenAReserve: 1000,
    tokenBReserve: 120000,
    feeTier: 30, // 0.30%
  };

  let metrics = await poolMonitor.monitorPosition(positionId, poolState);
  displayMetrics(metrics);

  // Scenario B: Price went UP (IL loss, no IL)
  console.log("\n" + "=".repeat(80));
  console.log("SCENARIO B: Price went UP to 125 (5% increase)");
  console.log("=" + "=".repeat(79));

  poolState = {
    currentPrice: 125, // Went up
    tokenAReserve: 960,
    tokenBReserve: 120000,
    feeTier: 30,
  };

  metrics = await poolMonitor.monitorPosition(positionId, poolState);
  displayMetrics(metrics);

  // Scenario C: Price went DOWN (IL loss other way)
  console.log("\n" + "=".repeat(80));
  console.log("SCENARIO C: Price went DOWN to 115 (4.2% decrease)");
  console.log("=" + "=".repeat(79));

  poolState = {
    currentPrice: 115, // Went down
    tokenAReserve: 1050,
    tokenBReserve: 120750,
    feeTier: 30,
  };

  metrics = await poolMonitor.monitorPosition(positionId, poolState);
  displayMetrics(metrics);

  // Scenario D: Price PUMPED 30% (major IL loss)
  console.log("\n" + "=".repeat(80));
  console.log("SCENARIO D: Price PUMPED to 156 (30% increase - Major IL)");
  console.log("=" + "=".repeat(79));

  poolState = {
    currentPrice: 156, // Pump!
    tokenAReserve: 770,
    tokenBReserve: 120120,
    feeTier: 30,
  };

  metrics = await poolMonitor.monitorPosition(positionId, poolState);
  displayMetrics(metrics);

  // Scenario E: Price OUT OF RANGE (150)
  console.log("\n" + "=".repeat(80));
  console.log("SCENARIO E: Price OUT OF RANGE to 150 (above upperTick)");
  console.log("=" + "=".repeat(79));

  poolState = {
    currentPrice: 150, // Out of range!
    tokenAReserve: 800,
    tokenBReserve: 120000,
    feeTier: 30,
  };

  metrics = await poolMonitor.monitorPosition(positionId, poolState);
  displayMetrics(metrics);

  // ============ STEP 3: VERIFY POSITION IN STORAGE ============
  console.log("\n" + "=".repeat(80));
  console.log("STEP 3: Verify position saved in storage");
  console.log("=" + "=".repeat(79));

  const savedPosition = await storageManager.getActivePosition(positionId);
  if (savedPosition) {
    console.log(` Position found in storage`);
    console.log(`   Entry Price: $${savedPosition.entryPrice}`);
    console.log(`   Range: ${savedPosition.lowerTick} to ${savedPosition.upperTick}`);
    console.log(`   Status: ${savedPosition.status}`);
  } else {
    console.log(` Position not found!`);
  }

  console.log("\n All tests completed!");
};

/**
 * Helper function to display metrics nicely
 */
function displayMetrics(metrics: any) {
  console.log("\n METRICS:");
  console.log(`  Current Price: $${metrics.currentPrice.toFixed(2)}`);
  console.log(`  Entry Price: $${metrics.entryPrice.toFixed(2)}`);
  console.log(`  Price Change: ${metrics.priceChangePercentage.toFixed(2)}%`);

  console.log(`\n LIQUIDITY:`);
  console.log(`  Liquidity: ${metrics.liquidity.toFixed(2)}`);
  console.log(`  Position Value: $${metrics.positionValueUSD.toFixed(2)}`);

  console.log(`\n️ IMPERMANENT LOSS:`);
  console.log(
    `  IL: ${metrics.unrealizedIL.toFixed(2)}% (${metrics.ilStatus})`
  );
  console.log(`  IL $: -$${Math.abs(metrics.unrealizedILDollar).toFixed(2)}`);

  console.log(`\n FEES:`);
  console.log(`  Fees Earned: $${metrics.feesEarned.toFixed(2)}`);
  console.log(`  Fee APY: ${metrics.feesApy.toFixed(1)}%`);
  console.log(`  Status: ${metrics.feesStatus}`);

  console.log(`\n PnL:`);
  console.log(`  Net PnL: $${metrics.netPnL.toFixed(2)}`);
  console.log(`  Net PnL %: ${metrics.netPnLPercentage.toFixed(2)}%`);

  console.log(`\n RANGE:`);
  console.log(`  Out of Range: ${metrics.isOutOfRange ? " YES" : " NO"}`);
  if (metrics.isOutOfRange) {
    console.log(`  Distance: ${metrics.distanceFromRange.toFixed(4)}`);
  }

  console.log(`\n ACTION:`);
  console.log(
    `  Should Rebalance: ${metrics.shouldRebalance ? " YES" : " NO"}`
  );
  if (metrics.rebalanceReason) {
    console.log(`  Reason: ${metrics.rebalanceReason}`);
  }

  console.log(`\n RISK:`);
  console.log(`  Risk Score: ${metrics.riskScore}/100`);
  console.log(`  Recommendation: ${metrics.recommendation}`);
}

// Run the main function
main().catch((error) => {
  console.error(" Error:", error);
  process.exit(1);
});