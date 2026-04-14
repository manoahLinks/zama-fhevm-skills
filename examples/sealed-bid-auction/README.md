# Sealed-bid auction — complete walkthrough

A first-price sealed-bid auction where bids stay encrypted during the bidding window. After the auction ends, the winning address and winning bid are revealed via **public decryption** and the contract uses the resulting proof to transfer a prize to the winner.

This is the canonical FHEVM example for the **two-step public decryption pattern**. The pattern is:

1. Bidders submit encrypted bids. The contract uses `FHE.select` to track the current highest bid and bidder without revealing either.
2. After the auction ends, `reveal()` marks the winner and winning bid as publicly decryptable.
3. Off-chain, a client calls `instance.publicDecrypt(...)` and gets the plaintexts plus a proof.
4. The plaintexts and proof are submitted back to `resolve(...)`, which calls `FHE.checkSignatures` to verify, and then acts on the revealed data.

## What the agent should learn

- Updating two related encrypted state variables atomically with paired `FHE.select` calls.
- The exact handle-order requirement for `FHE.checkSignatures` / `publicDecrypt`.
- How to use `FHE.isInitialized` to bootstrap the first bid.
- How to combine time gating (plaintext) with encrypted state (the bid).

## Files

- `SealedBidAuction.sol` — contract
- `SealedBidAuction.test.ts` — tests covering bid, reveal, resolve, non-winner refund
- `client.ts` — end-to-end client: place bid, wait, read reveal, submit resolution

## The trickiest part: handle order

The contract stores the reveal handles in a specific order inside `resolve()`:

```solidity
bytes32[] memory cts = new bytes32[](2);
cts[0] = FHE.toBytes32(_winningAddress);
cts[1] = FHE.toBytes32(_winningBid);
```

The client **must** call `publicDecrypt` with the same order:

```typescript
await instance.publicDecrypt([winningAddressHandle, winningBidHandle]);
```

Swapping either side invalidates the proof. This is the source of most "resolve fails but reveal succeeded" bugs.
