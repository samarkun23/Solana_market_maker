import type { PoolData } from "../types/dexes.js";

export function normalizeOrcaPool(pool:any): PoolData {
    return{
        symbol: `${pool.tokenA.symbol}/${pool.tokenB.symbol}`,

        dex: "orca",

        currentprice: Number(pool.price),
        tokenAReserve: Number(pool.tokenBalanceA/100**pool.tokenB.decimals),
        tokenBReserve: Number(pool.tokenBalanceB/100**pool.tokenB.decimals),
        tokenLiquidity: Number(pool.tvlUSDC),
        feeTier: Number(pool.feeRate/10000),
        lastUpdated: new Date(pool.updatedAt),
        volume24h: Number(pool.stats["24h"].volume),
        priceImpact: 0
    }
}

export function normalizeRadiumPool(pool: any): PoolData {
    return{
        symbol: `${pool.mintA.symbol}/${pool.mintB.symbol}`,

        dex: "raydium",

        currentprice: Number(pool.price),

        tokenAReserve: Number(pool.mintAmountA),

        tokenBReserve: Number(pool.mintAmountB),

        tokenLiquidity: Number(pool.tvl),

        feeTier: Number(pool.feeRate),

        lastUpdated: new Date(),

        volume24h: Number(pool.day?.volume ?? 0),

        priceImpact: 0
    }
}


export const normalizeMeteoraPool = (pool: any): PoolData => {
    return {
        symbol: `${pool.token_x.symbol}/${pool.token_y.symbol}`,

    dex: "meteora",

    currentprice: pool.current_price,

    tokenAReserve: pool.token_x_amount,

    tokenBReserve: pool.token_y_amount,

    tokenLiquidity: pool.tvl,

    feeTier: pool.pool_config.base_fee_pct,

    lastUpdated: new Date(pool.created_at),

    volume24h: pool.volume["24h"],

    // Meteora Data API me direct price impact nahi milta
    priceImpact: 0, 
    };
};