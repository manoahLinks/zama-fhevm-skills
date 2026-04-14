# Encrypted inputs and input proofs

This is how a user gets encrypted data from their wallet into your contract.

## The mental model

The user cannot just submit a ciphertext — the chain has no way to know it's well-formed or that the user actually knew the plaintext. So FHEVM requires every encrypted input to arrive with a **zero-knowledge proof of knowledge (ZKPoK)** attached, and the contract must verify it on entry by calling `FHE.fromExternal`.

A single proof can cover multiple inputs packed together. This is the common case: one `bytes inputProof` argument plus N separate handle parameters.

## The two types you'll see

- `externalEuintX` (`externalEbool`, `externalEuint64`, `externalEaddress`, etc.) — a `bytes32` handle referring to an encrypted value **inside the proof**. Not directly operable.
- `euintX` — the unwrapped, verified, operable type. Produced by `FHE.fromExternal`.

You **must** unwrap before you can do anything with the value. Any attempt to pass `externalEuintX` to `FHE.add` or other ops will fail to compile.

## Solidity function pattern

```solidity
function bid(
    externalEuint64 encAmount,
    bytes calldata inputProof
) external {
    euint64 amount = FHE.fromExternal(encAmount, inputProof);
    // `amount` is now operable
    highestBid = FHE.select(FHE.gt(amount, highestBid), amount, highestBid);
    FHE.allowThis(highestBid);
}
```

## Multiple inputs in one proof

```solidity
function trade(
    externalEuint64 encAmount,
    externalEaddress encRecipient,
    externalEbool encIsBuy,
    bytes calldata inputProof
) external {
    euint64 amount = FHE.fromExternal(encAmount, inputProof);
    eaddress recipient = FHE.fromExternal(encRecipient, inputProof);
    ebool isBuy = FHE.fromExternal(encIsBuy, inputProof);
    // ...
}
```

All three `externalXxx` handles reference values packed into the same `inputProof` blob. The single `inputProof` covers all of them.

**Handle order does not need to match TypeScript input order.** The TypeScript side adds values in one order; the Solidity side can unwrap them in a different order. The handle itself carries enough information.

## Client side (Hardhat test / frontend — same API)

```typescript
import { fhevm } from "hardhat";   // or the relayer SDK instance in a frontend

const input = fhevm.createEncryptedInput(
    contractAddress,   // the contract that will receive the input
    userAddress        // the msg.sender that will submit the tx
);

input.add64(1_000_000n);        // index 0
input.addAddress("0xabc...");   // index 1
input.addBool(true);            // index 2

const enc = await input.encrypt();

// enc.handles is bytes32[] of length N (one per added value)
// enc.inputProof is bytes
```

### Supported add methods

| Method | Accepts |
|---|---|
| `add8(v: bigint)` | `0 .. 2^8 - 1` |
| `add16(v: bigint)` | `0 .. 2^16 - 1` |
| `add32(v: bigint)` | `0 .. 2^32 - 1` |
| `add64(v: bigint)` | `0 .. 2^64 - 1` |
| `add128(v: bigint)` | `0 .. 2^128 - 1` |
| `add256(v: bigint)` | `0 .. 2^256 - 1` |
| `addBool(v: boolean)` | `true` / `false` |
| `addAddress(v: string)` | `0x...` |

### Sending the transaction

```typescript
await contract.connect(user).bid(enc.handles[0], enc.inputProof);
```

For multiple inputs:

```typescript
await contract.connect(user).trade(
    enc.handles[0],     // matches externalEuint64 encAmount
    enc.handles[1],     // matches externalEaddress encRecipient
    enc.handles[2],     // matches externalEbool encIsBuy
    enc.inputProof
);
```

## Frontend (Relayer SDK) version

Same API, different source:

```typescript
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";

const instance = await createInstance({
    ...SepoliaConfig,
    network: window.ethereum
});

const input = instance.createEncryptedInput(contractAddress, userAddress);
input.add64(BigInt(amount));
const enc = await input.encrypt();

await contract.bid(enc.handles[0], enc.inputProof);
```

The `input.encrypt()` call performs local encryption, computes the ZKPoK, and uploads the ciphertext blob via the relayer in one step.

## Binding: `contractAddress` and `userAddress` are load-bearing

`createEncryptedInput(contractAddress, userAddress)` **binds the proof** to those two addresses. The resulting inputs can only be consumed by that contract when submitted by that user. Do not reuse handles across contracts or users.

If the contract address changes (e.g., after a redeploy), you must re-encrypt. You cannot port handles.

## Anti-patterns

- **Forgetting `FHE.fromExternal`**: passing `externalEuint64` directly to `FHE.add` fails to compile. Always unwrap first.
- **Reusing handles across contracts**: the proof is bound to a specific contract address. A different contract will reject it.
- **Encrypting with the wrong user address**: if `createEncryptedInput` is called with Alice's address but Bob sends the tx, `fromExternal` reverts.
- **Splitting inputs across multiple `.encrypt()` calls when they could share a proof**: wastes gas. Pack all inputs for one tx into one encrypt call.
- **Passing a stale `inputProof` to a second transaction**: proofs are single-use within the context of a specific contract call.

## Worked example: deposit with multiple fields

```solidity
function deposit(
    externalEuint64 encAmount,
    externalEuint8 encCategory,
    bytes calldata inputProof
) external {
    euint64 amount = FHE.fromExternal(encAmount, inputProof);
    euint8 category = FHE.fromExternal(encCategory, inputProof);

    balances[msg.sender] = FHE.add(balances[msg.sender], amount);
    categories[msg.sender] = category;

    FHE.allowThis(balances[msg.sender]);
    FHE.allowThis(categories[msg.sender]);
    FHE.allow(balances[msg.sender], msg.sender);
    FHE.allow(categories[msg.sender], msg.sender);
}
```

```typescript
const input = instance.createEncryptedInput(contractAddress, user.address);
input.add64(1_000n);
input.add8(3n);
const enc = await input.encrypt();
await contract.connect(user).deposit(enc.handles[0], enc.handles[1], enc.inputProof);
```

## What to read next

- `references/05-conditional-logic.md` — how to actually do something with the inputs
- `references/03-acl.md` — the `FHE.allow*` calls are mandatory, not optional
