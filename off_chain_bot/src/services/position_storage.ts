import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { PositionSnapshot } from '../model/position.js';
import { utf8 } from '@raydium-io/raydium-sdk-v2';

export class PositionStorageManager {
    private snapshotDir: string;
    private historyFile: string;

    constructor(dataDir: string = "./position-data") {
        this.snapshotDir = path.join(dataDir, "snapshots");
        this.historyFile = path.join(dataDir, "position-history.data")

        // create dir if not exist 
        if (!fs.existsSync(this.snapshotDir)) {
            fs.mkdirSync(this.snapshotDir, { recursive: true })
        }
    }

    // save new position-history snapshot 
    async savePositionSnapshot(snapshort: PositionSnapshot): Promise<string> {
        const positionId = snapshort.positionId || String(uuidv4);

        const fullSnapshort: PositionSnapshot = {
            ...snapshort,
            positionId,
            createdAt: snapshort.createdAt || Date.now(),
            status: "ACTIVE"
        }

        // save to file TODO: we need this to save in db i just don't setup the db yet so i am making a todo for it i will revisit it .
        const snapshortForStorage = this.bigIntToString(fullSnapshort);
        const filePath = path.join(this.snapshotDir, `${positionId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(snapshortForStorage, null, 2));

        // add to history index 
        await this.addToHistory({ // TODO: Need to make this function
            positionId,
            event: "POSITION_CREATED",
            timeStamp: Date.now(),
            txSignature: snapshort.txSignature
        })

        console.log(`Position snapshot saved : ${positionId}`)
        return positionId;
    }

    async getActivePosition(positionId: string): Promise<PositionSnapshot | null> {
        try {

            const filePath = path.join(this.snapshotDir, `${positionId}.json`);

            if (!fs.existsSync(filePath)) return null;

            const data = fs.readFileSync(filePath, 'utf8');

            const snapshot = this.stringToBigInt(JSON.parse(data));

            return snapshot.status === "ACTIVE" ? snapshot : null;

        } catch (error) {
            console.log(`Error reading position ${positionId}: `, error)
            return null;
        }
    }

    async rebalancePosition(
        oldPositionId: string,
        newSnapshot: Partial<PositionSnapshot>,
        rebalanceReason: string,
        rebalanceGasCost: number
    ): Promise<string> {
        const oldSnapShot = await this.getActivePosition(oldPositionId);

        if (!oldSnapShot) {
            throw new Error(`Position ${oldPositionId} not found or not active`)
        };

        const newPositionId = uuidv4();

        const updateOldSnapshot: PositionSnapshot = {
            ...oldSnapShot,
            status: "REBALANCED",
            rebalanceAt: Date.now(),
            rebalanceReason,
            rebalanceGasCost,
            nextSnapShortId: newPositionId,
        };

        //updating old snapshot
        const oldFilePath = path.join(this.snapshotDir, `${oldPositionId}.json`);
        fs.writeFileSync(oldFilePath, JSON.stringify(updateOldSnapshot, null, 2));

        const createNewSnapshot: PositionSnapshot = {
            ...oldSnapShot,
            ...newSnapshot,
            positionId: newPositionId,
            createdAt: Date.now(),
            status: "ACTIVE",
            lowerTick: newSnapshot.lowerTick || oldSnapShot!.lowerTick,
            upperTick: newSnapshot.upperTick || oldSnapShot!.upperTick,
            entryTick: newSnapshot.entryTick || oldSnapShot!.entryTick
        }

        const newFilePath = path.join(this.snapshotDir, `${newPositionId}.json`)
        fs.writeFileSync(newFilePath, JSON.stringify(createNewSnapshot, null, 2))

        await this.addToHistory({
            positionId: oldPositionId,
            event: "POSITION_REBALANCED",
            timestamp: Date.now(),
            newPositionId,
            reason: rebalanceReason,
            gasCost: rebalanceGasCost
        })

        console.log(`Position rebalnced: ${oldPositionId} -> ${newPositionId}`);
        return newPositionId;
    }

    async closePosition(
        positionId: string,
        closerReason: string,
        closureGasCost: number
    ): Promise<void> {
        const snapshot = await this.getActivePosition(positionId);

        if (!snapshot) throw new Error(`Position ${positionId} not found or not active`)

        const closedSnapshot: PositionSnapshot = {
            ...snapshot,
            rebalanceAt: Date.now(),
            rebalanceReason: closerReason,
            rebalanceGasCost: closureGasCost,
        }

        const filePath = path.join(this.snapshotDir, `${positionId}.json`)
        fs.writeFileSync(filePath, JSON.stringify(closedSnapshot, null, 2))

        await this.addToHistory({
            positionId,
            event: "POSITION_CLOSED",
            timestamp: Date.now(),
            reason: closerReason,
            gasCost: closureGasCost
        })

        console.log(`Position closed: ${positionId}`)
    }

    async getPositionHistory(positionId: string): Promise<PositionSnapshot[]> {
        const history: PositionSnapshot[] = [];
        let currentId: string | undefined = positionId;

        while (currentId) {
            const snapshot = await this.getSnapshot(currentId);
            if (!snapshot) break;

            history.push(snapshot);
            currentId = snapshot.nextSnapShortId
        }

        return history;
    }

    async getWalletPositions(owner: string): Promise<PositionSnapshot[]> {
        const positions: PositionSnapshot[] = [];

        const files = fs.readdirSync(this.snapshotDir);

        for (const file of files) {
            if (!file.endsWith(".json")) continue;

            try {
                const data = fs.readFileSync(path.join(this.snapshotDir, file), "utf8")
                const snapshot = JSON.parse(data) as PositionSnapshot;

                // only active position
                if (snapshot.owner === owner && snapshot.status === "ACTIVE") {
                    positions.push(snapshot);
                }
            } catch (error) {
                console.error(`Error reading file ${file}: `, error)
            }
        }

        return positions;
    }

    // summery stat for position
    async getPositionStats(positionId: string): Promise<{
        createdAt: number;
        totalRebalances: number;
        totalGasCost: number;
        status: string
    }> {
        const history = await this.getPositionHistory(positionId);

        if (history.length === 0) {
            throw new Error(`Position ${positionId} not found`)
        }

        const rebalanceCount = history.filter(s => s.status === "REBALANCED").length;

        const totalGas = history.reduce(
            (sum, s) => sum + (s.creationGasCost || 0) + (s.rebalanceGasCost || 0),
            0
        )

        // TODO: need to fix the undefined issue
        return {
            //@ts-ignore
            createdAt: history[0].createdAt,
            totalRebalances: rebalanceCount,
            totalGasCost: totalGas,
            //@ts-ignore
            status: history[history.length - 1]?.status
        }
    }

    // PRIVATE FUNCTIONS 
    private async getSnapshot(
        positionId: string
    ): Promise<PositionSnapshot | null> {
        try {
            const filePath = path.join(this.snapshotDir, `${positionId}.json`);
            if (!fs.existsSync(filePath)) return null;

            const data = fs.readFileSync(filePath, "utf8")
            return JSON.parse(data) as PositionSnapshot;

        } catch (error) {
            console.error(`Error reading snapshot ${positionId}: `, error)
            return null
        }
    }

    private async addToHistory(event: any): Promise<void> {
        try {
            let history: any[] = [];

            if (fs.existsSync(this.historyFile)) {
                const data = fs.readFileSync(this.historyFile, "utf8")
                history = JSON.parse(data);
            }

            history.push(event);
            fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2))

        } catch (error) {
            console.error(`Error adding to history:`, error)
        }

    }

    private bigIntToString(obj: any): any {
        if (typeof obj !== "object" || obj === null) {
            return obj;
        }

        if (typeof obj === "bigint") {
            return obj.toString();
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this.bigIntToString(item));
        }

        const result: any = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];
                if (typeof value === "bigint") {
                    result[key] = value.toString();
                } else if (typeof value === "object" && value !== null) {
                    result[key] = this.bigIntToString(value);
                } else {
                    result[key] = value;
                }
            }
        }
        return result;
    }

    private stringToBigInt(obj: any): any {
        if (typeof obj !== "object" || obj === null) {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this.stringToBigInt(item));
        }

        const result: any = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];

                // These fields are BigInt fields
                if (
                    key === "tokenAAmount" ||
                    key === "tokenBAmount" ||
                    key === "liquidity" ||
                    key === "feeGrowthInsideA" ||
                    key === "feeGrowthInsideB"
                ) {
                    result[key] =
                        typeof value === "string" ? BigInt(value) : BigInt(value);
                } else if (typeof value === "object" && value !== null) {
                    result[key] = this.stringToBigInt(value);
                } else {
                    result[key] = value;
                }
            }
        }
        return result;
    }

}
