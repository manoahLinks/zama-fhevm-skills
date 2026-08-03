# Decryption — user, public, and delegated

Decryption is **asynchronous**. A contract cannot read a plaintext in the same transaction that computed it. This file covers the three patterns FHEVM supports.

## Three kinds of decryption

| Kind | Who reveals | Where | When to use |
|---|---|---|---|
| **User decryption** | One specific user (to themselves) | Off-chain, via relayer | "Show the user their encrypted balance" |
| **Public decryption** | Everyone | On-chain verification + off-chain proof | "Reveal auction winner" |
| **Delegated decryption** | Contract A delegates rights to contract B | On-chain | Cross-contract workflows |

## Part A — User decryption (EIP-712 flow)

### Prerequisite

The contract must have granted the user access to the ciphertext:

```solidity
FHE.allow(balances[msg.sender], msg.sender);
```

Without this, the relayer refuses the decryption request.

### The client call

With `@zama-fhe/sdk` this is a single call. The keypair generation, EIP-712 construction, wallet signature, and permit caching that the legacy SDK exposed as six manual steps are all internal now.

```typescript
// sdk built once — see references/07-frontend-sdk.md
const values = await sdk.decryption.decryptValues([
    { encryptedValue: ciphertextHandle, contractAddress }
]);

const plaintext = values[ciphertextHandle];
console.log("Decrypted value:", plaintext);
```

The user is prompted for one wallet signature the first time. That permit is cached in the SDK's `storage`, so subsequent decryptions for the same contract do not re-prompt.

Batch multiple handles in one round-trip:

```typescript
const values = await sdk.decryption.decryptValues([
    { encryptedValue: balanceHandle, contractAddress },
    { encryptedValue: limitHandle,   contractAddress }
]);
```

### Hard constraints

- **Total ciphertext width per request ≤ 2048 bits.** Across all handles in one call. Batch larger requests into multiple calls.
- **The result is a record keyed by handle**, not an array. Index it with the handle you passed in.
- **Permits are time-bound.** The SDK re-prompts for a signature when the cached permit expires; `TransportKeyPairExpiredError` means the cached keypair aged out.
- **Handles must be readable by the user.** If the contract forgot `FHE.allow(ct, userAddress)`, the call rejects with `NotEntitledError` — no amount of signing fixes it.
- **A signer is required.** Without one you get `SignerNotConfiguredError`.

### Delegated decryption

To let one address decrypt on behalf of another, grant it on-chain and use the delegated variant:

```typescript
await sdk.delegations.delegate({ delegate: operatorAddress, contractAddress });

const values = await sdk.decryption.delegatedDecryptValues(
    [{ encryptedValue: handle, contractAddress }],
    delegatorAddress
);
```

### In Hardhat tests — much simpler

The Hardhat plugin provides a one-line helper that internally handles the EIP-712 flow:

```typescript
import { fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

const handle = await contract.balances(alice.address);
const plaintext = await fhevm.userDecryptEuint(
    FhevmType.euint64,
    handle,
    contractAddress,
    alice
);
```

Variants: `userDecryptEbool`, `userDecryptEaddress`. Use these in tests; use the full flow above only in real frontends.

## Part B — Public decryption

Use this when **anyone** should be able to see the plaintext: auction winners, lottery outcomes, revealed game state.

### Step 1 — Contract makes the value publicly decryptable

```solidity
function revealWinner() external onlyAfterEnd {
    FHE.makePubliclyDecryptable(winningAddress);
    FHE.makePubliclyDecryptable(winningBid);
}
```

This marks the ciphertext as open. It does **not** produce a plaintext on-chain — the plaintext still lives off-chain until someone requests it.

### Step 2 — Off-chain client decrypts via relayer

```typescript
const result = await sdk.decryption.decryptPublicValues([
    winningAddressHandle,
    winningBidHandle
]);

const winner = result.values[winningAddressHandle];
const bid = result.values[winningBidHandle];
const decryptionProof = result.decryptionProof;
```

The relayer returns the plaintext values **and** a cryptographic proof that the decryption is correct. `decryptPublicValues` needs no signer — public values are open to anyone.

