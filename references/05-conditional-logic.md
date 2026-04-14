# Conditional logic, loops, and error handling on encrypted data

FHEVM removes two tools Solidity developers take for granted: **branching** (`if/else`, `require`) and **plaintext-bounded looping over encrypted conditions**. This file shows the replacement patterns.

## The core constraint

The EVM cannot observe an encrypted boolean. So:

```solidity
// ❌ DOES NOT WORK — will not compile
if (FHE.gt(a, b)) {
    winner = a;
}

// ❌ DOES NOT WORK — will not compile
require(FHE.gt(balance, amount), "insufficient");
```

## The replacement: `FHE.select`

```solidity
euint64 result = FHE.select(condition, valueIfTrue, valueIfFalse);
```

`condition` is `ebool`. Both branches run unconditionally and both produce a ciphertext; `select` picks one. This is the only branching primitive.

## Pattern: max of two values

```solidity
ebool aIsBigger = FHE.gt(a, b);
euint64 max = FHE.select(aIsBigger, a, b);
```

Or just use `FHE.max(a, b)` — same result, more efficient.

## Pattern: conditional state update

```solidity
// if (newBid > highestBid) highestBid = newBid;
ebool isHigher = FHE.gt(newBid, highestBid);
highestBid = FHE.select(isHigher, newBid, highestBid);
FHE.allowThis(highestBid);
```

Both `newBid` and the old `highestBid` are computed; `select` chooses which to keep.

## Pattern: conditional write to two mirrored fields

The sealed-bid auction pattern — update both the bid and the bidder address atomically:

```solidity
ebool isHigher = FHE.gt(newBid, highestBid);
highestBid = FHE.select(isHigher, newBid, highestBid);
winningAddress = FHE.select(isHigher, FHE.asEaddress(msg.sender), winningAddress);
FHE.allowThis(highestBid);
FHE.allowThis(winningAddress);
```

`FHE.select` works on any encrypted type, including `eaddress`.

## Pattern: conditional transfer (error-flag style)

You cannot `require(canTransfer)`. Instead: compute the condition, then use it to zero-out the failing case.

```solidity
ebool canTransfer = FHE.le(amount, balances[from]);
euint64 effectiveAmount = FHE.select(canTransfer, amount, FHE.asEuint64(0));

balances[from] = FHE.sub(balances[from], effectiveAmount);
balances[to] = FHE.add(balances[to], effectiveAmount);

FHE.allowThis(balances[from]);
FHE.allowThis(balances[to]);

// Record error for the frontend to read
_lastError[msg.sender] = FHE.select(canTransfer, NO_ERROR, INSUFFICIENT_FUNDS);
emit ErrorChanged(msg.sender);
```

The user's balance is atomically debited only if they can afford it; otherwise zero moves. The error code is stored as an encrypted value that the user can later decrypt.

### Encrypted error codes

Define them as contract constants:

```solidity
euint8 internal NO_ERROR;
euint8 internal INSUFFICIENT_FUNDS;

constructor() {
    NO_ERROR = FHE.asEuint8(0);
    INSUFFICIENT_FUNDS = FHE.asEuint8(1);
    FHE.allowThis(NO_ERROR);
    FHE.allowThis(INSUFFICIENT_FUNDS);
}

mapping(address => euint8) private _lastError;
event ErrorChanged(address indexed user);

function _setLastError(euint8 code, address user) internal {
    _lastError[user] = code;
    FHE.allowThis(code);
    FHE.allow(code, user);
    emit ErrorChanged(user);
}
```

The frontend listens for `ErrorChanged`, then calls `userDecrypt` on the handle to learn the error type.

## Pattern: loops

**Loop bounds must be plaintext.** You cannot `while (encryptedCondition)`. You can loop a plaintext number of times and accumulate with `select`:

```solidity
// Find the max of 10 encrypted bids (indices 0..9 are plaintext)
euint64 maxBid = FHE.asEuint64(0);
for (uint i = 0; i < 10; i++) {
    ebool bigger = FHE.gt(bids[i], maxBid);
    maxBid = FHE.select(bigger, bids[i], maxBid);
}
FHE.allowThis(maxBid);
```

Each iteration runs unconditionally. Gas scales linearly with the loop bound.

### When you truly need a data-dependent loop

You don't. Refactor to a plaintext upper bound and pad with `FHE.select` to ignore the tail.

## Pattern: "revert based on an encrypted condition"

You cannot, synchronously. Two options:

1. **Don't** — use the error-flag pattern above. The tx succeeds, the state doesn't change, the frontend shows the error.
2. **Async reveal** — call `FHE.makePubliclyDecryptable(cond)`, wait for the public decryption proof, then revert in a follow-up transaction that verifies the proof. See `references/06-decryption.md`.

Option 1 is almost always correct. Option 2 is reserved for cases where the revert itself needs to be on-chain evidence.

## Gas and cost awareness

Each `FHE.select` creates a new ciphertext. In a loop, each iteration allocates. Keep the loop bound as small as possible. For most real contracts, encode your logic so the number of ciphertext ops is a small constant, not a function of user inputs.

## Anti-patterns

- `if (FHE.gt(...))` — does not compile; will confuse agents copying Solidity habits.
- `require(FHE.isInitialized(x))` — **does** work because `isInitialized` returns a plaintext `bool`, not `ebool`. Don't confuse the two.
- Using `FHE.select` inside an unbounded `while` loop — no way to terminate.
- Reverting on a decrypted value in the same transaction it was requested — decryption is async.
- Forgetting to `allowThis` on the result of a `select` that's stored to state.

## What to read next

- `references/06-decryption.md` — the async reveal pattern when you really need a plaintext branch
- `references/11-anti-patterns.md` — the full list of mistakes agents make here
