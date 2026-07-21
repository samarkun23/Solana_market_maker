import type { JUP_PriceResponse } from "../types/dexes";
import axios from "axios";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import { Connection, PublicKey } from "@solana/web3.js";

export async function getJUPPrice(): Promise<JUP_PriceResponse> {
    const response = await axios.get<JUP_PriceResponse>(
        "https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112"
    )

    return response.data;
}

const connection = new Connection("https://api.mainnet-beta.solana.com");

export async function getPoolRadium() {
    const raydium = await Raydium.load({
        connection,
        owner: new PublicKey("11111111111111111111111111111111")
    })
    const data = await raydium.api.fetchPoolByMints({ // getting here sol and usdc 
        mint1: "So11111111111111111111111111111111111111112",
        mint2: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    })

    return data;
}

export async function getPoolOrca() {
    const response = await axios.get("https://api.orca.so/v2/solana/pools");
    const SOL = "So11111111111111111111111111111111111111112";
    console.log(response.data);
    const solPools = response.data.data.filter(
      (pool:any) =>
         pool.tokenMintA === SOL ||
        pool.tokenMintB === SOL
    );
    return solPools;
}