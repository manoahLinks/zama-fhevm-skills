# Zama FHEVM Skill for AI Coding Agents

A tool-agnostic skill that teaches AI coding agents (Claude Code, OpenAI Codex, Cursor, Windsurf, Aider, and others) to build, test, and deploy **confidential smart contracts** using the Zama Protocol / FHEVM.

Drop this skill into your project and ask your agent:

> *"Write me a confidential voting contract using FHEVM"*

…and the agent will produce correct, working code — no digging through docs mid-build.

---

## ✅ Validated end-to-end

All example contracts in this skill are **compiled and tested against the official `fhevm-hardhat-template`** (v0.4.1) using:

- `@fhevm/solidity@0.11.1`
- `@fhevm/hardhat-plugin@0.4.2`
- `@zama-fhe/relayer-sdk@0.4.1`
- `@openzeppelin/confidential-contracts@0.4.0`

```
Voting               3/3 ✔  (encrypted tallies + public reveal)
ConfidentialToken    4/4 ✔  (ERC-7984 mint / transfer / confidential mint)
SealedBidAuction     3/3 ✔  (sealed bids + public decryption resolution)
────────────────────────────
Total               10/10 ✔
```

Every pattern in the references is taken from working code, not improvised from docs.

---

## What's inside

```
.
├── AGENTS.md                       ← master router (universal)
├── SKILL.md                        ← Claude Code wrapper
├── .cursor/rules/fhevm.mdc         ← Cursor wrapper
├── .windsurfrules                  ← Windsurf wrapper
├── validate.sh                     ← one-command re-validation
├── references/                     ← 11 focused reference files
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
├── templates/                      ← copy-paste starters
│   ├── hardhat.config.ts
│   ├── basic-contract.sol
│   ├── erc7984-token.sol
│   ├── hardhat-test.ts
│   └── frontend-snippet.ts
└── examples/                       ← complete walkthroughs
    ├── voting/                     ← encrypted votes, public tally reveal
    ├── sealed-bid-auction/         ← public decryption with proof verification
    └── erc7984-token/              ← confidential fungible token
```

## Design — one source of truth, many entry points

Every AI tool has its own "tell the agent what this project is" convention. This skill ships all of them, but they all point to the same content:

- **`AGENTS.md`** is the canonical entry. Read natively by OpenAI Codex, Aider, Jules, Cline, and others.
- **`SKILL.md`** adds Claude Code frontmatter (`name`, `description`).
- **`.cursor/rules/fhevm.mdc`** adds Cursor rule frontmatter.
- **`.windsurfrules`** is a plain-text Windsurf rules file.

All four are ~50 lines each. They defer to `references/`, `templates/`, and `examples/`, which are tool-agnostic.

**Result:** update `references/03-acl.md` once, every tool gets the fix. No drift.

---

## Installation

### Claude Code
```bash
# From your Claude Code skills directory (usually ~/.claude/skills/)
git clone <this-repo> zama-fhevm
```
Claude Code auto-discovers `SKILL.md` via its `name` / `description` frontmatter.

### OpenAI Codex / Aider / Jules / any AGENTS.md reader
```bash
# Copy AGENTS.md and the supporting directories into your project root:
cp -r AGENTS.md references templates examples your-project/
```
Codex reads `AGENTS.md` at repo root automatically on each session start.

### Cursor
```bash
cp -r .cursor your-project/
cp -r references templates examples your-project/
```
Cursor loads `.cursor/rules/*.mdc` when globs match (`.sol`, `.ts`, `.tsx`).

### Windsurf
```bash
cp .windsurfrules your-project/
cp -r references templates examples your-project/
```

---

## How it prevents common mistakes

FHEVM has a sharp learning curve: code that compiles can silently break because of missing ACL calls, branching attempts on encrypted booleans, or async decryption expectations. The skill surfaces all of these in `references/11-anti-patterns.md`, which the agent consults whenever it debugs.

**Top 5 bugs the skill catches:**

