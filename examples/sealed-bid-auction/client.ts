// End-to-end client for SealedBidAuction.
// 1. Place encrypted bid
// 2. After auction ends, read revealed values via public decryption
// 3. Submit resolution with the proof

import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";
import { Contract, BrowserProvider } from "ethers";

const AUCTION_ADDRESS = "0x...";

const AUCTION_ABI = [
    "function bid(bytes32 encBid, bytes inputProof)",
    "function reveal()",
    "function resolve(address claimedWinner, uint64 claimedBid, bytes decryptionProof)",
    "function highestBidHandle() view returns (bytes32)",
    "function winningAddressHandle() view returns (bytes32)",
    "function revealedWinner() view returns (address)",
    "function auctionEnds() view returns (uint256)"
];

type PublicDecryptResult = Record<string, bigint | string | boolean> & {
    proof?: string;
    decryptionProof?: string;
    metadata?: {
        proof?: string;
    };
};

function extractDecryptionProof(result: PublicDecryptResult): string {
    if (typeof result.proof === "string" && result.proof.length > 0) {
        return result.proof;
    }
    if (typeof result.decryptionProof === "string" && result.decryptionProof.length > 0) {
        return result.decryptionProof;
    }
    if (typeof result.metadata?.proof === "string" && result.metadata.proof.length > 0) {
        return result.metadata.proof;
    }

    throw new Error(
        "publicDecrypt did not return a decryption proof. Check your @zama-fhe/relayer-sdk version."
    );
}

async function init() {
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const instance = await createInstance({
        ...SepoliaConfig,
        network: (window as any).ethereum
    });
    const contract = new Contract(AUCTION_ADDRESS, AUCTION_ABI, signer);
    return {
        instance,
        signer,
        contract,
        userAddress: await signer.getAddress()
    };
}

/// Place an encrypted bid.
export async function placeBid(amount: bigint) {
    const { instance, contract, userAddress } = await init();

    const input = instance.createEncryptedInput(AUCTION_ADDRESS, userAddress);
    input.add64(amount);
    const enc = await input.encrypt();

    const tx = await contract.bid(enc.handles[0], enc.inputProof);
    await tx.wait();
}

/// After the auction deadline, anyone can trigger the reveal.
export async function triggerReveal() {
    const { contract } = await init();
    const tx = await contract.reveal();
    await tx.wait();
}

/// Fetch the publicly-decryptable winner and bid, then post them with proof.
export async function resolveAuction() {
    const { instance, contract } = await init();

    const winnerHandle: string = await contract.winningAddressHandle();
    const bidHandle: string = await contract.highestBidHandle();

    // Order MUST match the contract's cts array in resolve(): [winner, bid]
    const result = await instance.publicDecrypt([
        winnerHandle,
        bidHandle
    ]) as PublicDecryptResult;

    const winner = result[winnerHandle] as string;
    const bid = result[bidHandle] as bigint;

    // Different SDK releases may expose proof fields under different keys.
    const decryptionProof = extractDecryptionProof(result);

    const tx = await contract.resolve(winner, bid, decryptionProof);
    await tx.wait();

    return { winner, bid };
}
