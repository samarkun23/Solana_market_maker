import { tryParsePublicKey } from "@raydium-io/raydium-sdk-v2";
import type { PositionStorageManager } from "./position_storage.js";
import type { PublicKey } from "@solana/web3.js";
import type { PositionSnapshot } from "../model/position.js";
import { PoolStatus } from "@meteora-ag/cp-amm-sdk";

interface Position {
    owner: PublicKey;
    lowerTick: number;
    uppperTick: number;
    amountA: number;
    amountB: number;
    feesAccumulatedA: number;
    feesAccumulatedB: number;
    createdAt: number
};

interface PoolState {
    currentPrice: number;
    tokenAReserve: number;
    tokenBReserve: number;
    feeTier: number;
}

interface PositionMetrics {
    positionId: string;
    currentPrice: number;
    entryPrice: number;
    priceChange: number;
    priceChangePercentage: number // for show 

    liquidity: number;
    positionValueUSD: number;

    unrealizedIL: number; // in percentage
    unrealizedILDollar: number;
    ilStatus: "GOOD" | "WARNING" | "CRITICAL",

    feesEarned: number;
    feesApy: number;
    feeStatus: "ACCUMULATING" | "OUT_OF_RANGE";

    netPnL: number;
    netPnLPercentage: number;

    isOutOfRange: boolean;
    distanceFromRange: number;

    shouldRebalance: boolean;
    rebalanceReason: string;

    // time 
    timeHeld: number; // milisec
    timeHeldDays: number;

    riskScore: number;
    recommendation: string;
}

export class PoolMonitor {
    private storageManager: PositionStorageManager;

    // constants for uniswap V3 tick private 
    private readonly TICK_BASE = 1.0001; // each tick = 1.0001x price change

    constructor(storageManager: PositionStorageManager) {
        this.storageManager = storageManager;
    }

    // monitor Pool 
    async monitorPosition(
        positionId: string,
        currentPoolState: PoolState
    ): Promise<PositionMetrics> {
        const snapshot = await this.storageManager.getActivePosition(positionId);

        if (!snapshot) throw new Error(`position ${positionId} nout found or not active`);

        const entryPrice = snapshot.entryPrice;
        const currentPrice = currentPoolState.currentPrice;

        // calculate IL 
        const ilPercentage = this.calculateIL(entryPrice, currentPrice);
        const positionUSD = snapshot.entryValueUSD;
        const ilDollar = (ilPercentage / 100) * positionUSD;

        // calculate fees earned in dollar
        const feesEarnedUSD = this.calculateFeesInDollars(snapshot.feeGrowthInsideA, snapshot.feeGrowthInsideB, currentPrice, snapshot.tokenADecimal, snapshot.tokenBDecimal);

        //calculateliquidity
        const liquidity = this.calculateLiquidity(Number(snapshot.tokenAAmount), Number(snapshot.tokenBAmount))

        // checking if it out of range
        const isOutOfRangeData = this.checkIfOutOfRange(
            currentPrice,
            snapshot.lowerTick,
            snapshot.upperTick
        )

        const isOutOfRange = isOutOfRangeData.isOutOfRange;
        const distanceFromRange = isOutOfRangeData.distance;

        // calculate metrics
        const timeHeld = Date.now() - snapshot.createdAt;
        const timeHeldDays = timeHeld / (1000 * 60 * 60 * 24);

        // calculate APY from fee
        const feesApy = timeHeldDays > 0 ? (feesEarnedUSD / positionUSD) * (365 / timeHeldDays) * 100 : 0;

        // net netPnL
        const netPnL = feesEarnedUSD - Math.abs(ilDollar);
        const netPnLPercentage = (netPnL / positionUSD) * 100;

        // price change
        const priceChange = currentPrice - entryPrice;
        const priceChangePercentage = (priceChange / entryPrice) * 100;

        // decide if rebalanceNeeded
        const rebalanceData = this.shouldRebalance(isOutOfRange, snapshot, ilPercentage, feesEarnedUSD, currentPrice);

        // calculate risk score
        const riskScore = this.calculateRiskScore(ilPercentage, isOutOfRange, feesEarnedUSD, timeHeldDays, currentPoolState.feeTier)


        // generate recommendation
        const ilStatus = this.getIlStatus(ilPercentage, feesEarnedUSD, positionUSD);
        const feeStatus = isOutOfRange ? "OUT_OF_RANGE" : "ACCUMULATING";
        const recommendation = this.generateRecommendation(rebalanceData.shouldRebalance, rebalanceData.reason, ilStatus, feeStatus, riskScore)

        return {
            positionId,
            currentPrice,
            entryPrice,
            priceChange,
            priceChangePercentage,

            liquidity,
            positionValueUSD: positionUSD,

            unrealizedIL: ilPercentage,
            unrealizedILDollar: ilDollar,
            ilStatus,

            feesEarned: feesEarnedUSD,
            feesApy,
            feeStatus,

            netPnL,
            netPnLPercentage,

            isOutOfRange,
            distanceFromRange,
            shouldRebalance: rebalanceData.shouldRebalance,
            rebalanceReason: rebalanceData.reason,

            timeHeld,
            timeHeldDays,

            riskScore,
            recommendation
        }

    }

