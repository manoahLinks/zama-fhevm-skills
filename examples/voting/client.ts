// Browser / Node.js client for the Voting contract.
// Demonstrates casting an encrypted vote and reading revealed tallies.

import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";
import { Contract, BrowserProvider } from "ethers";

const VOTING_ADDRESS = "0x..."; // deployed address
const VOTING_ABI = [
    "function vote(bytes32 encVote, bytes inputProof)",
    "function revealResults()",
    "function yesCountHandle() view returns (bytes32)",
    "function noCountHandle() view returns (bytes32)",
    "function hasVoted(address) view returns (bool)"
];

async function init() {
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const instance = await createInstance({
        ...SepoliaConfig,
        network: (window as any).ethereum
    });
    const contract = new Contract(VOTING_ADDRESS, VOTING_ABI, signer);
    return { instance, signer, contract, userAddress: await signer.getAddress() };
}

export async function castVote(choice: 0 | 1) {
    const { instance, signer, contract, userAddress } = await init();

    const input = instance.createEncryptedInput(VOTING_ADDRESS, userAddress);
    input.add8(BigInt(choice));
    const enc = await input.encrypt();

    const tx = await contract.vote(enc.handles[0], enc.inputProof);
    await tx.wait();
}

export async function readTallies(): Promise<{ yes: bigint; no: bigint }> {
    const { instance, contract } = await init();

    const yesHandle: string = await contract.yesCountHandle();
    const noHandle: string = await contract.noCountHandle();

    // Works after revealResults() has been called — values are publicly decryptable.
    const result = await instance.publicDecrypt([yesHandle, noHandle]);

    return {
        yes: result[yesHandle] as bigint,
        no: result[noHandle] as bigint
    };
}
