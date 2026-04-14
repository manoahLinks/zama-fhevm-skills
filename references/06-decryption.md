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

### The 6-step flow

```typescript
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";

const instance = await createInstance({
    ...SepoliaConfig,
    network: window.ethereum
});

// 1. Generate a fresh NaCl keypair for this decryption session
const keypair = instance.generateKeypair();

// 2. Pair each ciphertext handle with its contract
const handleContractPairs = [
    { handle: ciphertextHandle, contractAddress: contractAddress }
];

// 3. Build the EIP-712 authorization message
const startTimeStamp = Math.floor(Date.now() / 1000).toString();
const durationDays = "10";
const contractAddresses = [contractAddress];

const eip712 = instance.createEIP712(
    keypair.publicKey,
    contractAddresses,
    startTimeStamp,
    durationDays
);

// 4. User signs with their wallet (MetaMask etc.)
const signature = await signer.signTypedData(
    eip712.domain,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message
);

// 5. Send the decryption request to the relayer
const result = await instance.userDecrypt(
    handleContractPairs,
    keypair.privateKey,
    keypair.publicKey,
    signature.replace("0x", ""),
    contractAddresses,
    signer.address,
    startTimeStamp,
    durationDays
);

// 6. Read the result (keyed by handle)
const plaintext = result[ciphertextHandle];
console.log("Decrypted value:", plaintext);
```

### Hard constraints

- **Total ciphertext width per request ≤ 2048 bits.** Across all handles in one call. Batch larger requests into multiple calls.
- **The signature is time-bound.** `startTimeStamp` and `durationDays` define the validity window. After expiry, sign a new EIP-712 message.
- **Handles must be readable by the user.** If the contract forgot `FHE.allow(ct, userAddress)`, the call rejects with an auth error — no amount of signing fixes it.

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
const result = await instance.publicDecrypt([winningAddressHandle, winningBidHandle]);
// result is keyed by handle → plaintext
const winner = result[winningAddressHandle];
const bid = result[winningBidHandle];
```

The relayer returns the plaintext values **and** a cryptographic proof that the decryption is correct.

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

The relayer SDK also exposes a `delegateUserDecrypt` flow when the decryption is performed on behalf of another user. Consult `https://docs.zama.org/protocol/relayer-sdk-guides/fhevm-relayer/decryption/delegate-decrypt` for specifics.

## Anti-patterns

- **Returning `euint64` from a `view` function expecting a plaintext.** `view` returns the handle (a `bytes32`). The caller must separately run a decryption flow.
- **Requesting decryption synchronously during a transaction.** Not supported. The reveal is always a separate step.
- **Forgetting `FHE.allow(ct, userAddress)` before user decryption.** Most common failure mode after handle mismatch.
- **Reordering handles between the contract's `cts` array and the relayer's `publicDecrypt` call.** Proof won't verify.
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

- `references/07-frontend-relayer-sdk.md` — the client side of all this
- `examples/sealed-bid-auction/` — a full working version of the reveal pattern
