# Contract addresses, chain IDs, and endpoints

**You almost never need to hardcode these.** In Solidity, inherit `ZamaEthereumConfig` and the correct addresses resolve from `block.chainid`. In TypeScript, import the chain preset from `@zama-fhe/sdk/chains`. This file exists for verification, debugging, block-explorer lookups, and manual/Foundry configuration.

Addresses below are cross-checked against `config/ZamaConfig.sol` in both `@fhevm/solidity@0.11.1` (the pinned version) and `0.13.1`, and against the [Zama docs](https://docs.zama.org/protocol/solidity-guides/smart-contract/configure/contract_addresses). The Ethereum and Sepolia entries are byte-identical across both versions. Verified 2026-08-03.

## Chain IDs

| Network | Chain ID | Config base |
|---|---|---|
| Ethereum mainnet | 1 | `ZamaEthereumConfig` |
| Ethereum Sepolia | 11155111 | `ZamaEthereumConfig` |
| Polygon Amoy testnet | 80002 | `ZamaPolygonConfig` — **0.13.1+ only**, see caveat below |
| Localhost / Hardhat | 31337 | `ZamaEthereumConfig` |
| Gateway chain | 10901 | n/a — not a deploy target |

The Gateway chain is where decryption and input verification are coordinated. You never deploy to it; the relayer and KMS talk to it on your behalf.

## Host-chain contracts

These are the three addresses the config base wires into your contract.

### Ethereum Sepolia (11155111)

| Contract | Address |
|---|---|
| ACL | `0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D` |
| FHEVM Executor (Coprocessor) | `0x92C920834Ec8941d2C77D188936E1f7A6f49c127` |
| KMS Verifier | `0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A` |
| Input Verifier | `0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0` |
| HCU Limit | `0xa10998783c8CF88D886Bc30307e631D6686F0A22` |

### Ethereum mainnet (1)

| Contract | Address |
|---|---|
| ACL | `0xcA2E8f1F656CD25C01F05d0b243Ab1ecd4a8ffb6` |
| FHEVM Executor (Coprocessor) | `0xD82385dADa1ae3E969447f20A3164F6213100e75` |
| KMS Verifier | `0x77627828a55156b04Ac0DC0eb30467f1a552BB03` |

Note: as of `@fhevm/solidity@0.13.1` the mainnet block in `ZamaConfig.sol` still carries a source comment describing these as placeholders pending deployment. Confirm against a block explorer before relying on them for a mainnet launch.

### Polygon Amoy testnet (80002) — not reachable at the pinned version

| Contract | Address |
|---|---|
| ACL | `0xD99Cb9Fc3c42c87f2A4A12e8Fd60318d6bDdf985` |
| FHEVM Executor (Coprocessor) | `0x89420269f61e4db00545cd99da0aEcA7fF0912f9` |
| KMS Verifier | `0xCD1D89E311bce4C8DEa9a0857a0c9A4E153D4041` |

⚠️ **Reachable only from `@fhevm/solidity@0.13.1+`,** via `ZamaPolygonConfig`. The skill pins `0.11.1`, which ships `ZamaEthereumConfig` as its only config base and reverts with `ZamaProtocolUnsupported()` on chain 80002.

The pin is forced by `@openzeppelin/confidential-contracts`: every published version through `0.5.1` declares an **exact** peer dependency on `@fhevm/solidity@0.11.1`. Until OpenZeppelin ships a release targeting 0.13.x, a project cannot use both ERC-7984 base contracts and Polygon Amoy. Listed here for when that changes.

## Gateway-chain contracts (10901)

| Contract | Address |
|---|---|
| Decryption | `0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478` |
| Input Verification | `0x483b9dE06E4E4C7D35CCf5837A1668487406D955` |

You do not call these directly from your contract. They matter when debugging a stuck decryption or tracing a relayer request.

## Relayer endpoints

| Network | URL |
|---|---|
| Testnet (Sepolia) | `https://relayer.testnet.zama.org` |

Mainnet relayer access requires an API key. Never ship one in a browser bundle — proxy through your own backend.

## Protocol IDs

`confidentialProtocolId()` is exposed as a public view on every config base:

| Network | ID |
|---|---|
| Mainnet | `1` |
| Testnet (Sepolia, Polygon Amoy) | `10001` |
| Localhost (31337) | `type(uint256).max` |

## Verifying what your deployment actually used

If FHE operations revert at runtime, confirm the contract resolved the addresses you expect:

```bash
# Should match the ACL address for your chain
cast call <YOUR_CONTRACT> "confidentialProtocolId()(uint256)" --rpc-url $RPC_URL
```

A return of `0` means the chain is not recognized — you are on an unsupported network, or inherited the wrong config base.

## Anti-patterns

- **Hardcoding these into a contract instead of inheriting the config base.** The addresses change between protocol releases; the base is updated with the package.
- **Assuming `ZamaEthereumConfig` covers every chain.** It handles 1, 11155111, and 31337, and reverts with `ZamaProtocolUnsupported()` on anything else.
- **Upgrading `@fhevm/solidity` to 0.13.1 to get Polygon support while using OpenZeppelin confidential contracts.** The peer dependency is exact — npm will refuse with `ERESOLVE`, and `--force` produces a broken tree.
- **Copying an address out of a blog post or an older doc version.** Zama has redeployed these across protocol versions. Trust the version of `ZamaConfig.sol` you actually compile against.
- **Treating the Gateway chain ID as a deploy target.** It is infrastructure, not a host chain.

## What to read next

- `references/09-deployment.md` — deploying against these networks
- `references/07-frontend-sdk.md` — the client-side chain presets
