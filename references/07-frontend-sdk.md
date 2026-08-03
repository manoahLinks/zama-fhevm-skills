# Frontend integration with the Zama SDK

The current TypeScript client package is **`@zama-fhe/sdk`**. React bindings live in **`@zama-fhe/react-sdk`**.

Two packages are now legacy. Do not start new work on either:

| Package | Status |
|---|---|
| `@zama-fhe/sdk` | **Current.** Use this. |
| `@zama-fhe/relayer-sdk` | Legacy. Still published, still works, superseded. See the migration section at the bottom. |
| `fhevmjs` | Long deprecated. |

The API is not a rename of the old one — it is a different shape. `createInstance` / `SepoliaConfig` / `instance.createEncryptedInput` belong to the legacy SDK. The current SDK is a `ZamaSDK` class built from a `createConfig` object.

## Install

```bash
npm install @zama-fhe/sdk viem
# or with ethers
npm install @zama-fhe/sdk ethers
```

Peer dependencies: `viem >= 2`, `ethers >= 6`, `@tanstack/query-core >= 5`. You only need the one you actually use.

## Subpath exports

The package is split by concern. Import from the right subpath:

| Subpath | Provides |
|---|---|
| `@zama-fhe/sdk` | `ZamaSDK`, error classes, types, contract helpers |
| `@zama-fhe/sdk/viem` | `createConfig` for viem, `ViemSigner`, `ViemProvider` |
| `@zama-fhe/sdk/ethers` | `createConfig` for ethers |
| `@zama-fhe/sdk/chains` | `sepolia`, `mainnet`, `hardhat`, `anvil`, `hoodi`, `bscTestnet` |
| `@zama-fhe/sdk/web` | `web()` — browser relayer transport |
| `@zama-fhe/sdk/node` | `node()` — server relayer transport |
| `@zama-fhe/sdk/query` | TanStack Query integration |
| `@zama-fhe/sdk/cleartext` | Cleartext relayer for local dev |

There is one `createConfig` per adapter and they are **not** interchangeable — importing it from `@zama-fhe/sdk/viem` and passing ethers objects will not work.

## Initialization — browser (viem)

```typescript
import { ZamaSDK } from "@zama-fhe/sdk";
import { createConfig } from "@zama-fhe/sdk/viem";
import { sepolia } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { createPublicClient, createWalletClient, custom, http } from "viem";

const publicClient = createPublicClient({
    chain: sepolia,
    transport: http()
});

const walletClient = createWalletClient({
    chain: sepolia,
    transport: custom(window.ethereum)
});

const config = createConfig({
    chains: [sepolia],
    publicClient,
    walletClient,
    ethereum: window.ethereum,          // enables account/chain change tracking
    relayers: { [sepolia.id]: web() }
});

const sdk = new ZamaSDK(config);
```

Passing `ethereum` is optional but recommended in a browser — without it the SDK cannot observe `accountsChanged` / `disconnect`, and account switching will silently use a stale signer.

## Initialization — Node / server

```typescript
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { createConfig } from "@zama-fhe/sdk/viem";
import { sepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";

const config = createConfig({
    chains: [sepolia],
    publicClient,
    walletClient,
    storage: memoryStorage,
    relayers: { [sepolia.id]: node() }
});

const sdk = new ZamaSDK(config);
```

Use `node()` on a server and `web()` in a browser. The transports differ in how they fetch and cache public parameters; using `web()` server-side will fail or leak state across requests.

### Storage backends

Storage caches permits and transport keypairs, so the user is not re-prompted to sign on every decryption.

| Export | Use in |
|---|---|
| `memoryStorage` | Node, tests |
| `indexedDBStorage` | Browser (persists across reloads) |
| `chromeSessionStorage` | Browser extensions |

## Key facts

- Sepolia chain ID: `11155111`
- Gateway chain ID: `10901`
- Sepolia relayer URL: `https://relayer.testnet.zama.org`
- `new ZamaSDK(config)` is **synchronous** — unlike the legacy `createInstance`, there is no top-level await. Public parameters are fetched lazily on first use.
- Build the SDK once and reuse it. Do not construct one per render.
- Full address tables are in `references/12-contract-addresses.md`.

## Encrypting inputs

