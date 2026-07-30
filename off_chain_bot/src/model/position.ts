
export interface PositionSnapshot {
    positionId: string;
    owner: string;      // wallet A : SOL/USDC and wallet B : ETH/USDC
    poolId: string;

    tokenAmint: string;
    tokenBmint: string;
    tokenADecimal: number;
    tokenBDecimal: number;

    createdAt: number;
    entryPrice: number;
    entryTick: number;

    tokenAAmount: bigint;
    tokenBAmount: bigint;

    entryValueUSD: number;

    lowerTick: number;
    upperTick: number;

    liquidity: bigint;

    feeGrowthInsideA: bigint;
    feeGrowthInsideB: bigint;

    txSignature: string;
    creationGasCost: number;

    strategyId: string;
    strategyName: string;
    status: "ACTIVE" | "CLOSED" | "OUT_OF_RANGE" | "REBALANCED";

    rebalanceGasCost?: number;
    rebalanceAt?: number;
    rebalanceReason?: string;

    nextSnapShortId?: string;

}
