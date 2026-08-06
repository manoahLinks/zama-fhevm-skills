// End-to-end client for SealedBidAuction.
// 1. Place encrypted bid
// 2. After auction ends, read revealed values via public decryption
// 3. Submit resolution with the proof
//
// Uses @zama-fhe/sdk (the current client SDK).

import { ZamaSDK } from "@zama-fhe/sdk";
import { createConfig } from "@zama-fhe/sdk/ethers";
import { sepolia } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { Contract, BrowserProvider } from "ethers";
import type { Address, Hex } from "viem";

const AUCTION_ADDRESS = "0x..." as Address;

const AUCTION_ABI = [
    "function bid(bytes32 encBid, bytes inputProof)",
    "function reveal()",
    "function resolve(address claimedWinner, uint64 claimedBid, bytes decryptionProof)",
    "function highestBidHandle() view returns (bytes32)",
    "function winningAddressHandle() view returns (bytes32)",
    "function revealedWinner() view returns (address)",
    "function auctionEnds() view returns (uint256)"
];

let sdk: ZamaSDK | null = null;

async function init() {
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();

    if (!sdk) {
        sdk = new ZamaSDK(
            createConfig({
                chains: [sepolia],
                ethereum: (window as any).ethereum,
                relayers: { [sepolia.id]: web() }
            })
        );
    }

    const contract = new Contract(AUCTION_ADDRESS, AUCTION_ABI, signer);
    return {
        sdk,
        signer,
        contract,
        userAddress: (await signer.getAddress()) as Address
    };
}

/// Place an encrypted bid.
export async function placeBid(amount: bigint) {
    const { sdk, contract, userAddress } = await init();

    const { encryptedValues, inputProof } = await sdk.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: AUCTION_ADDRESS,
        userAddress
    });

    const tx = await contract.bid(encryptedValues[0], inputProof);
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
    const { sdk, contract } = await init();

    const winnerHandle: Hex = await contract.winningAddressHandle();
    const bidHandle: Hex = await contract.highestBidHandle();

    // Order MUST match the contract's cts array in resolve(): [winner, bid].
    // The decryption proof is bound to this exact ordering.
    // No signer needed — these are publicly decryptable.
    const result = await sdk.decryption.decryptPublicValues([
        winnerHandle,
        bidHandle
    ]);

    const winner = result.clearValues[winnerHandle] as string;
    const bid = result.clearValues[bidHandle] as bigint;

    const tx = await contract.resolve(winner, bid, result.decryptionProof);
    await tx.wait();

    return { winner, bid };
}