```typescript
const { encryptedValues, inputProof } = await sdk.encrypt({
    values: [
        { value: 1000n, type: "euint64" },
        { value: true,  type: "ebool" }
    ],
    contractAddress: "0xYourContract",
    userAddress: "0xUser"
});
```

- `values` is a typed array — each entry carries its own FHE type. This replaces the legacy chained `input.add64(...)` builder.
- Integer types take `bigint`. `ebool` takes `boolean` (or `1n`/`0n`). `eaddress` takes an address string.
- `encryptedValues` comes back **in the same order as the inputs**, and is what you pass to the contract.
- `contractAddress` and `userAddress` are bound into `inputProof`: the handles can only be consumed by that contract when submitted by that user.

Valid `type` values: `euint8`, `euint16`, `euint32`, `euint64`, `euint128`, `euint256`, `ebool`, `eaddress`.

## Sending a transaction with encrypted inputs

viem:

```typescript
const hash = await walletClient.writeContract({
    address: contractAddress,
    abi,
    functionName: "deposit",
    args: [encryptedValues[0], inputProof]
});
```

ethers:

```typescript
const tx = await contract.connect(signer).deposit(encryptedValues[0], inputProof);
await tx.wait();
```

## User decryption

Reading an encrypted value back. The EIP-712 signing dance the legacy SDK made you do by hand is now internal — the SDK builds the permit, prompts for one signature, and caches it in `storage`.

```typescript
const handle = await contract.read.balances([userAddress]);

const values = await sdk.decryption.decryptValues([
    { encryptedValue: handle, contractAddress }
]);

const balance = values[handle];   // bigint
```

- The result is a **record keyed by the encrypted handle**, not an array.
- Repeated calls for the same handle are cached and skip the relayer round-trip.
- An all-zero handle resolves to `0n` without hitting the relayer at all.
- Requires a configured signer. Without one you get `SignerNotConfiguredError`.

**The contract must have called `FHE.allow(value, userAddress)`** before this works. If you get an authorization error, that is almost always the cause — not the SDK config.

Batch multiple handles in one call, still respecting the **2048-bit total** limit per request:

```typescript
const values = await sdk.decryption.decryptValues([
    { encryptedValue: balanceHandle, contractAddress },
    { encryptedValue: limitHandle,   contractAddress }
]);
```

## Public decryption

For values the contract marked with `FHE.makePubliclyDecryptable`. No signer needed.

```typescript
const result = await sdk.decryption.decryptPublicValues([winnerHandle, bidHandle]);

const winner = result.values[winnerHandle];
const bid = result.values[bidHandle];

await contract.write.resolve([winner, bid, result.decryptionProof]);
```

Unlike the legacy SDK — where the proof field name varied by version and needed a defensive extractor — `decryptPublicValues` returns the clear values and the decryption proof as a structured result.

Handle order must match what the contract expects when verifying the proof on-chain. `[a, b]` is not interchangeable with `[b, a]`.

## Delegated decryption

Lets one address decrypt values owned by another, granted on-chain. There was no first-class equivalent in the legacy SDK.

```typescript
await sdk.delegations.delegate({ delegate: operatorAddress, contractAddress });

const values = await sdk.decryption.delegatedDecryptValues(
    [{ encryptedValue: handle, contractAddress }],
    delegatorAddress
);
```

By default the call waits out the gateway propagation window. Pass `{ waitForPropagation: false }` to fail fast instead.

## Confidential token helpers

For ERC-7984 tokens the SDK ships high-level wrappers, so you do not hand-roll encrypt → write → decrypt:

```typescript
const token = sdk.createToken(tokenAddress);
const balance = await token.balanceOf(userAddress);      // decrypted
await token.confidentialTransfer(recipient, 500n);

// ERC-7984 wrappers around an ERC-20
const wrapped = sdk.createWrappedToken(wrapperAddress);
await wrapped.shield(1000n);      // ERC-20 → confidential
await wrapped.unshield(500n);     // confidential → ERC-20
```

`sdk.registry` resolves underlying ↔ confidential token pairs from the on-chain wrappers registry.

## React

```bash
npm install @zama-fhe/react-sdk
```

If you are wiring it yourself instead, build the SDK once at module or provider level:

