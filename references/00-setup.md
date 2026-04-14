# Setting up an FHEVM project

## Prerequisites

- **Node.js**: even-numbered LTS only (v18, v20, v22). Odd versions (v19, v21, v23) are not supported and will emit warnings.
- **npm** (ships with Node) or **pnpm**.
- A wallet mnemonic and an RPC provider API key (Infura, Alchemy, or any Sepolia RPC) if you plan to deploy.

Verify:

```bash
node -v    # should print v18.x, v20.x, or v22.x
npm -v
```

## Fastest path: clone the hardhat template

```bash
git clone https://github.com/zama-ai/fhevm-hardhat-template.git my-fhevm-project
cd my-fhevm-project
npm install
```

The template ships with a working `FHECounter.sol`, a test, a deploy script, and pinned versions of `@fhevm/solidity`, `@fhevm/hardhat-plugin`, and `@zama-fhe/relayer-sdk`. Do not try to assemble these from scratch — use the template.

## Project structure you will see after init

```
my-fhevm-project/
├── contracts/
│   └── FHECounter.sol          # Example FHE contract
├── deploy/                     # hardhat-deploy scripts
├── tasks/                      # Custom Hardhat CLI tasks
├── test/
│   └── FHECounter.ts           # Example test
├── hardhat.config.ts
├── package.json
└── tsconfig.json
```

## Verify the toolchain works

```bash
npm run compile     # compiles Solidity
npm run test        # runs tests against the in-process FHE mock
```

If `npm run test` passes on a fresh clone, your environment is correct.

## Hardhat configuration variables

For Sepolia deployment only (tests do not need these):

```bash
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
```

The template uses these via `vars.get(...)` in `hardhat.config.ts`. The default placeholder values (`"test test test..."` and `"zzzz..."`) are fine for local testing but will not deploy.

## Adding FHEVM to an existing Hardhat project (not recommended, but possible)

If you cannot start from the template, install:

```bash
npm install --save-dev @fhevm/hardhat-plugin
npm install @fhevm/solidity @zama-fhe/relayer-sdk
```

Then add to `hardhat.config.ts`:

```typescript
import "@fhevm/hardhat-plugin";
```

And inherit `ZamaEthereumConfig` in every contract that uses FHE. This single base automatically wires up the correct coprocessor addresses based on `block.chainid` — mainnet (1), Sepolia (11155111), and localhost (31337) are all handled. **Without this inheritance, `FHE.*` calls will fail at runtime** because the contract will not know where the coprocessor lives.

## Common setup mistakes

- **Using Node v21 or v23**: will produce cryptic Hardhat errors. Downgrade to v20 or v22.
- **Forgetting `@fhevm/hardhat-plugin` import in `hardhat.config.ts`**: the test helpers (`fhevm.createEncryptedInput`, `fhevm.userDecryptEuint`) will be `undefined`.
- **Not running `npm install` after cloning**: the template's lockfile pins working versions — trust it.
- **Trying to use `fhevmjs`**: deprecated. The current client package is `@zama-fhe/relayer-sdk`.

## Next step

Read `references/02-types-and-operations.md` to learn what encrypted types are available, then write your first contract using `templates/basic-contract.sol` as a starting point.
