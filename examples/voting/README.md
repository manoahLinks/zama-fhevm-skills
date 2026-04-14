# Confidential voting — complete walkthrough

A minimal sealed-vote poll where individual votes remain encrypted forever and only the final tallies are revealed after voting ends.

## What the agent should learn from this example

1. **Binary counters with `FHE.add`** — each `Yes`/`No` vote increments an encrypted counter.
2. **Preventing double votes** with a plaintext `hasVoted` mapping (voter addresses are public; vote choices are not).
3. **Public decryption at the end** — revealing only the totals, never individual votes.
4. **ACL patterns** for a contract that holds state nobody decrypts mid-flow.

## Files

- `Voting.sol` — the contract
- `Voting.test.ts` — Hardhat tests demonstrating the full flow
- `client.ts` — frontend snippet for casting a vote

## Running it

Drop `Voting.sol` into `contracts/`, `Voting.test.ts` into `test/` of an FHEVM Hardhat project (see `references/00-setup.md`). Then:

```bash
npm run compile
npm run test
```

## Why this design

- **Votes are `euint8`.** Values are only 0 or 1 — no reason to use larger types.
- **Tallies are `euint32`.** Up to 4 billion votes. Overkill for most polls, but cheap.
- **No `require` on "did the voter already vote".** We track that in plaintext because voter addresses are not secret — only their choices are. If you wanted to hide *who voted*, you would need a commitment scheme.
- **`revealResult` calls `FHE.makePubliclyDecryptable` on both tallies.** Anyone can then fetch the plaintexts via the Relayer SDK.

## Common mistakes this example prevents

- Tries to `if (encryptedVote == 1)` → uses `FHE.select` instead.
- Returns `euint32` from a `view` expecting a number → the agent learns to decrypt client-side.
- Skips `FHE.allowThis` after tally update → tallies silently reset next tx.
