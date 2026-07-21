
export interface PoolData {
    symbol: string;

    dex : "meteora" | "raydium" | "orca";

    currentprice : number;

    tokenAReserve : number; // how much sol in pool it's just a ex 
    tokenBReserve : number; // how much usdc in pool

    tokenLiquidity : number; // total usdc liquidity
    feeTier: number;

    lastUpdated: Date;
    volume24h: number;
    priceImpact: number;
}