# Encrypted types and operations

This is the API reference. When the agent needs to pick a type or call an operation, everything it needs should be here.

## Import

```solidity
import { FHE, ebool, euint8, euint16, euint32, euint64, euint128, euint256, eaddress, externalEuint8, externalEuint16, externalEuint32, externalEuint64, externalEuint128, externalEuint256, externalEbool, externalEaddress } from "@fhevm/solidity/lib/FHE.sol";
```

Only import the types you actually use — the rest is noise.

## Encrypted type catalog

| Type | Width | Value range | Notes |
|---|---|---|---|
| `ebool` | 1 bit | `true` / `false` | Logical ops only |
| `euint8` | 8 bits | `0 .. 2^8 - 1` | Full arithmetic |
| `euint16` | 16 bits | `0 .. 2^16 - 1` | Full arithmetic |
| `euint32` | 32 bits | `0 .. 2^32 - 1` | Full arithmetic |
| `euint64` | 64 bits | `0 .. 2^64 - 1` | Full arithmetic — used by ERC-7984 |
| `euint128` | 128 bits | `0 .. 2^128 - 1` | Full arithmetic |
| `euint160` / `eaddress` | 160 bits | Ethereum addresses | Only `eq`, `ne`, `select` |
| `euint256` | 256 bits | `0 .. 2^256 - 1` | Bitwise + comparison only (no mul/div) |

**`eaddress` is an alias for `euint160`.** Use `eaddress` in function signatures for clarity.

### How to pick a type

- Counters, flags, small enums → `euint8`
- Prices, amounts in small units → `euint32` or `euint64`
- Token balances (ERC-7984 standard) → `euint64`
- Only go above `euint64` if you actually need the range — higher bit-widths cost more gas.

## Declaring state

```solidity
contract Example is ZamaEthereumConfig {
    euint64 private balance;           // encrypted state variable
    mapping(address => euint64) private balances;  // encrypted mapping
    eaddress private owner;
}
```

## Creating encrypted values

### From a plaintext constant (trivial encryption — no privacy, useful for constants)

```solidity
euint8 zero  = FHE.asEuint8(0);
euint64 max  = FHE.asEuint64(type(uint64).max);
ebool yes    = FHE.asEbool(true);
eaddress me  = FHE.asEaddress(msg.sender);
```

Trivially encrypted values **are visible to anyone who reads the chain** — anyone can guess the plaintext since it was a literal. Use only for constants.

### From a user-supplied encrypted input

```solidity
function f(externalEuint64 encAmount, bytes calldata inputProof) external {
    euint64 amount = FHE.fromExternal(encAmount, inputProof);
    // use `amount` here
}
```

See `references/04-inputs-and-proofs.md` for the full input flow.

### Checking initialization

```solidity
require(FHE.isInitialized(value), "uninitialized");
```

An uninitialized `euint*` reads as the default handle. Always check before using a state variable that might not have been written yet.

## Operation catalog

Full table. All operations live on the `FHE` library.

### Arithmetic

| Op | Signature | Notes |
|---|---|---|
| `FHE.add(a, b)` | `(euintN, euintN) → euintN` | Unchecked — wraps on overflow |
| `FHE.sub(a, b)` | `(euintN, euintN) → euintN` | Unchecked — wraps on underflow |
| `FHE.mul(a, b)` | `(euintN, euintN) → euintN` | Expensive — prefer plaintext factor where possible |
| `FHE.div(a, b)` | `(euintN, uintN) → euintN` | **RHS must be plaintext** |
| `FHE.rem(a, b)` | `(euintN, uintN) → euintN` | **RHS must be plaintext** |
| `FHE.neg(a)` | `(euintN) → euintN` | Two's complement negation |
| `FHE.min(a, b)` | `(euintN, euintN) → euintN` | |
| `FHE.max(a, b)` | `(euintN, euintN) → euintN` | |

**Overflow semantics:** arithmetic is unchecked and wraps. This is a cryptographic requirement — checked math would leak information about the operands. If you need bounds, check explicitly with `FHE.le` and `FHE.select`.

### Bitwise

| Op | Signature | Notes |
|---|---|---|
| `FHE.and(a, b)` | `(euintN, euintN) → euintN` | Also for `ebool` |
| `FHE.or(a, b)` | `(euintN, euintN) → euintN` | Also for `ebool` |
| `FHE.xor(a, b)` | `(euintN, euintN) → euintN` | Also for `ebool` |
| `FHE.not(a)` | `(euintN) → euintN` | Also for `ebool` |
| `FHE.shl(a, b)` | `(euintN, uint8 \| euint8) → euintN` | RHS taken modulo bit-width |
| `FHE.shr(a, b)` | `(euintN, uint8 \| euint8) → euintN` | RHS taken modulo bit-width |
| `FHE.rotl(a, b)` | `(euintN, uint8 \| euint8) → euintN` | |
| `FHE.rotr(a, b)` | `(euintN, uint8 \| euint8) → euintN` | |

Shift amounts accept either a plaintext `uint8` or an encrypted `euint8`.

### Comparison (return `ebool`)

| Op | Meaning |
|---|---|
| `FHE.eq(a, b)` | `a == b` |
| `FHE.ne(a, b)` | `a != b` |
| `FHE.lt(a, b)` | `a < b` |
| `FHE.le(a, b)` | `a <= b` |
| `FHE.gt(a, b)` | `a > b` |
| `FHE.ge(a, b)` | `a >= b` |

All comparisons work on any `euintN`. On `eaddress`, only `eq` and `ne` are available.

### Ternary selection

```solidity
euint64 result = FHE.select(condition, valueIfTrue, valueIfFalse);
```

`condition` is an `ebool`. `valueIfTrue` and `valueIfFalse` must be the same encrypted type. This is **the only way to branch on encrypted data.** See `references/05-conditional-logic.md` for patterns.

### Randomness

```solidity
euint8  r1 = FHE.randEuint8();           // unbounded [0, 255]
euint32 r2 = FHE.randEuint32();          // unbounded
euint8  r3 = FHE.randEuint8(32);         // bounded [0, 31] — upper bound MUST be power of 2
ebool   rb = FHE.randEbool();
```

**Two rules you cannot break:**
1. Bounded upper bound must be a power of two.
2. `rand*` **cannot be called from `eth_call`** — only from real transactions. The chain needs to mutate its PRNG state.

## Casting between encrypted types

```solidity
euint64 big = FHE.asEuint64(small);   // widen from euint32
euint8 tiny = FHE.asEuint8(big);      // narrow — truncates high bits
```

Narrowing truncates, mirroring native Solidity cast behavior.

## Worked example: increment-if-under-max

```solidity
function increment(externalEuint32 encDelta, bytes calldata inputProof) external {
    euint32 delta = FHE.fromExternal(encDelta, inputProof);

    euint32 newCounter = FHE.add(counter, delta);
    ebool underflowed = FHE.lt(newCounter, counter);     // wrap detection
    counter = FHE.select(underflowed, counter, newCounter);

    FHE.allowThis(counter);                              // critical — see 03-acl.md
    FHE.allow(counter, msg.sender);                      // let the caller decrypt later
}
```

This pattern (compute → detect failure → `select` the safe result → `allow`) is the FHEVM replacement for `require(!overflow)`.

## What to read next

- `references/03-acl.md` — the `FHE.allow*` calls in the example above are not optional
- `references/05-conditional-logic.md` — deeper patterns using `FHE.select`
