# FHEVM / Zama Protocol — Agent Skill

This skill teaches AI coding agents to build, test, and deploy **confidential smart contracts** using the Zama Protocol (FHEVM). It is tool-agnostic: Claude Code, Codex, Cursor, Windsurf, Aider, and any agent that reads `AGENTS.md` can use it.

## What FHEVM is (30-second briefing)

FHEVM lets Solidity contracts compute over **encrypted values** using Fully Homomorphic Encryption (FHE). Ciphertexts live on-chain; computation happens on them without ever decrypting. Users encrypt inputs client-side, the contract operates on the encrypted data, and authorized parties can later decrypt specific results.

Two hard consequences of this that shape every design decision:

1. **You cannot branch on encrypted values with `if/else`.** Use `FHE.select(cond, a, b)`.
2. **Decryption is asynchronous.** A contract cannot read a plaintext in the same transaction that requested it. Design for callbacks or off-chain resolution.

## When to use this skill

Trigger on any of: `FHEVM`, `Zama`, `fhEVM`, `confidential contract`, `encrypted balance`, `euint`, `ebool`, `FHE.select`, `externalEuint`, `ERC-7984`, `ERC7984`, `confidential token`, `confidentialTransfer`, `relayer SDK`, `@zama-fhe/relayer-sdk`, `@fhevm/solidity`.

## Critical rules (never violate these)

Every rule here maps to a known class of bugs. Violating any of them produces code that compiles but does not work.

1. **Never use `if (encryptedBool)` or `require(encryptedBool)`.** Use `FHE.select` for data selection; use error-flag patterns (`references/11-anti-patterns.md`) for error signaling.
2. **Always call `FHE.allowThis(ct)` after writing a ciphertext to storage** that the contract will read back in a later transaction. Forgetting this is the #1 FHEVM bug.
3. **Always call `FHE.allow(ct, userAddress)` when you want a user to be able to decrypt a value.** Possessing a ciphertext is not enough — ACL gates decryption.
4. **Never return `euint*` from a `view` function expecting the caller to read a plaintext.** `view` returns the handle (a bytes32), not the cleartext. Decryption is a separate async flow.
5. **Every encrypted input parameter must be unwrapped with `FHE.fromExternal(handle, proof)`** before use. You cannot operate on `externalEuintXX` directly.
6. **`FHE.div` and `FHE.rem` require a plaintext (non-encrypted) right-hand side.** Dividing two ciphertexts is not supported.
7. **`FHE.randEuintX(upperBound)` requires `upperBound` to be a power of 2**, and cannot be called from `eth_call` — it must run inside a real transaction.
8. **Loop bounds must be plaintext.** You cannot write `while (encryptedCond)`.
9. **Inherit from `ZamaEthereumConfig`** in every FHE contract. This single base handles mainnet (chainId 1), Sepolia (11155111), and localhost (31337) automatically. There is no separate `SepoliaConfig` in Solidity — that name only exists in the TypeScript Relayer SDK.
10. **In tests, never mock FHE.** Use the `@fhevm/hardhat-plugin` which provides real encrypted input creation and decryption helpers.
11. **Public decryption proof is bound to the exact order of handles.** `[a, b]` is not interchangeable with `[b, a]`.
12. **User decryption in a single request cannot exceed 2048 bits total** across all ciphertexts.

## Task routing table

When the user asks for something, load the matching reference file(s). References are small and focused — load only what you need.

