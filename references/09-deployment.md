# Deployment

FHEVM contracts deploy like any Hardhat contract, with two extra requirements: every contract must inherit the correct config base, and the target network must be one where the Zama protocol is live.

## Config base — one for everything

Every FHE contract must inherit `ZamaEthereumConfig`. This single base handles **all three** supported networks via `block.chainid`:

| Network | chainId | Handled by `ZamaEthereumConfig` |
|---|---|---|
| Ethereum mainnet | 1 | ✅ |
| Ethereum Sepolia | 11155111 | ✅ |
| Hardhat localhost | 31337 | ✅ |

```solidity
// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { FHE, euint32 } from "@fhevm/solidity/lib/FHE.sol";

contract MyContract is ZamaEthereumConfig {
    euint32 private counter;
    // ...
}
```

Without this inheritance, `FHE.*` calls compile but fail at runtime because the contract does not know the coprocessor addresses.

**Note:** `SepoliaConfig` is a *TypeScript* export from `@zama-fhe/relayer-sdk` — do not confuse it with a Solidity contract. There is no `SepoliaConfig` in Solidity.

## `hardhat.config.ts` networks

```typescript
import { HardhatUserConfig, vars } from "hardhat/config";
import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import "solidity-coverage";

const MNEMONIC = vars.get("MNEMONIC", "test test test test test test test test test test test junk");
const INFURA_API_KEY = vars.get("INFURA_API_KEY", "");

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.24",
        settings: { optimizer: { enabled: true, runs: 200 } }
    },
    networks: {
        hardhat: {
            chainId: 31337
        },
        sepolia: {
            url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
            accounts: { mnemonic: MNEMONIC },
            chainId: 11155111
        }
    },
    namedAccounts: {
        deployer: 0
    }
};

export default config;
```

## Deploy script (`hardhat-deploy`)

```typescript
// deploy/01_deploy_counter.ts
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    await deploy("FHECounter", {
        from: deployer,
        log: true,
        args: []
    });
};

func.tags = ["FHECounter"];
export default func;
```

Run:

```bash
npx hardhat deploy --network sepolia --tags FHECounter
```

## Verifying on Etherscan

```bash
npx hardhat verify --network sepolia <address> <constructor args...>
```

The template ships with `@nomicfoundation/hardhat-verify` pre-configured. You'll need an Etherscan API key set via `vars set ETHERSCAN_API_KEY`.

## Post-deploy checklist

After any deploy to a real network, verify:

1. **Contract address matches what the frontend uses.** The relayer binds encrypted inputs to the contract address — a mismatch means every `fromExternal` call reverts.
2. **Network config in the frontend is right.** `SepoliaConfig` vs `MainnetConfig` (both exports of `@zama-fhe/relayer-sdk`).
3. **Any seed state has been granted ACL.** If the constructor pre-writes ciphertexts, those need `FHE.allowThis` (and often `FHE.allow(..., owner)`) inside the constructor.
4. **`@openzeppelin/confidential-contracts` version matches** what you compiled against — a newer version may have different function signatures.

## Funding the deployer

Get Sepolia ETH from any faucet. A typical FHE deployment costs more gas than a plain Solidity contract because the initialization and first few FHE operations are expensive. Budget ~0.05 Sepolia ETH to comfortably deploy and run a handful of tx.

## What does NOT deploy

- **The Zama coprocessor.** It already lives on Sepolia (and mainnet). Your contract just references it via the config base.
- **The relayer.** Hosted by Zama. You talk to it from the client via `@zama-fhe/relayer-sdk`.
- **The KMS.** Also hosted by Zama.

You only deploy your own contracts.

## Anti-patterns

- **Forgetting to inherit `ZamaEthereumConfig`.** Contract compiles, deploys, then every FHE op reverts at runtime.
- **Using `hardhat` network (chainId 31337) and expecting FHE to work against a remote coprocessor.** The local `hardhat` network runs tests against the plugin's simulated coprocessor, not the real one. Deploy to Sepolia for real end-to-end tests.
- **Upgrading `@fhevm/solidity` mid-project and not re-running tests.** Breaking changes happen — treat FHEVM like any fast-moving dependency.
- **Deploying without calling `FHE.allowThis` on any constructor-initialized ciphertexts.** The first real transaction will fail.

## What to read next

- `references/07-frontend-relayer-sdk.md` — configure the frontend for the network you just deployed to
- `templates/hardhat.config.ts` — the config above in copy-paste form
