import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("ConfidentialToken", function () {
    async function deploy() {
        const [owner, alice, bob] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("ConfidentialToken");
        const token = await Factory.deploy(
            owner.address,
            1_000_000n,
            "Confidential USD",
            "cUSD",
            "https://example.com/metadata"
        );
        await token.waitForDeployment();
        return { token, tokenAddress: await token.getAddress(), owner, alice, bob };
    }

    it("mints the initial supply to the owner", async function () {
        const { token, tokenAddress, owner } = await deploy();
        const handle = await token.confidentialBalanceOf(owner.address);
        const balance = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            handle,
            tokenAddress,
            owner
        );
        expect(balance).to.equal(1_000_000n);
    });

    it("transfers encrypted amounts between accounts", async function () {
        const { token, tokenAddress, owner, alice } = await deploy();

        const input = fhevm
            .createEncryptedInput(tokenAddress, owner.address);
        input.add64(250n);
        const enc = await input.encrypt();

        // Overloaded confidentialTransfer — disambiguate with the signature string.
        await token
            .connect(owner)
            ["confidentialTransfer(address,bytes32,bytes)"](
                alice.address,
                enc.handles[0],
                enc.inputProof
            );

        const aliceHandle = await token.confidentialBalanceOf(alice.address);
        const aliceBal = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            aliceHandle,
            tokenAddress,
            alice
        );
        expect(aliceBal).to.equal(250n);

        const ownerHandle = await token.confidentialBalanceOf(owner.address);
        const ownerBal = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            ownerHandle,
            tokenAddress,
            owner
        );
        expect(ownerBal).to.equal(999_750n);
    });

    it("public mint increases the recipient's balance", async function () {
        const { token, tokenAddress, owner, bob } = await deploy();

        await token.connect(owner).mint(bob.address, 500n);

        const handle = await token.confidentialBalanceOf(bob.address);
        const balance = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            handle,
            tokenAddress,
            bob
        );
        expect(balance).to.equal(500n);
    });

    it("confidential mint keeps the amount secret", async function () {
        const { token, tokenAddress, owner, bob } = await deploy();

        const input = fhevm.createEncryptedInput(tokenAddress, owner.address);
        input.add64(777n);
        const enc = await input.encrypt();

        await token
            .connect(owner)
            .confidentialMint(bob.address, enc.handles[0], enc.inputProof);

        const handle = await token.confidentialBalanceOf(bob.address);
        const balance = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            handle,
            tokenAddress,
            bob
        );
        expect(balance).to.equal(777n);
    });
});
