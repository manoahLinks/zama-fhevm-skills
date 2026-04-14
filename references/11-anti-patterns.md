# Anti-patterns and common mistakes

This file is the highest-leverage reference in the skill. If you read nothing else before writing FHEVM code, read this. Every item here is a mistake that compiles cleanly, deploys cleanly, and then silently breaks.

## 🔴 Critical: forgetting `FHE.allowThis`

**The #1 FHEVM bug.**

```solidity
// ❌ BROKEN
function deposit(externalEuint64 encAmount, bytes calldata proof) external {
    euint64 amount = FHE.fromExternal(encAmount, proof);
    balances[msg.sender] = FHE.add(balances[msg.sender], amount);
    // forgot FHE.allowThis(balances[msg.sender])
}
```

The **next** time any function touches `balances[msg.sender]`, the contract no longer has ACL access to its own state variable. `FHE.add` silently produces a zero-handle. The user's balance appears to reset.

**Fix:**
```solidity
balances[msg.sender] = FHE.add(balances[msg.sender], amount);
FHE.allowThis(balances[msg.sender]);   // required
```

**Rule:** any ciphertext you write to storage that will be read in a later transaction needs `FHE.allowThis`. Every time.

## 🔴 Critical: forgetting `FHE.allow(ct, user)` before user decryption

```solidity
// ❌ BROKEN
function deposit(externalEuint64 encAmount, bytes calldata proof) external {
    euint64 amount = FHE.fromExternal(encAmount, proof);
    balances[msg.sender] = FHE.add(balances[msg.sender], amount);
    FHE.allowThis(balances[msg.sender]);
    // forgot FHE.allow(balances[msg.sender], msg.sender)
}
```

The frontend calls `userDecrypt` on the balance handle and gets a 401 / auth error. The user cannot see their balance.

**Fix:**
```solidity
FHE.allowThis(balances[msg.sender]);
FHE.allow(balances[msg.sender], msg.sender);
```

## 🔴 Critical: `if/else` on encrypted values

```solidity
// ❌ DOES NOT COMPILE
if (FHE.gt(a, b)) {
    winner = a;
}
```

```solidity
// ❌ DOES NOT COMPILE
require(FHE.gt(balance, amount), "insufficient");
```

**Fix:** `FHE.select`.
```solidity
winner = FHE.select(FHE.gt(a, b), a, b);
```

For `require`-like failures, use the error-flag pattern (`references/05-conditional-logic.md`).

## 🔴 Critical: returning `euint*` from a `view` function

```solidity
// ❌ MISLEADING — caller gets a handle, not a plaintext
function getBalance() external view returns (euint64) {
    return balances[msg.sender];
}
```

The return value is a `bytes32` handle. The caller still has to run the entire user-decryption flow. This is fine if that's what you mean, but don't expect `.getBalance()` in ethers to return a number.

## 🔴 Critical: missing `FHE.fromExternal`

```solidity
// ❌ DOES NOT COMPILE
function f(externalEuint64 encAmount, bytes calldata proof) external {
    balances[msg.sender] = FHE.add(balances[msg.sender], encAmount);
    //                                                    ^^^^^^^^^
    // cannot operate on externalEuint64 directly
}
```

**Fix:** always unwrap first.
```solidity
euint64 amount = FHE.fromExternal(encAmount, proof);
balances[msg.sender] = FHE.add(balances[msg.sender], amount);
```

## 🔴 Critical: missing config base

```solidity
// ❌ RUNTIME FAILURE
contract Broken {
    euint64 value;
    function set(externalEuint64 encValue, bytes calldata proof) external {
        value = FHE.fromExternal(encValue, proof);
        FHE.allowThis(value);
    }
}
```

Compiles, deploys, reverts on the first FHE call because no coprocessor address is set.

**Fix:**
```solidity
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
contract Fixed is ZamaEthereumConfig { ... }
```

There is only ONE Solidity config base — `ZamaEthereumConfig`. It handles mainnet, Sepolia, and localhost via `block.chainid`. `SepoliaConfig` is a TypeScript-only export from the Relayer SDK; it does not exist in Solidity.

## 🔴 Critical: dividing two ciphertexts

```solidity
// ❌ NOT SUPPORTED
euint64 result = FHE.div(a, b);   // both encrypted
```

`FHE.div` and `FHE.rem` require a plaintext RHS.

**Fix:** make the divisor plaintext, or redesign to avoid the division.

## 🟡 Common: expecting `require` to work on decryption results

```solidity
// ❌ Decryption is async — this pattern does not exist
function claim() external {
    uint64 amount = FHE.decrypt(balances[msg.sender]);   // no such function
    require(amount > 0, "nothing to claim");
    // ...
}
```