| Bug | How the skill prevents it |
|---|---|
| Forgetting `FHE.allowThis` after writing a ciphertext | Rule #2 in every tool's wrapper + diagnostic checklist |
| Using `if/require` on an encrypted value | Rule #1 + pattern cookbook in `05-conditional-logic.md` |
| Returning `euint` from `view` expecting a plaintext | Rule #4 + explicit anti-pattern example |
| Dividing two ciphertexts | Rule #6 + operation table showing plaintext-RHS constraint |
| Using deprecated `fhevmjs` instead of `@zama-fhe/relayer-sdk` | Package pinning + repeated throughout frontend references |

---

## Example interactions

### "Write me a confidential voting contract"
The agent loads `AGENTS.md` → matches routing table → reads `references/05-conditional-logic.md` + `references/06-decryption.md` → consults `examples/voting/` → produces a contract that uses `FHE.select`, marks tallies as publicly decryptable, and calls `FHE.allowThis` on every update.

### "How do I let users decrypt their balance?"
Agent loads `references/03-acl.md` + `references/06-decryption.md` + `references/07-frontend-relayer-sdk.md` → generates correct `FHE.allow(balance, user)` on the Solidity side + full EIP-712 `userDecrypt` flow on the TypeScript side.

### "My contract compiles but nothing works"
Agent loads `references/11-anti-patterns.md` → walks the diagnostic checklist (config base? `allowThis`? `fromExternal`?) → identifies the missing call without user hand-holding.

---

## Coverage against the brief

| Brief requirement | Coverage |
|---|---|
| FHEVM architecture and how FHE works onchain | `references/01-architecture.md` |
| Hardhat template setup | `references/00-setup.md` |
| Encrypted types (euint8-256, ebool, eaddress) | `references/02-types-and-operations.md` |
| FHE operations (arithmetic, comparison, conditional) | `references/02-types-and-operations.md` + `05-conditional-logic.md` |
| Access control (FHE.allow, allowThis, allowTransient) | `references/03-acl.md` |
| Input proofs | `references/04-inputs-and-proofs.md` |
| User decryption (EIP-712) | `references/06-decryption.md` + `07-frontend-relayer-sdk.md` |
| Public decryption | `references/06-decryption.md` + sealed-bid auction example |
| Frontend integration | `references/07-frontend-relayer-sdk.md` + `templates/frontend-snippet.ts` |
| Testing contracts | `references/08-testing-hardhat.md` + `templates/hardhat-test.ts` |
| Anti-patterns | `references/11-anti-patterns.md` (full catalog + diagnostic checklist) |
| OpenZeppelin Confidential Contracts / ERC-7984 | `references/10-erc7984.md` + `examples/erc7984-token/` |

---

## Contributing / staying current

FHEVM is evolving. When the docs, packages, or contract APIs change:

1. Update the affected `references/*.md` file.
2. Re-run the validation:
   ```bash
   ./validate.sh
   ```
   This clones (or pulls) the latest `fhevm-hardhat-template`, copies all examples in, runs the full test suite, and fails loudly if anything broke.
   Note: the script hard-resets `./fhevm-validation-test` to `origin/main` on every run, so do not keep local work in that sandbox directory.
3. If anything fails, fix the skill — not the test.

The tool wrappers (`AGENTS.md`, `SKILL.md`, `.cursor/rules/*.mdc`, `.windsurfrules`) rarely need changes — they point to references, which absorb the drift.

---

## Authoritative sources

- **Docs:** https://docs.zama.org/protocol
- **Hardhat template:** https://github.com/zama-ai/fhevm-hardhat-template
- **Example dApps:** https://github.com/zama-ai/dapps
- **OpenZeppelin Confidential Contracts:** https://github.com/OpenZeppelin/openzeppelin-confidential-contracts
- **Zama Protocol Litepaper:** https://docs.zama.org/protocol/zama-protocol-litepaper

When any reference in this skill conflicts with the current state of the sources above, trust the sources. Open an issue / PR.

---

## License

BSD-3-Clause-Clear — matching the Zama Protocol license so you can vendor this skill freely inside any FHEVM project.
