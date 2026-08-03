// ConfidentialToken client: confidentialTransfer and read-balance flows.
//
// Uses @zama-fhe/sdk (the current client SDK). Shows both the high-level
// token helper and the manual encrypt/decrypt path.

import { ZamaSDK } from "@zama-fhe/sdk";
import { createConfig } from "@zama-fhe/sdk/ethers";
import { sepolia } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { Contract, BrowserProvider } from "ethers";
import type { Address, Hex } from "viem";

const TOKEN_ADDRESS = "0x..." as Address;

const TOKEN_ABI = [
    "function confidentialBalanceOf(address) view returns (bytes32)",
    "function confidentialTransfer(address to, bytes32 encAmount, bytes inputProof)",
    "function mint(address to, uint64 amount)"
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

    const contract = new Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    return {
        sdk,
        signer,
        contract,
        userAddress: (await signer.getAddress()) as Address
    };
}

// ---------------------------------------------------------------------------
// High-level path — the SDK's ERC-7984 helper does the encrypt/write for you.
// ---------------------------------------------------------------------------

export async function transferSimple(to: Address, amount: bigint) {
    const { sdk } = await init();
    const token = sdk.createToken(TOKEN_ADDRESS);
    await token.confidentialTransfer(to, amount);
}

export async function readMyBalanceSimple(): Promise<bigint> {
    const { sdk, userAddress } = await init();
    const token = sdk.createToken(TOKEN_ADDRESS);
    return (await token.balanceOf(userAddress)) as bigint;
}

// ---------------------------------------------------------------------------
// Manual path — when you need control over the contract call itself.
// ---------------------------------------------------------------------------

/// Send a confidential transfer.
export async function confidentialTransfer(to: Address, amount: bigint) {
    const { sdk, contract, userAddress } = await init();

    const { encryptedValues, inputProof } = await sdk.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: TOKEN_ADDRESS,
        userAddress
    });

    // Explicit signature string — ERC-7984 overloads confidentialTransfer.
    const tx = await contract[
        "confidentialTransfer(address,bytes32,bytes)"
    ](to, encryptedValues[0], inputProof);
    await tx.wait();
}

/// Read the caller's encrypted balance.
/// The EIP-712 permit flow is internal — one wallet signature, then cached.
export async function readMyBalance(): Promise<bigint> {
    const { sdk, contract, userAddress } = await init();

    const handle: Hex = await contract.confidentialBalanceOf(userAddress);

    const values = await sdk.decryption.decryptValues([
        { encryptedValue: handle, contractAddress: TOKEN_ADDRESS }
    ]);

    // Result is keyed by handle, not an array.
    return values[handle] as bigint;
}
