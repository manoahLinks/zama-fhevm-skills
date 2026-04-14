// Copy-pasteable frontend snippets for the Relayer SDK.
// Covers: instance init, encrypted input, transaction send, user decryption.

import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";
import { BrowserProvider, Contract } from "ethers";

// ---------------------------------------------------------------------------
// 1. Singleton instance (call once at app start)
// ---------------------------------------------------------------------------
let instancePromise: Promise<any> | null = null;

export function getFhevmInstance() {
    if (!instancePromise) {
        instancePromise = createInstance({
            ...SepoliaConfig,
            network: window.ethereum
        });
    }
    return instancePromise;
}

// ---------------------------------------------------------------------------
// 2. Encrypt an input and send a transaction
// ---------------------------------------------------------------------------
export async function deposit(
    contract: Contract,
    contractAddress: string,
    userAddress: string,
    amount: bigint
) {
    const instance = await getFhevmInstance();

    const input = instance.createEncryptedInput(contractAddress, userAddress);
    input.add64(amount);
    const enc = await input.encrypt();

    const tx = await contract.deposit(enc.handles[0], enc.inputProof);
    await tx.wait();
}

// ---------------------------------------------------------------------------
// 3. User decryption (EIP-712 flow)
// ---------------------------------------------------------------------------
export async function readEncryptedBalance(
    contract: Contract,
    contractAddress: string,
    userAddress: string,
    signer: any
): Promise<bigint> {
    const instance = await getFhevmInstance();

    // Fetch the handle from the contract
    const handle: string = await contract.balanceOf(userAddress);

    // Session keypair
    const keypair = instance.generateKeypair();

    // Build the EIP-712 authorization message
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = "10";

    const eip712 = instance.createEIP712(
        keypair.publicKey,
        [contractAddress],
        startTimeStamp,
        durationDays
    );

    // Sign with the user's wallet
    const signature = await signer.signTypedData(
        eip712.domain,
        {
            UserDecryptRequestVerification:
                eip712.types.UserDecryptRequestVerification
        },
        eip712.message
    );

    // Submit the decryption request
    const result = await instance.userDecrypt(
        [{ handle, contractAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace("0x", ""),
        [contractAddress],
        await signer.getAddress(),
        startTimeStamp,
        durationDays
    );

    return result[handle] as bigint;
}

// ---------------------------------------------------------------------------
// 4. Public decryption (for values revealed via FHE.makePubliclyDecryptable)
// ---------------------------------------------------------------------------
export async function readPublicResult(
    handles: string[]
): Promise<Record<string, bigint | string | boolean>> {
    const instance = await getFhevmInstance();
    return await instance.publicDecrypt(handles);
}

// ---------------------------------------------------------------------------
// 5. Typical React usage
// ---------------------------------------------------------------------------
/*
import { useEffect, useState } from "react";

function BalanceDisplay({ contract, contractAddress, signer }) {
    const [balance, setBalance] = useState<bigint | null>(null);

    useEffect(() => {
        (async () => {
            const userAddress = await signer.getAddress();
            const value = await readEncryptedBalance(
                contract, contractAddress, userAddress, signer
            );
            setBalance(value);
        })();
    }, [contract, contractAddress, signer]);

    if (balance === null) return <div>Loading...</div>;
    return <div>Balance: {balance.toString()}</div>;
}
*/
