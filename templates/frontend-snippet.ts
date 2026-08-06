// Copy-pasteable frontend snippets for the Zama SDK (@zama-fhe/sdk).
// Covers: SDK init, encrypted input, transaction send, user + public decryption.
//
// NOTE: this is the CURRENT client SDK. If you are looking at code using
// `createInstance` / `SepoliaConfig` / `instance.createEncryptedInput`, that is
// the legacy `@zama-fhe/relayer-sdk`. See references/07-frontend-sdk.md.

import { ZamaSDK, indexedDBStorage } from "@zama-fhe/sdk";
import { createConfig } from "@zama-fhe/sdk/viem";
import { sepolia } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import {
    createPublicClient,
    createWalletClient,
    custom,
    http,
    type Address,
    type Hex
} from "viem";

// ---------------------------------------------------------------------------
// 1. Singleton SDK (construct once at app start — this is synchronous)
// ---------------------------------------------------------------------------
let sdk: ZamaSDK | null = null;

export function getSdk(): ZamaSDK {
    if (!sdk) {
        const publicClient = createPublicClient({
            chain: sepolia,
            transport: http()
        });

        const walletClient = createWalletClient({
            chain: sepolia,
            transport: custom(window.ethereum!)
        });

        sdk = new ZamaSDK(
            createConfig({
                chains: [sepolia],
                publicClient,
                walletClient,
                ethereum: window.ethereum,      // enables account-change tracking
                storage: indexedDBStorage,      // caches permits across reloads
                relayers: { [sepolia.id]: web() }
            })
        );
    }
    return sdk;
}

// ---------------------------------------------------------------------------
// 2. Encrypt an input and send a transaction
// ---------------------------------------------------------------------------
export async function deposit(
    contractAddress: Address,
    userAddress: Address,
    amount: bigint,
    abi: readonly unknown[],
    walletClient: any
) {
    const sdk = getSdk();

    const { encryptedValues, inputProof } = await sdk.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress,
        userAddress
    });

    return await walletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "deposit",
        args: [encryptedValues[0], inputProof]
    });
}

// ---------------------------------------------------------------------------
// 3. User decryption
//    The EIP-712 permit flow is handled internally — one wallet signature,
//    then cached in `storage`.
// ---------------------------------------------------------------------------
export async function readEncryptedBalance(
    contractAddress: Address,
    userAddress: Address,
    abi: readonly unknown[],
    publicClient: any
): Promise<bigint> {
    const sdk = getSdk();

    // Fetch the ciphertext handle from the contract
    const handle: Hex = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "balanceOf",
        args: [userAddress]
    });

    // Decrypt. Result is a record keyed by handle — NOT an array.
    const values = await sdk.decryption.decryptValues([
        { encryptedValue: handle, contractAddress }
    ]);

    return values[handle] as bigint;
}

// Batch several handles in one round-trip (max 2048 bits total per request)
export async function readMany(
    contractAddress: Address,
    handles: Hex[]
): Promise<Record<Hex, bigint>> {
    const sdk = getSdk();

    const values = await sdk.decryption.decryptValues(
        handles.map((encryptedValue) => ({ encryptedValue, contractAddress }))
    );

    return values as Record<Hex, bigint>;
}

// ---------------------------------------------------------------------------
// 4. Public decryption (values revealed via FHE.makePubliclyDecryptable)
//    No signer required. Returns the clear values AND the decryption proof.
// ---------------------------------------------------------------------------
export async function readPublicResult(handles: Hex[]) {
    const sdk = getSdk();

    // Handle order must match the contract's `cts` array exactly.
    const result = await sdk.decryption.decryptPublicValues(handles);

    return {
        clearValues: result.clearValues,
        abiEncodedClearValues: result.abiEncodedClearValues,
        decryptionProof: result.decryptionProof
    };
}

// ---------------------------------------------------------------------------
// 5. Typical React usage
//    Construction is synchronous, so a useMemo is enough — no loading state
//    for the SDK itself.
// ---------------------------------------------------------------------------
/*
import { useEffect, useState } from "react";

function BalanceDisplay({ contractAddress, userAddress, abi, publicClient }) {
    const [balance, setBalance] = useState<bigint | null>(null);

    useEffect(() => {
        readEncryptedBalance(contractAddress, userAddress, abi, publicClient)
            .then(setBalance);
    }, [contractAddress, userAddress]);

    if (balance === null) return <div>Loading...</div>;
    return <div>Balance: {balance.toString()}</div>;
}
*/