    private calculateIL(entryPrice: number, currentPrice: number): number {
        if (entryPrice === 0 || entryPrice === currentPrice) {
            return 0;
        }

        try {

            const priceRatio = currentPrice / entryPrice;

            const sqrtRatio = Math.sqrt(priceRatio);

            // IL formula 
            const il = (2 * sqrtRatio) / (1 + priceRatio) - 1;

            // convert to percentage and round 
            const ilPercent = il * 100;

            return Math.round(ilPercent * 100) / 100;
        } catch (error) {
            console.error("Error calculating IL : ", error);
            return 0;
        }
    }

    private calculateFeesInDollars(
        feeGrowthInsideA: bigint,
        feeGrowthInsideB: bigint,
        currentPrice: number,
        tokenADecimals: number,
        tokenBDecimals: number
    ): number {
        try {
            const feeA = Number(feeGrowthInsideA) / Math.pow(10, tokenADecimals); // see this feeGrowthInsideA / tokenADecimals blockchian don't store in decimals write so we need to devide that to make a decimals
            const feeB = Number(feeGrowthInsideB) / Math.pow(10, tokenBDecimals);

            // convert to usd 
            // assuming tokenA is sol and token B usdc
            const feeA_USD = feeA * currentPrice;
            const feeB_USD = feeB;

            const totalFee = feeA_USD + feeB_USD;

            return totalFee;

        } catch (error) {
            console.error("Error calculating fees: ", error)
            return 0;
        }
    }

    private calculateLiquidity(
        amountA: number,
        amountB: number
    ): number {
        try {
            if (amountA <= 0 || amountB <= 0) {
                return 0;
            }

            const liquidity = Math.sqrt(amountA * amountB);

            return Math.round(liquidity * 1000000) / 1000000;
        } catch (error) {
            console.error(`Error in liquidity calculating: `, error);
            return 0;
        }
    }

    private checkIfOutOfRange(
        currentPrice: number,
        lowerTick: number,
        upperTick: number
    ): {
        isOutOfRange: boolean;
        distance: number
    } {
        try {
            const lowerPrice = this.tickToPrice(lowerTick);
            const upperPrice = this.tickToPrice(upperTick);

            if (currentPrice < lowerPrice) {
                // price is too lower 
                const distance = lowerPrice - currentPrice;
                return { isOutOfRange: true, distance: distance }
            } else if (currentPrice > upperPrice) {
                // price is too hight
                const distance = currentPrice - upperPrice;
                return { isOutOfRange: true, distance: distance };
            } else {
                return { isOutOfRange: false, distance: 0 };
            }

        } catch (error) {
            console.error("Error checking range: ", error);
            return { isOutOfRange: false, distance: 0 };
        }
    }

    private tickToPrice(tick: number): number {
        try {
            return Math.pow(this.TICK_BASE, tick) // price = 1.001^tick 
        } catch (error) {
            console.error("Error converting tick to price: ", error);
            return 1;
        }
    }

    private priceToTick(price: number): number {
        try {
            if (price <= 0) return 0;
            return Math.log(price) / Math.log(this.TICK_BASE); // tick = log(price) / log(1.001);
        } catch (error) {
            console.error("Erro converting price to tick: ", error)
            return 0;
        }
    }

