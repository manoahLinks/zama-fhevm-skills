# Testing FHEVM contracts with Hardhat

The `@fhevm/hardhat-plugin` package gives you real encrypted input creation and decryption helpers in your tests — **not mocks**. Use them. Never write your own FHE mock.

## Enable the plugin

```typescript
// hardhat.config.ts
import "@fhevm/hardhat-plugin";
```

Then in tests:

```typescript
import { fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
```

## The anatomy of a test

```typescript
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("FHECounter", function () {
    let contract: any;
    let owner: any;
    let alice: any;

    beforeEach(async function () {
        [owner, alice] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("FHECounter");
        contract = await Factory.deploy();
        await contract.waitForDeployment();
    });

    it("increments with an encrypted input", async function () {
        const contractAddress = await contract.getAddress();

        // 1. Build encrypted input
        const input = fhevm.createEncryptedInput(contractAddress, alice.address);
        input.add32(5n);
        const enc = await input.encrypt();

        // 2. Call the contract
        await contract.connect(alice).increment(enc.handles[0], enc.inputProof);

        // 3. Read back the encrypted result handle
        const handle = await contract.getCount();

        // 4. Decrypt for the assertion
        const value = await fhevm.userDecryptEuint(
            FhevmType.euint32,
            handle,
            contractAddress,
            alice
        );

        expect(value).to.equal(5n);
    });
});
```

## The helpers you care about

### Creating encrypted inputs

```typescript
const input = fhevm.createEncryptedInput(contractAddress, userAddress);
input.add8(42n);
input.add64(1_000_000n);
input.addBool(true);
input.addAddress("0xabc...");
const enc = await input.encrypt();
```

Same API as the Relayer SDK — everything you learn here transfers to frontend code.

### User decryption

```typescript
const handle = await contract.someState();

// For euint*
const value = await fhevm.userDecryptEuint(
    FhevmType.euint64,
    handle,
    contractAddress,
    signer
);

// For ebool
const flag = await fhevm.userDecryptEbool(handle, contractAddress, signer);

// For eaddress
const addr = await fhevm.userDecryptEaddress(handle, contractAddress, signer);
```

All three require that the contract has previously called `FHE.allow(ct, signer.address)`. **If a decryption fails in a test, 90% of the time the fix is adding a missing `allow` inside the contract.**

### `FhevmType` values

| Type | Value |
|---|---|
| `euint8` | `FhevmType.euint8` |
| `euint16` | `FhevmType.euint16` |
| `euint32` | `FhevmType.euint32` |
| `euint64` | `FhevmType.euint64` |
| `euint128` | `FhevmType.euint128` |
| `euint256` | `FhevmType.euint256` |

## Fixture pattern

For tests that share setup, use a fixture:

```typescript
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MyContract");
    const contract = await Factory.deploy();
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();
    return { contract, contractAddress, owner, alice, bob };
}

it("does something", async function () {
    const { contract, contractAddress, alice } = await loadFixture(deployFixture);
    // ...
});
```

## Testing the ACL: pattern

```typescript
it("grants the user access after deposit", async function () {
    const { contract, contractAddress, alice } = await loadFixture(deployFixture);

    const input = fhevm.createEncryptedInput(contractAddress, alice.address);
    input.add64(100n);
    const enc = await input.encrypt();

    await contract.connect(alice).deposit(enc.handles[0], enc.inputProof);

    const handle = await contract.balances(alice.address);

    // This call would REVERT if the contract forgot FHE.allow(balance, alice)
    const balance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        handle,
        contractAddress,
        alice
    );

    expect(balance).to.equal(100n);
});
```

The decryption step doubles as an ACL assertion — if the contract skipped the allow, this test fails.

## Testing public decryption

```typescript
it("reveals the winner via public decrypt", async function () {
    // ... place bids ...

    await contract.reveal();

    const winnerHandle = await contract.winningAddress();
    const winner = await fhevm.publicDecryptEaddress(winnerHandle);

    expect(winner).to.equal(alice.address);
});
```

Note: `publicDecrypt*` does not take a signer — the value is openly readable after `makePubliclyDecryptable`.

## Running tests

```bash
npm run test                           # all tests
npx hardhat test test/FHECounter.ts    # one file
npx hardhat test --grep "reveals"      # matching test names
```

## Coverage and gas reporting

Coverage works with the `hardhat-coverage` plugin (included in the template):

```bash
npm run coverage
```

Gas reports through `hardhat-gas-reporter` will show real FHE operation costs — useful for catching accidentally expensive contracts before deployment.

## Anti-patterns

- **Mocking FHE in tests.** The plugin already simulates FHE locally — you are already testing against a real (mock-backed) FHE pipeline. Never hand-roll mocks.
- **Calling `userDecrypt*` without first granting ACL in the contract.** The test will fail with an auth error. Fix the contract, not the test.
- **Using ethers `ContractFactory` with plaintext arguments for encrypted parameters.** Encrypted arguments must be `handles[i]` from `createEncryptedInput`, never plain numbers.
- **Reusing an encrypted input across multiple transactions.** Each `encrypt()` call is single-use. Re-encrypt for each tx.
- **Passing the wrong `userAddress` to `createEncryptedInput`.** If the signer sending the tx does not match, the on-chain `FHE.fromExternal` call reverts.

## Worked example: testing the error-flag pattern

```typescript
it("records INSUFFICIENT_FUNDS when over-withdrawing", async function () {
    const { contract, contractAddress, alice } = await loadFixture(deployFixture);

    // Deposit 100
    let input = fhevm.createEncryptedInput(contractAddress, alice.address);
    input.add64(100n);
    let enc = await input.encrypt();
    await contract.connect(alice).deposit(enc.handles[0], enc.inputProof);

    // Try to withdraw 500
    input = fhevm.createEncryptedInput(contractAddress, alice.address);
    input.add64(500n);
    enc = await input.encrypt();
    await contract.connect(alice).withdraw(enc.handles[0], enc.inputProof);

    // Balance unchanged
    const balHandle = await contract.balances(alice.address);
    const bal = await fhevm.userDecryptEuint(
        FhevmType.euint64, balHandle, contractAddress, alice
    );
    expect(bal).to.equal(100n);

    // Error code set
    const errHandle = await contract.lastError(alice.address);
    const err = await fhevm.userDecryptEuint(
        FhevmType.euint8, errHandle, contractAddress, alice
    );
    expect(err).to.equal(1n);  // INSUFFICIENT_FUNDS
});
```

## What to read next

- `templates/hardhat-test.ts` — a ready-to-copy skeleton
- `references/09-deployment.md` — what changes when you leave the test environment
