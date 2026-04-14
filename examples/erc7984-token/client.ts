// ConfidentialToken client: confidentialTransfer and read-balance flows.

import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";
import { Contract, BrowserProvider } from "ethers";

const TOKEN_ADDRESS = "0x...";

const TOKEN_ABI = [
    "function confidentialBalanceOf(address) view returns (bytes32)",
    "function confidentialTransfer(address to, bytes32 encAmount, bytes inputProof)",
    "function mint(address to, uint64 amount)"
];

async function init() {
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const instance = await createInstance({
        ...SepoliaConfig,
        network: (window as any).ethereum
    });
    const contract = new Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    return {
        instance,
        signer,
        contract,
        userAddress: await signer.getAddress()
    };
}

/// Send a confidential transfer.
export async function confidentialTransfer(to: string, amount: bigint) {
    const { instance, contract, userAddress } = await init();

    const input = instance.createEncryptedInput(TOKEN_ADDRESS, userAddress);
    input.add64(amount);
    const enc = await input.encrypt();

    const tx = await contract[
        "confidentialTransfer(address,bytes32,bytes)"
    ](to, enc.handles[0], enc.inputProof);
    await tx.wait();
}

/// Read the caller's encrypted balance using the EIP-712 user decryption flow.
export async function readMyBalance(): Promise<bigint> {
    const { instance, signer, contract, userAddress } = await init();

    const handle: string = await contract.confidentialBalanceOf(userAddress);

    const keypair = instance.generateKeypair();
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = "10";

    const eip712 = instance.createEIP712(
        keypair.publicKey,
        [TOKEN_ADDRESS],
        startTimeStamp,
        durationDays
    );

    const signature = await signer.signTypedData(
        eip712.domain,
        {
            UserDecryptRequestVerification:
                eip712.types.UserDecryptRequestVerification
        },
        eip712.message
    );

    const result = await instance.userDecrypt(
        [{ handle, contractAddress: TOKEN_ADDRESS }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace("0x", ""),
        [TOKEN_ADDRESS],
        userAddress,
        startTimeStamp,
        durationDays
    );

    return result[handle] as bigint;
}