    private shouldRebalance(
        isOutOfRange: boolean,
        snapshot: PositionSnapshot,
        ilPercentage: number,
        feesEarned: number,
        currentPrice: number
    ): {
        shouldRebalance: boolean,
        reason: string
    } {
        const entryPrice = snapshot.entryPrice;

        // trigger 1 : Out of range ? 
        if (isOutOfRange) {
            return {
                shouldRebalance: true,
                reason: "OUT_OF_RANGE_URGENT"
            }
        }

        // trigger 2 : IL > fees ( lossing money !! )
        if (Math.abs(ilPercentage) > feesEarned / snapshot.entryValueUSD * 100) {
            return {
                shouldRebalance: true,
                reason: "IL_EXCEEDS_FEES"
            }
        }

        // trigger : 3 Priced move by 3%
        const priceChangePercentage = Math.abs(
            ((currentPrice - entryPrice) / entryPrice) * 100
        );
        if (priceChangePercentage > 3) {
            return {
                shouldRebalance: true,
                reason: `PRICE_MOVED_${priceChangePercentage.toFixed(1)}%`
            }
        }

        // trigger: 4 not rebalance in 7 days ( check timestamp )
        const daysSinceCreated = (Date.now() - snapshot.createdAt) / (1000 * 60 * 60 * 24);
        if (daysSinceCreated > 7) {
            return {
                shouldRebalance: true,
                reason: "TIME_BASED_REBALANCE"
            }
        }

        // no rebalance needed
        return {
            shouldRebalance: false,
            reason: "HOLDING_POSITION"
        }
    }

    private calculateRiskScore(
        ilPercentage: number,
        isOutOfRange: boolean,
        feesEarned: number,
        timeHeldDays: number,
        feeTier: number
    ): number {
        let risk = 0;

        // factor 1 IL loss ( max 30 points )
        const ilRisk = Math.abs(ilPercentage);
        risk += Math.min(ilRisk * 3, 30);

        // factor 2 out of range ( 20 points )
        //
        if (isOutOfRange) risk += 20;

        // factor 3: low fees ( 20 points )
        if (feesEarned < Math.abs(ilPercentage * 100)) {
            risk += 20;
        }

        // factor 4 : higher volatility ( 15 points )
        if (feeTier > 50) {
            // 0.5% fee
            risk += 15
        }

        // factor 5 young position = less data ( 15 data )
        if (timeHeldDays < 1) risk += 15

        // cap at 100
        return Math.min(risk, 100);
    }

    private getIlStatus(
        ilPercentage: number,
        feesEarned: number,
        positionValueUSD: number
    ): "GOOD" | "WARNING" | "CRITICAL" {
        const ilDollar = (ilPercentage / 100) * positionValueUSD;

        // CRITICAL IL > fees   (losing money)
        if (Math.abs(ilDollar) > feesEarned) {
            return "CRITICAL"
        }

        // if il is 50-100% of the fees
        if (Math.abs(ilDollar) >= feesEarned * 0.5) {
            return "WARNING"
        }

        return "GOOD";
    }

    private generateRecommendation(
        shouldRebalance: boolean,
        reason: string,
        ilStatus: string,
        feesStatus: string,
        riskScore: number
    ): string {
        if (shouldRebalance) {
            if (reason === "OUT_OF_RANGE_URGENT") {
                return "Rebalance Urgently - Position is out of range , earning 0 fees!";
            } else if (reason === "IL_EXCEEDS_FEES") {
                return "REBALANCE SOON - Il loss exceeds fee earnings";
            } else if (reason.includes("PRICE_MOVED")) {
                return `REBALANCE - Price moved significantly (${reason})`
            } else if (reason === "TIME_BASED_REBALANCE") {
                return "TIME TO REBALANCE - 7+ days since last rebalance";
            }
        }

        if (feesStatus === "OUT_OF_RANGE") {
            return "Out of range - Not earning fees";
        }

        if (riskScore > 70) {
            return "High risk position - consider tightening range or closing "
        }

        if (ilStatus === "CRITICAL") {
            return " CRITICAL IL - Watch closely , consider action"
        }

        if (ilStatus === "WARNING") {
            return "Monitor IL - Fees are offsetting most be watch carefully"
        }

        return "Position healthy - continue monitoring";
    }

}