**Fix:** use the public-decryption two-step pattern (`references/06-decryption.md`) or the error-flag pattern if you can avoid the reveal.

## 🟡 Common: reordering handles in public decryption

```solidity
// Contract has:
bytes32[] memory cts = new bytes32[](2);
cts[0] = FHE.toBytes32(winner);
cts[1] = FHE.toBytes32(amount);

// Client calls:
instance.publicDecrypt([amountHandle, winnerHandle]);   // ❌ WRONG ORDER
```

The decryption proof is cryptographically bound to the exact handle order. Swapping means the proof won't verify.

**Fix:** match the order in the contract's `cts` array exactly.

## 🟡 Common: using `fhevmjs` instead of `@zama-fhe/relayer-sdk`

`fhevmjs` is deprecated. Use `@zama-fhe/relayer-sdk`.

## 🟡 Common: reusing encrypted inputs across transactions

```typescript
const enc = await input.encrypt();
await contract.tx1(enc.handles[0], enc.inputProof);
await contract.tx2(enc.handles[0], enc.inputProof);   // ❌ proof is single-use
```

**Fix:** re-encrypt per transaction.

## 🟡 Common: binding input to the wrong addresses

```typescript
// User is bob, but input was built for alice
const input = instance.createEncryptedInput(contractAddress, alice.address);
input.add64(100n);
const enc = await input.encrypt();
await contract.connect(bob).deposit(enc.handles[0], enc.inputProof);
// ❌ FHE.fromExternal reverts — proof was bound to alice
```

**Fix:** always pass the signer's address that will actually send the tx.

## 🟡 Common: mocking FHE in tests

```typescript
// ❌ Don't do this
const mockFHE = { add: (a, b) => a + b };
```

The `@fhevm/hardhat-plugin` already provides a real encrypted pipeline in tests. Mocking defeats the entire point — you end up testing plain Solidity, which hides every ACL and fromExternal bug.

## 🟡 Common: loops over encrypted bounds

```solidity
// ❌ Compiler rejects
while (FHE.gt(counter, zero)) {
    counter = FHE.sub(counter, one);
}
```

**Fix:** use a plaintext bound and `select` to mask the tail.

## 🟡 Common: overflowing `euint64` in ERC-7984

Balances are `euint64`. If you mint near the max and then try to transfer to an account that already has a large balance, you silently wrap. There is no `require` to catch it.

**Fix:** before any add, check with `FHE.le(currentBalance, maxMinusAmount)` and use `select` to zero out overflowing transfers. Design token economies to stay well below `2^64 - 1`.

## 🟡 Common: using `FHE.asEuintX(literal)` and expecting privacy

```solidity
euint64 secret = FHE.asEuint64(42);   // ❌ not actually secret
```

Trivially encrypted literals are visible on-chain to anyone reading calldata. Use `FHE.asEuint*` only for non-secret constants (zero, error codes, bounds).

## 🟡 Common: forgetting `FHE.randEuint*` cannot run in `eth_call`

Simulated calls (e.g., dry-runs in ethers) silently fail on `rand*` functions. Only real transactions work.

**Fix:** don't `staticCall` functions that use randomness. Or expose a separate path that doesn't.

## 🟢 Low-severity but annoying

- **Using Node 21 or 23:** downgrade to 20 or 22.
- **Importing from `fhevmjs`:** update to `@zama-fhe/relayer-sdk`.
- **Creating a new relayer SDK instance on every component render:** move to a provider or module singleton.
- **Skipping `npm install` after cloning the template:** pinned versions exist for a reason.
- **Upgrading `@fhevm/solidity` without re-running tests:** breaking changes happen.
- **Forgetting to `vars set MNEMONIC` and `INFURA_API_KEY` before deploying to Sepolia.**

## Diagnostic checklist

When an FHEVM contract "doesn't work", run through this in order:

1. Does the contract inherit `ZamaEthereumConfig`?
2. Is every encrypted input unwrapped with `FHE.fromExternal(handle, proof)`?
3. Is every stored ciphertext followed by `FHE.allowThis(...)`?
4. If the user will decrypt a value, does the contract call `FHE.allow(ct, user)`?
5. Are you trying to `if`/`require` on an `ebool`? Switch to `FHE.select`.
6. In tests, is `fhevm.createEncryptedInput` called with the actual `msg.sender` of the tx?
7. In public decryption, does the contract's `cts` array match the client's `publicDecrypt` handle order exactly?
8. For ERC-7984, is the amount in the `euint64` range and overload signature disambiguated?

90% of FHEVM bugs resolve at step 3 or 4.

## What to read next

- Any specific reference listed above — this file is meant to be read top-to-bottom once and then referenced.
