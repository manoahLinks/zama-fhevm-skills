# Confidential token (ERC-7984) — complete walkthrough

A confidential fungible token with encrypted balances and encrypted transfers, built on `@openzeppelin/confidential-contracts`.

## What the agent should learn

- Inheriting `ERC7984` alongside `ZamaEthereumConfig` and OZ access-control bases.
- The overloaded `confidentialTransfer` signature — when to disambiguate.
- Public mint vs confidential mint — when each is appropriate.
- Reading encrypted balances in tests and on the frontend (user decryption flow).

## Files

- `ConfidentialToken.sol` — the token contract
- `ConfidentialToken.test.ts` — tests for mint, transfer, balance reads
- `client.ts` — frontend: transfer and read-balance flows

## Design notes

- **Balances are `euint64`.** Max ~1.8 × 10^19 units. Choose decimals so your expected supply stays comfortably below the ceiling.
- **Initial supply is public** in this example (passed as `uint64`). If the initial supply itself should be secret, skip the constructor mint and call `confidentialMint` from an off-chain script after deployment.
- **ACL for balance reads is handled by the base `ERC7984` contract.** Inheriting contracts do not need to manually call `FHE.allow` for balance holders — the base grants it on every balance update.
