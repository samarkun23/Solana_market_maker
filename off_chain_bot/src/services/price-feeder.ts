import axios from "axios";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { normalizeMeteoraPool, normalizeOrcaPool, normalizeRadiumPool } from "../normalizers/normalizer.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

export async function getPoolMeteora() {
    const response = await axios.get(
                "https://damm-v2.datapi.meteora.ag/pools?page=1&page_size=100"
    )
    return response.data.data;
}

export async function getPoolRaydium() {
    const raydium = await Raydium.load({
        connection,
        owner: Keypair.generate().publicKey
    })
    const data = await raydium.api.fetchPoolByMints({ // getting here sol and usdc 
        mint1: "So11111111111111111111111111111111111111112",
        mint2: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    })

    return data.data;
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

export async function getAllPools() {
    const results = await Promise.allSettled([
        getPoolMeteora(),
        getPoolRaydium(),
        getPoolOrca()
    ]);


    const meteoraPools = results[0].status === "fulfilled"
        ? results[0].value
        : [];

    const raydiumPools = results[1].status === "fulfilled"
        ? results[1].value
        : [];

    const orcaPools = results[2].status === "fulfilled"
        ? results[2].value
        : [];


    return [
        ...meteoraPools.map(normalizeMeteoraPool),
        ...raydiumPools.map(normalizeRadiumPool),
        ...orcaPools.map(normalizeOrcaPool)
    ];
}