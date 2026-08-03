---
name: zama-fhevm
description: Build, test, and deploy confidential smart contracts on the Zama Protocol (FHEVM). Use when the user mentions FHEVM, Zama, confidential contracts, encrypted balances, euint, ebool, FHE.select, externalEuint, ERC-7984, confidential tokens, @fhevm/solidity, @zama-fhe/sdk, or the legacy @zama-fhe/relayer-sdk. Covers Solidity patterns, Hardhat testing, Sepolia/mainnet contract addresses, frontend integration via the Zama SDK, and OpenZeppelin confidential contracts.
---

# Zama FHEVM skill (Claude Code entry point)

This skill enables you to write correct, working FHEVM code: confidential smart contracts, tests, and frontend integration.

## How to use this skill

1. **Read `AGENTS.md` first.** It contains the critical rules, task routing table, and directory map. Everything else in this skill is referenced from there.
2. **Load specific references on demand** based on what the user is asking for. Do not preload everything — the references are designed to be loaded individually.
3. **Before writing any FHEVM code in a new session, read `references/11-anti-patterns.md`.** It prevents the common bugs that compile cleanly but break at runtime.
4. **When writing a non-trivial contract, start from the closest file in `templates/`** or the matching walkthrough in `examples/`. Do not improvise patterns you have not seen in the reference material.
5. **For any client-side code, use `@zama-fhe/sdk`.** `createInstance` / `SepoliaConfig` / `createEncryptedInput` belong to the superseded `@zama-fhe/relayer-sdk`. See `references/07-frontend-sdk.md`.

## Quick triage for common requests

| User says | Load |
|---|---|
| "Write me a confidential [X] contract" | `AGENTS.md` + `references/11-anti-patterns.md` + `templates/basic-contract.sol` + the closest `examples/` walkthrough |
| "How do I encrypt inputs from my frontend?" | `references/04-inputs-and-proofs.md` + `references/07-frontend-sdk.md` |
| "What's the Sepolia address for X?" / chain IDs / relayer URL | `references/12-contract-addresses.md` |
| "How do I test this?" | `references/08-testing-hardhat.md` + `templates/hardhat-test.ts` |
| "Why doesn't my contract work?" | `references/11-anti-patterns.md` (diagnostic checklist at the bottom) |
| "Build a confidential ERC-20 / ERC-7984 token" | `references/10-erc7984.md` + `templates/erc7984-token.sol` + `examples/erc7984-token/` |

## The 12 rules (do not violate)

These are repeated in full in `AGENTS.md`. Short form:

1. Never `if`/`require` on an encrypted value — use `FHE.select`.
2. Always `FHE.allowThis(ct)` after storing a ciphertext.
3. Always `FHE.allow(ct, user)` before the user decrypts.
4. `view` functions return handles, not plaintexts.
5. Always `FHE.fromExternal(handle, proof)` before operating on user inputs.
6. `FHE.div` / `FHE.rem` require plaintext RHS.
7. `FHE.randEuintX(bound)` — bound must be a power of 2; no `eth_call`.
8. Loop bounds must be plaintext.
9. Inherit `ZamaEthereumConfig` — the only config base at the pinned 0.11.1; Solidity only.
10. Never mock FHE in tests — use `@fhevm/hardhat-plugin`.
11. Public decryption handle order must match on both sides.
12. User decryption request ≤ 2048 bits total.

## Canonical package versions

Use these validated versions unless you intentionally upgrade and re-validate:

- `@fhevm/solidity`: `0.11.1`
- `@fhevm/hardhat-plugin`: `0.4.2`
- `@zama-fhe/sdk`: `3.4.0` ← current client SDK
- `@openzeppelin/confidential-contracts`: `0.5.1`

Legacy, do not use for new work: `@zama-fhe/relayer-sdk` (superseded by `@zama-fhe/sdk`), `fhevmjs` (deprecated).

If you change versions, update these pins plus the table in `AGENTS.md`. (`./validate.sh` re-runs the example suite, but it lives in the skill's source repo and is not shipped to installs — it will not be in this directory.)

## Directory map

```
.
├── AGENTS.md                       ← read this first
├── SKILL.md                        ← this file
├── references/                     ← load on demand
├── templates/                      ← copy-paste working code
└── examples/                       ← full walkthroughs
    ├── voting/
    ├── sealed-bid-auction/
    └── erc7984-token/
```