The result is structured: clear values under `result.values` (keyed by handle) and the proof under `result.decryptionProof`. The legacy Relayer SDK varied this field name across releases and needed a defensive extractor; that is no longer necessary.

### Step 3 — Contract verifies and acts on the plaintext

The decrypted values are submitted back to the contract along with the proof. The contract calls `FHE.checkSignatures` to verify:

```solidity
function resolveAuction(
    address claimedWinner,
    uint64 claimedBid,
    bytes calldata decryptionProof
) external {
    bytes32[] memory cts = new bytes32[](2);
    cts[0] = FHE.toBytes32(winningAddress);
    cts[1] = FHE.toBytes32(winningBid);

    bytes memory cleartexts = abi.encode(claimedWinner, claimedBid);

    // Reverts if the proof doesn't match
    FHE.checkSignatures(cts, cleartexts, decryptionProof);

    // Now we can act on the revealed plaintext
    _transferNftTo(claimedWinner);
    emit AuctionResolved(claimedWinner, claimedBid);
}
```

### Critical: handle order matters

**The proof is cryptographically bound to the exact order of handles in the array.** `[winningAddress, winningBid]` is not interchangeable with `[winningBid, winningAddress]`. If you change the order in one place, change it in both — and re-request the proof.

### Why the handshake?

The contract needs to believe the submitted plaintext is actually the decryption of the ciphertext. It can't decrypt itself, so it delegates to the relayer (which has KMS access) and verifies the proof. This prevents anyone from submitting fake plaintexts.

## Part C — Delegated decryption

A contract can delegate decryption rights to another contract using `allow` in the normal way:

```solidity
FHE.allow(someCiphertext, address(otherContract));
```

`otherContract` can then make its own user-decryption or public-decryption flows happen on that handle. Use when one contract holds the data but another contract orchestrates the reveal.

For user-to-user delegation, `@zama-fhe/sdk` exposes it as a first-class namespace — `sdk.delegations.delegate(...)` to grant, then `sdk.decryption.delegatedDecryptValues(...)` to use it. See the user-decryption section above and `references/07-frontend-sdk.md`.

## Anti-patterns

- **Returning `euint64` from a `view` function expecting a plaintext.** `view` returns the handle (a `bytes32`). The caller must separately run a decryption flow.
- **Requesting decryption synchronously during a transaction.** Not supported. The reveal is always a separate step.
- **Forgetting `FHE.allow(ct, userAddress)` before user decryption.** Most common failure mode after handle mismatch.
- **Reordering handles between the contract's `cts` array and the client's `decryptPublicValues` call.** Proof won't verify.
- **Re-using a decryption proof across contracts.** Each proof is bound to a specific handle set and contract context.
- **Attempting to decrypt more than 2048 bits of ciphertexts in a single user-decryption call.** Split into multiple calls.

## Worked example — sealed-bid auction reveal (shortened)

```solidity
// During bidding (tx 1..N)
function bid(externalEuint64 encBid, bytes calldata proof) external onlyBeforeEnd {
    euint64 newBid = FHE.fromExternal(encBid, proof);
    ebool higher = FHE.gt(newBid, highestBid);
    highestBid = FHE.select(higher, newBid, highestBid);
    winningAddress = FHE.select(higher, FHE.asEaddress(msg.sender), winningAddress);
    FHE.allowThis(highestBid);
    FHE.allowThis(winningAddress);
}

// End of auction (tx N+1)
function reveal() external onlyAfterEnd {
    FHE.makePubliclyDecryptable(winningAddress);
    FHE.makePubliclyDecryptable(highestBid);
}

// Off-chain resolve (tx N+2)
function resolve(address winner, uint64 bid, bytes calldata decProof) external {
    bytes32[] memory cts = new bytes32[](2);
    cts[0] = FHE.toBytes32(winningAddress);
    cts[1] = FHE.toBytes32(highestBid);
    FHE.checkSignatures(cts, abi.encode(winner, bid), decProof);
    _sendPrize(winner);
}
```

## What to read next

- `references/07-frontend-sdk.md` — the client side of all this
- `examples/sealed-bid-auction/` — a full working version of the reveal pattern