```typescript
import { createContext, useContext, useMemo } from "react";
import { ZamaSDK } from "@zama-fhe/sdk";

const SdkContext = createContext<ZamaSDK | null>(null);

export function SdkProvider({ children, publicClient, walletClient }) {
    const sdk = useMemo(
        () => new ZamaSDK(createConfig({
            chains: [sepolia],
            publicClient,
            walletClient,
            relayers: { [sepolia.id]: web() }
        })),
        [publicClient, walletClient]
    );

    return <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>;
}

export const useSdk = () => useContext(SdkContext);
```

Because construction is synchronous, there is no loading state to model — a `useMemo` is enough, and the old `useState(null)` + `useEffect` + `.then(setInstance)` pattern is no longer needed.

## Error handling

The SDK throws typed errors, all extending `ZamaError`. Catch the specific class rather than string-matching messages:

| Error | Cause | Fix |
|---|---|---|
| `SignerNotConfiguredError` | Decryption attempted with a read-only config | Pass a `walletClient` / signer |
| `NotEntitledError` | Contract never called `FHE.allow(ct, user)` | Add the allow and re-run the action that sets it |
| `ChainMismatchError` | Signer and provider on different chains | Align both; check the wallet's active network |
| `EncryptionFailedError` | Bad `contractAddress` / `userAddress` pair | Re-encrypt against the correct pair |
| `RelayerRequestFailedError` | Relayer HTTP failure | Check `statusCode`; use `isRetryable(err)` and `retryAfterSeconds(err)` |
| `WalletNotConnectedError` | No wallet account available | Prompt connection first |
| `TransportKeyPairExpiredError` | Cached keypair aged out | Clear storage; the SDK re-derives on next call |

`matchZamaError(err)` narrows an unknown error to a typed SDK error, and `isRetryable(err)` tells you whether a retry is worth attempting.

## Anti-patterns

- **Using `createInstance` / `SepoliaConfig`.** That is the legacy SDK. The current entry point is `new ZamaSDK(createConfig({...}))`.
- **Mixing adapters** — importing `createConfig` from `@zama-fhe/sdk/viem` while passing ethers clients.
- **Using `web()` on a server or `node()` in a browser.**
- **Constructing a `ZamaSDK` per render.** Hoist it into a provider or module singleton.
- **Omitting `ethereum` in a browser config** and then wondering why account switching does not take effect.
- **Assuming `decryptValues` returns an array.** It returns a record keyed by handle.
- **Hardcoding contract addresses across environments.** Parameterize per network.
- **Shipping a mainnet relayer API key in the bundle.** Proxy it through your own backend.

## Migrating from `@zama-fhe/relayer-sdk`

| Legacy | Current |
|---|---|
| `createInstance({ ...SepoliaConfig, network })` | `new ZamaSDK(createConfig({ chains, publicClient, walletClient, relayers }))` |
| `await createInstance(...)` (async) | `new ZamaSDK(...)` (sync) |
| `SepoliaConfig` / `MainnetConfig` | `sepolia` / `mainnet` from `@zama-fhe/sdk/chains` |
| `instance.createEncryptedInput(c, u)` + `.add64()` + `.encrypt()` | `sdk.encrypt({ values: [{ value, type }], contractAddress, userAddress })` |
| `enc.handles[0]`, `enc.inputProof` | `encryptedValues[0]`, `inputProof` |
| `generateKeypair` + `createEIP712` + `signTypedData` + `userDecrypt` | `sdk.decryption.decryptValues([{ encryptedValue, contractAddress }])` |
| `instance.publicDecrypt([...])` | `sdk.decryption.decryptPublicValues([...])` |
| manual proof extraction from `publicDecrypt` | `result.decryptionProof` |
| *(no equivalent)* | `sdk.delegations`, `sdk.permits`, `sdk.createToken`, `sdk.registry` |

The Solidity side is unchanged. Migrating is a client-only change — no redeploy needed.

## What to read next

- `references/12-contract-addresses.md` — addresses, chain IDs, relayer URLs
- `references/08-testing-hardhat.md` — the test-side equivalent (`@fhevm/hardhat-plugin`, a separate API)
- `templates/frontend-snippet.ts` — copy-pasteable version of the above
