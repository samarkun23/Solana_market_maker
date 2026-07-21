

export interface JUP_PriceResponse {
  [mintAddress: string]: {
    createdAt: string;      // When the token was minted/created (fixed date for legacy tokens like SOL, USDC)
    liquidity: number;      // Total liquidity in USD
    usdPrice: number;
    blockId: number;        // Solana block when price was computed
    decimals: number;
    priceChange24h: number; // 24h change as percentage
  };
}

export interface PoolData {
    symbol: string;

    dex : "jupiter" | "raydium" | "orca";

    currentprice : number;

    tokenAReserve : number; // how much sol in pool it's just a ex 
    tokenBReserve : number; // how much usdc in pool

    tokenLiquidity : number; // total usdc liquidity
    feeTier: number;

    lastUpdated: Date;
    volume24h: number;
    priceImpact: number;
}