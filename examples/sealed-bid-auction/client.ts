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
    const result = await instance.publicDecrypt([winnerHandle, bidHandle]);

    const winner = result[winnerHandle] as string;
    const bid = result[bidHandle] as bigint;

    // The proof is returned as part of the decryption response.
    // In the current SDK, publicDecrypt returns the plaintexts and the proof bytes
    // are accessed via the response metadata. Consult the SDK docs for the exact
    // API shape in your installed version.
    const decryptionProof: string = (result as any).proof;

    const tx = await contract.resolve(winner, bid, decryptionProof);
    await tx.wait();

    return { winner, bid };
}
