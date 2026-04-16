# Frontend integration with the Relayer SDK

The TypeScript client package is **`@zama-fhe/relayer-sdk`**. This is the current name. If you see references to `fhevmjs`, that is the legacy package — do not use it.

## Install

```bash
npm install @zama-fhe/relayer-sdk
```

For browser bundles, the SDK exposes ESM-compatible builds. It works with Vite, Next.js (with some `optimizeDeps` tweaking), Remix, and any modern bundler.

## Initialization

### Browser (wallet-connected)

```typescript
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";

const instance = await createInstance({
    ...SepoliaConfig,
    network: window.ethereum   // Eip1193Provider
});
```

`SepoliaConfig` supplies all of the required FHEVM and KMS contract addresses for Sepolia. You only need to override `network`.

### Node.js / server

```typescript
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";

const instance = await createInstance({
    ...SepoliaConfig,
    network: "https://ethereum-sepolia-rpc.publicnode.com"
});
```

### Key facts

- Sepolia chain ID: `11155111`
- Gateway chain ID: `10901`
- `network` is mandatory; omitting it throws.
- `createInstance` is async — it fetches public parameters from the KMS. Await it once, reuse the instance.

## Mainnet API key

On mainnet, the relayer requires an API key. Add it to the config:

```typescript
import { createInstance, MainnetConfig } from "@zama-fhe/relayer-sdk";

const instance = await createInstance({
    ...MainnetConfig,
    network: window.ethereum,
    relayerApiKey: process.env.RELAYER_API_KEY
});
```

Obtain a key from `https://docs.zama.org/protocol/relayer-sdk-guides/fhevm-relayer/mainnet-api-key`. Never ship a key in a public bundle — proxy through your own backend.

## Encrypting inputs

```typescript
const input = instance.createEncryptedInput(contractAddress, userAddress);

input.add64(BigInt(amount));
input.addBool(true);
input.addAddress("0xabc...");

const enc = await input.encrypt();
// enc.handles: bytes32[]  — one per added value
// enc.inputProof: bytes
```

Full `add*` API:

| Method | Accepts |
|---|---|
| `add8`, `add16`, `add32`, `add64`, `add128`, `add256` | `bigint` |
| `addBool` | `boolean` |
| `addAddress` | `string` (`0x...`) |

`contractAddress` and `userAddress` bind the proof: the resulting handles can only be consumed by that contract when submitted by that user.

## Sending a transaction with encrypted inputs

Using ethers:

```typescript
const tx = await contract
    .connect(signer)
    .deposit(enc.handles[0], enc.inputProof);
await tx.wait();
```

Using viem:

```typescript
const hash = await walletClient.writeContract({
    address: contractAddress,
    abi,
    functionName: "deposit",
    args: [enc.handles[0], enc.inputProof]
});
```

## User decryption (reading encrypted values back)

This is the EIP-712 flow from `references/06-decryption.md`. Short version:

```typescript
const handle = await contract.balances(userAddress);

const keypair = instance.generateKeypair();
const startTimeStamp = Math.floor(Date.now() / 1000).toString();
const durationDays = "10";

const eip712 = instance.createEIP712(
    keypair.publicKey,
    [contractAddress],
    startTimeStamp,
    durationDays
);

const signature = await signer.signTypedData(
    eip712.domain,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message
);

const result = await instance.userDecrypt(
    [{ handle, contractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    signature.replace("0x", ""),
    [contractAddress],
    signer.address,
    startTimeStamp,
    durationDays
);

const balance = result[handle];  // bigint
```

**The contract must have called `FHE.allow(balance, userAddress)`** before this will work. If you get a 401 or auth error, this is almost always the cause.

## Public decryption

When the contract marks a value with `FHE.makePubliclyDecryptable`, anyone can fetch the plaintext:

```typescript
const result = await instance.publicDecrypt([winnerHandle, bidHandle]);
const winner = result[winnerHandle];
const bid = result[bidHandle];

type PublicDecryptResult = Record<string, bigint | string | boolean> & {
    proof?: string;
    decryptionProof?: string;
    metadata?: { proof?: string };
};

function extractDecryptionProof(result: PublicDecryptResult): string {
    if (typeof result.proof === "string" && result.proof.length > 0) return result.proof;
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

const decryptionProof = extractDecryptionProof(result);
await contract.resolve(winner, bid, decryptionProof);
```

`publicDecrypt` also returns a proof that a contract can verify on-chain (see `references/06-decryption.md` Part B).

## React integration pattern

```typescript
import { createContext, useContext, useEffect, useState } from "react";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";

const FhevmContext = createContext(null);

export function FhevmProvider({ children }) {
    const [instance, setInstance] = useState(null);

    useEffect(() => {
        if (!window.ethereum) return;
        createInstance({
            ...SepoliaConfig,
            network: window.ethereum
        }).then(setInstance);
    }, []);

    return (
        <FhevmContext.Provider value={instance}>
            {children}
        </FhevmContext.Provider>
    );
}

export const useFhevm = () => useContext(FhevmContext);
```

Then in components:

```typescript
const instance = useFhevm();

async function deposit(amount: bigint) {
    if (!instance) return;
    const input = instance.createEncryptedInput(contractAddress, userAddress);
    input.add64(amount);
    const enc = await input.encrypt();
    await contract.deposit(enc.handles[0], enc.inputProof);
}
```

## Error handling

Common errors and fixes:

| Error | Cause | Fix |
|---|---|---|
| "Network is required" | Forgot `network` in `createInstance` | Pass `window.ethereum` or an RPC URL |
| "No access to ciphertext" (on userDecrypt) | Contract did not call `FHE.allow(ct, user)` | Add the allow, redeploy or retry the action that sets it |
| "Input proof verification failed" | Mismatched contract or user address in `createEncryptedInput` | Re-encrypt with the correct pair |
| "Ciphertext too large" (on userDecrypt) | > 2048 bits total in one call | Split into multiple `userDecrypt` calls |
| `userDecrypt` hangs | Wrong network config or RPC | Confirm `SepoliaConfig` matches deployed contract's chain |

## Anti-patterns

- **Using `fhevmjs`** — deprecated. Use `@zama-fhe/relayer-sdk`.
- **Creating a new instance on every component render** — `createInstance` is expensive. Put it in a provider or module-level singleton.
- **Hardcoding contract addresses across environments** — parameterize per network.
- **Shipping a mainnet relayer API key in the frontend bundle** — proxy through your backend.
- **Calling `input.encrypt()` with a stale `contractAddress`** after redeploying — you will get "proof verification failed".

## What to read next

- `references/08-testing-hardhat.md` — the same API but for tests
- `templates/frontend-snippet.ts` — a copy-pasteable React snippet