| User intent | Load |
|---|---|
| "Set up a new FHEVM project" / init / install | `references/00-setup.md` + `templates/hardhat.config.ts` |
| "How does FHEVM work?" / architecture / what is FHE | `references/01-architecture.md` |
| Declare encrypted state, pick a type, do math on ciphertexts | `references/02-types-and-operations.md` |
| "Who can decrypt this?" / `allow` / permissions | `references/03-acl.md` |
| Accept encrypted inputs from users / frontend → contract | `references/04-inputs-and-proofs.md` |
| Branching, conditionals, loops on encrypted data | `references/05-conditional-logic.md` |
| Reveal a result to a user or to the chain | `references/06-decryption.md` |
| Build a frontend / dApp / wallet integration | `references/07-frontend-relayer-sdk.md` |
| Write Hardhat tests with encrypted inputs | `references/08-testing-hardhat.md` + `templates/hardhat-test.ts` |
| Deploy to Sepolia or mainnet | `references/09-deployment.md` |
| Confidential token / ERC-7984 / wrapping ERC-20 | `references/10-erc7984.md` + `templates/erc7984-token.sol` |
| "This error / weird behavior / why doesn't it work?" | `references/11-anti-patterns.md` |
| Full worked example: sealed-bid auction | `examples/sealed-bid-auction/` |
| Full worked example: confidential voting | `examples/voting/` |
| Full worked example: confidential token | `examples/erc7984-token/` |

## Canonical package versions

Pin to these when generating `package.json` or install commands.

| Package | Purpose | Verified version |
|---|---|---|
| `@fhevm/solidity` | Solidity library (`FHE.sol`, types, config) | 0.11.1 |
| `@fhevm/hardhat-plugin` | Hardhat integration for encrypted inputs + decryption in tests | 0.4.2 |
| `@zama-fhe/relayer-sdk` | TypeScript client SDK (frontend + Node) | 0.4.1 |
| `@openzeppelin/confidential-contracts` | ERC-7984 base contracts | 0.4.0 |

**Reference starting point:** `github.com/zama-ai/fhevm-hardhat-template` is the canonical template. Clone it, then `npm install`.
If you upgrade any package, re-run `./validate.sh` and update the pinned versions table in this file.

**Canonical example dApps:** `github.com/zama-ai/dapps` — contains blind auctions, FHE Wordle, ERC-7984 frontend, and more.

## Skill directory layout

```
.
├── AGENTS.md                         # This file
├── SKILL.md                          # Claude Code wrapper
├── .cursor/rules/fhevm.mdc           # Cursor wrapper
├── .windsurfrules                    # Windsurf wrapper
├── references/
│   ├── 00-setup.md
│   ├── 01-architecture.md
│   ├── 02-types-and-operations.md
│   ├── 03-acl.md
│   ├── 04-inputs-and-proofs.md
│   ├── 05-conditional-logic.md
│   ├── 06-decryption.md
│   ├── 07-frontend-relayer-sdk.md
│   ├── 08-testing-hardhat.md
│   ├── 09-deployment.md
│   ├── 10-erc7984.md
│   └── 11-anti-patterns.md
├── templates/
│   ├── hardhat.config.ts
│   ├── basic-contract.sol
│   ├── erc7984-token.sol
│   ├── hardhat-test.ts
│   └── frontend-snippet.ts
└── examples/
    ├── voting/
    ├── sealed-bid-auction/
    └── erc7984-token/
```

## How to use this skill effectively

1. **Always read `references/11-anti-patterns.md` before writing FHEVM code** if you have not seen it in the current session. It is the highest-leverage file.
2. **When unsure about an API, prefer `templates/` over improvising.** Templates are copy-paste working code.
3. **When building a non-trivial contract, read the closest `examples/` first** to ground your patterns.
4. **If a generated contract doesn't compile or doesn't behave as expected**, the problem is almost always (in order of likelihood): missing `FHE.allowThis`, wrong config inheritance, missing `FHE.fromExternal` unwrap, or attempting to branch on an encrypted value.

## Authoritative external sources

- Docs: `https://docs.zama.org/protocol`
- Hardhat template: `https://github.com/zama-ai/fhevm-hardhat-template`
- Example dApps: `https://github.com/zama-ai/dapps`
- OpenZeppelin confidential contracts: `https://github.com/OpenZeppelin/openzeppelin-confidential-contracts`

When any reference in this skill conflicts with the current state of the above sources, trust the sources. FHEVM is evolving fast.
