# FHEVM architecture — what an agent needs to know

This file is a 5-minute mental model. It is not a cryptography tutorial. The goal is to give you enough context to make correct design decisions when generating FHEVM code.

## The one-paragraph summary

FHEVM lets Ethereum contracts compute over **encrypted integers** (`euint8`, `euint64`, `eaddress`, etc.) using Fully Homomorphic Encryption. Users encrypt inputs client-side, attach a zero-knowledge proof, and send them to a contract. The contract performs arithmetic, comparisons, and conditional selection on the ciphertexts without ever decrypting them. Specific parties — a user, the contract, or the public — can later decrypt authorized results through an asynchronous flow that involves a Key Management System (KMS) and a Gateway chain.

## The three moving parts

1. **Host chain (e.g. Ethereum Sepolia)** — where your contract and its state live. Ciphertexts are stored as `bytes32` handles in contract storage.
2. **Gateway chain** — a coprocessor chain that performs the actual FHE computation off-chain and commits results back.
3. **KMS (Key Management System)** — holds the decryption keys. Decryption requests go here (via the relayer SDK) and return re-encrypted results that only the intended recipient can open.

As a Solidity or TypeScript developer, you do not interact with the Gateway or KMS directly — you call `FHE.*` in Solidity and `instance.*` in TypeScript. But understanding that these pieces exist explains **why decryption is asynchronous**: the plaintext does not live on the host chain.

## The lifecycle of an encrypted value

```
┌─────────────┐  encrypt +proof  ┌──────────────────┐
│  Client     ├─────────────────►│  Your contract    │
│ (Relayer    │                  │  (host chain)     │
│  SDK)       │                  │                   │
└─────────────┘                  │  FHE.fromExternal │
                                 │  FHE.add, .select │
                                 │  FHE.allow*       │
                                 └──────┬────────────┘
                                        │ stored ciphertext
                                        ▼
                                 ┌──────────────────┐
                                 │  Gateway + KMS   │
                                 │  (off-host)       │
                                 └──────┬────────────┘
                                        │ re-encrypted cleartext
                                        ▼
                                 ┌──────────────────┐
                                 │  Client          │
                                 │  userDecrypt     │
                                 └──────────────────┘
```

## Four consequences that shape every design

### 1. You cannot branch on encrypted data
Solidity `if/else` and `require` need a plaintext boolean. You have none. Use `FHE.select(cond, a, b)` to choose between two encrypted values. For error handling, use a flag pattern (see `references/11-anti-patterns.md`).

### 2. Decryption is asynchronous
There is **no** synchronous "decrypt and read" inside a transaction. A contract cannot `revert` based on a decrypted value in the same tx. Designs that need to branch on a revealed value use a two-step pattern: request → callback / off-chain proof submission.

### 3. FHE operations cost real money
Each `FHE.add`, `FHE.mul`, `FHE.select` is **orders of magnitude more expensive** than a native opcode. Minimize the number of ciphertext operations. Prefer smaller types (`euint8` over `euint256` when possible). Do not loop `FHE.add` when a single multiplication would do.

### 4. Possession ≠ permission
Holding a ciphertext does **not** mean you can use it. The Access Control List (ACL) tracks, per ciphertext, which addresses (users and contracts) are allowed to operate on or decrypt it. Without an explicit `FHE.allow*` call, your contract cannot even read back its own state in the next transaction. This is the most surprising rule for developers new to FHEVM.

## Cost model rule of thumb

| Operation class | Relative cost |
|---|---|
| Native Solidity (add, mul, sload) | 1x |
| `FHE.add`, `FHE.sub`, `FHE.eq` on `euint32` | ~10,000x |
| `FHE.mul`, `FHE.div`-by-plaintext on `euint64` | ~50,000x |
| `FHE.select` | moderate, but creates a new ciphertext each call |

Treat FHE ops as scarce. Batch, reuse handles, and never compute something inside a loop that could be computed once.

## What to read next

- `references/02-types-and-operations.md` — the actual type and op catalog
- `references/03-acl.md` — the permission system (you will need this immediately)
- `references/11-anti-patterns.md` — the list of mistakes this architecture produces

## External deep dives (for humans, not for the agent)

- Zama Protocol litepaper: `https://docs.zama.org/protocol/zama-protocol-litepaper`
- FHE on blockchain section of the docs (architecture internals)
