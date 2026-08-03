// Browser / Node.js client for the Voting contract.
// Demonstrates casting an encrypted vote and reading revealed tallies.
//
// Uses @zama-fhe/sdk (the current client SDK), with ethers for contract calls.

import { ZamaSDK } from "@zama-fhe/sdk";
import { createConfig } from "@zama-fhe/sdk/ethers";
import { sepolia } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { Contract, BrowserProvider } from "ethers";
import type { Address, Hex } from "viem";

const VOTING_ADDRESS = "0x..." as Address; // deployed address
const VOTING_ABI = [
    "function vote(bytes32 encVote, bytes inputProof)",
    "function revealResults()",
    "function yesCountHandle() view returns (bytes32)",
    "function noCountHandle() view returns (bytes32)",
    "function hasVoted(address) view returns (bool)"
];

// Build the SDK once — construction is synchronous.
let sdk: ZamaSDK | null = null;

async function init() {
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();

    if (!sdk) {
        // The ethers config is a union: pass `{ ethereum }` (browser) OR
        // `{ signer }` (Node/direct) — not both. Storage defaults to
        // IndexedDB in a browser and memory in Node.
        sdk = new ZamaSDK(
            createConfig({
                chains: [sepolia],
                ethereum: (window as any).ethereum,
                relayers: { [sepolia.id]: web() }
            })
        );
    }

    const contract = new Contract(VOTING_ADDRESS, VOTING_ABI, signer);
    return { sdk, signer, contract, userAddress: (await signer.getAddress()) as Address };
}

export async function castVote(choice: 0 | 1) {
    const { sdk, contract, userAddress } = await init();

    const { encryptedValues, inputProof } = await sdk.encrypt({
        values: [{ value: BigInt(choice), type: "euint8" }],
        contractAddress: VOTING_ADDRESS,
        userAddress
    });

    const tx = await contract.vote(encryptedValues[0], inputProof);
    await tx.wait();
}

export async function readTallies(): Promise<{ yes: bigint; no: bigint }> {
    const { sdk, contract } = await init();

    const yesHandle: Hex = await contract.yesCountHandle();
    const noHandle: Hex = await contract.noCountHandle();

    // Works after revealResults() has been called — values are publicly decryptable.
    // No signer needed for public decryption.
    const result = await sdk.decryption.decryptPublicValues([yesHandle, noHandle]);

    return {
        yes: result.values[yesHandle] as bigint,
        no: result.values[noHandle] as bigint
    };
}
