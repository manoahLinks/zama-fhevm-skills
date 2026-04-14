# Access Control List (ACL) — the permission system

**The one rule you must internalize:** holding a ciphertext handle is not enough. Every ciphertext has an ACL that lists exactly which addresses (user wallets and contracts) may operate on it or decrypt it. Without explicit permission, even the contract that just computed a value cannot read it back in the next transaction.

Forgetting to call `FHE.allow*` is the #1 FHEVM bug. The contract compiles, the transaction succeeds, and then everything silently breaks later.

## The three allow functions

### `FHE.allowThis(ct)`

Grants **the current contract** permanent access to a ciphertext. Use this whenever you store a ciphertext in contract storage that you plan to read back in a later transaction.

```solidity
balance = FHE.add(balance, amount);
FHE.allowThis(balance);   // REQUIRED or the next tx cannot use `balance`
```

This is shorthand for `FHE.allow(ct, address(this))`. Use the shorthand.

### `FHE.allow(ct, address)`

Grants a specific address (user or another contract) **permanent** access. Stored on-chain in the ACL contract. Costs real gas. Use for:

- Letting a user decrypt their own balance: `FHE.allow(balances[msg.sender], msg.sender);`
- Giving a helper contract long-term access to a value you'll pass to it repeatedly.

### `FHE.allowTransient(ct, address)`

Grants access that lasts **only until the current transaction ends**. Uses EIP-1153 transient storage, so it's cheap. Use for:

- Passing a ciphertext to another contract in a single call where the callee doesn't need it afterwards.
- Temporary computations inside a multi-contract interaction.

```solidity
FHE.allowTransient(amount, address(otherContract));
otherContract.doSomething(amount);   // otherContract can read `amount` this tx
// after this tx, otherContract loses access
```

## Permission checks inside the contract

### `FHE.isSenderAllowed(ct)` returns `bool`

Checks whether `msg.sender` is on the ACL for a ciphertext. Typical use: a function that lets a user operate on a ciphertext only if they previously had access granted.

```solidity
require(FHE.isSenderAllowed(balances[user]), "not allowed");
```

### `FHE.isAllowed(ct, address)` returns `bool`

Same, but checks an arbitrary address.

## The decision table

Use this to pick the right function every time.

| Situation | Function |
|---|---|
| You just wrote a ciphertext to storage, contract will read it next tx | `FHE.allowThis(ct)` |
| A user should be able to decrypt their own data client-side | `FHE.allow(ct, userAddress)` |
| You're passing a ciphertext to another contract for one-off use | `FHE.allowTransient(ct, address(otherContract))` |
| Another contract needs persistent access across many txs | `FHE.allow(ct, address(otherContract))` |

## Pattern: user writes, then user reads

```solidity
function deposit(externalEuint64 encAmount, bytes calldata proof) external {
    euint64 amount = FHE.fromExternal(encAmount, proof);
    balances[msg.sender] = FHE.add(balances[msg.sender], amount);

    FHE.allowThis(balances[msg.sender]);      // contract can use next tx
    FHE.allow(balances[msg.sender], msg.sender); // user can decrypt client-side
}
```

Both calls are required. Without `allowThis`, the next `deposit` will fail on `FHE.add` because the contract has lost access to its own state. Without `allow`, the user cannot call `userDecrypt` from the frontend.

## Pattern: passing a ciphertext to a helper contract for one tx

```solidity
function withdraw(externalEuint64 encAmount, bytes calldata proof) external {
    euint64 amount = FHE.fromExternal(encAmount, proof);
    FHE.allowTransient(amount, address(token));
    token.confidentialTransferFrom(msg.sender, address(this), amount, "");
}
```

Transient is the right choice because `token` only needs the value for the duration of this call.

## Pattern: public decryption requires `makePubliclyDecryptable`

When you want **anyone** to be able to decrypt a value (e.g., an auction winner after the auction ends), that is not an ACL grant — it's a separate call:

```solidity
FHE.makePubliclyDecryptable(winningBid);
```

See `references/06-decryption.md` for the full public decryption flow. `allow` / `allowThis` are for computation and targeted decryption; `makePubliclyDecryptable` is for open disclosure.

## Reorg safety

Transient allowances live in EIP-1153 transient storage, which is cleared at the end of each transaction. Permanent allowances (`allow`, `allowThis`) are written to the ACL contract's storage, so they survive reorgs normally.

**Do not rely on cross-transaction state from transient allowances.** If you need a value to be usable across transactions, use a permanent allow.

## Worked examples

### Letting a user decrypt their encrypted balance

```solidity
function getMyBalance() external {
    FHE.allow(balances[msg.sender], msg.sender);
}
```

After this, the user's frontend can call `instance.userDecrypt(...)` on the handle returned by `balances[msg.sender]`.

### Restricting transfers to addresses the sender has previously been given access to

```solidity
function transfer(address to, euint64 amount) external {
    require(FHE.isSenderAllowed(amount), "no access to amount");
    balances[msg.sender] = FHE.sub(balances[msg.sender], amount);
    balances[to] = FHE.add(balances[to], amount);
    FHE.allowThis(balances[msg.sender]);
    FHE.allowThis(balances[to]);
}
```

## Anti-patterns

- **Writing to storage and not calling `allowThis`**: the contract loses access to its own state next tx.
- **Granting `allow` when `allowTransient` would do**: wastes gas on permanent storage.
- **Granting `allowTransient` when you need cross-tx access**: the access expires and the next tx fails.
- **Forgetting to `allow(ct, user)` before the user tries to decrypt**: the relayer SDK call returns an authorization error.
- **Using `makePubliclyDecryptable` when you meant `allow`**: exposes data to the entire public when you meant one user.

## What to read next

- `references/06-decryption.md` — how `allow` interacts with the user decryption flow
- `references/11-anti-patterns.md` — the "forgot allowThis" bug in more detail
