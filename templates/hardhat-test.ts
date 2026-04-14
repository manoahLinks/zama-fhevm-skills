// Copy into test/MyContract.ts and adapt.
// Demonstrates: encrypted inputs, user decryption, ACL verification, error flags.

import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("BasicExample", function () {
    async function deployFixture() {
        const [owner, alice, bob] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("BasicExample");
        const contract = await Factory.deploy();
        await contract.waitForDeployment();
        const contractAddress = await contract.getAddress();
        return { contract, contractAddress, owner, alice, bob };
    }

    it("deposits and reads back the encrypted balance", async function () {
        const { contract, contractAddress, alice } = await loadFixture(deployFixture);

        const input = fhevm.createEncryptedInput(contractAddress, alice.address);
        input.add64(1_000n);
        const enc = await input.encrypt();

        await contract.connect(alice).deposit(enc.handles[0], enc.inputProof);

        const handle = await contract.balanceOf(alice.address);
        const balance = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            handle,
            contractAddress,
            alice
        );

        expect(balance).to.equal(1_000n);
    });

    it("withdraws within balance and records NO_ERROR", async function () {
        const { contract, contractAddress, alice } = await loadFixture(deployFixture);

        // Deposit 500
        let input = fhevm.createEncryptedInput(contractAddress, alice.address);
        input.add64(500n);
        let enc = await input.encrypt();
        await contract.connect(alice).deposit(enc.handles[0], enc.inputProof);

        // Withdraw 200
        input = fhevm.createEncryptedInput(contractAddress, alice.address);
        input.add64(200n);
        enc = await input.encrypt();
        await contract.connect(alice).withdraw(enc.handles[0], enc.inputProof);

        const balHandle = await contract.balanceOf(alice.address);
        const balance = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            balHandle,
            contractAddress,
            alice
        );
        expect(balance).to.equal(300n);

        const errHandle = await contract.lastError(alice.address);
        const err = await fhevm.userDecryptEuint(
            FhevmType.euint8,
            errHandle,
            contractAddress,
            alice
        );
        expect(err).to.equal(0n); // NO_ERROR
    });

    it("blocks over-withdraw without reverting and records INSUFFICIENT_FUNDS", async function () {
        const { contract, contractAddress, alice } = await loadFixture(deployFixture);

        // Deposit 100
        let input = fhevm.createEncryptedInput(contractAddress, alice.address);
        input.add64(100n);
        let enc = await input.encrypt();
        await contract.connect(alice).deposit(enc.handles[0], enc.inputProof);

        // Try to withdraw 999
        input = fhevm.createEncryptedInput(contractAddress, alice.address);
        input.add64(999n);
        enc = await input.encrypt();
        await contract.connect(alice).withdraw(enc.handles[0], enc.inputProof);

        // Balance unchanged
        const balHandle = await contract.balanceOf(alice.address);
        const balance = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            balHandle,
            contractAddress,
            alice
        );
        expect(balance).to.equal(100n);

        // Error code set to 1 (INSUFFICIENT_FUNDS)
        const errHandle = await contract.lastError(alice.address);
        const err = await fhevm.userDecryptEuint(
            FhevmType.euint8,
            errHandle,
            contractAddress,
            alice
        );
        expect(err).to.equal(1n);
    });
});
