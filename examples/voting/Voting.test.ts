import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Voting", function () {
    async function deploy(durationSeconds = 3600) {
        const [deployer, alice, bob, carol] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("Voting");
        const contract = await Factory.deploy(durationSeconds);
        await contract.waitForDeployment();
        return {
            contract,
            contractAddress: await contract.getAddress(),
            deployer,
            alice,
            bob,
            carol
        };
    }

    async function castVote(
        contract: any,
        contractAddress: string,
        voter: any,
        choice: 0 | 1
    ) {
        const input = fhevm.createEncryptedInput(contractAddress, voter.address);
        input.add8(BigInt(choice));
        const enc = await input.encrypt();
        await contract.connect(voter).vote(enc.handles[0], enc.inputProof);
    }

    it("tallies 2 yes and 1 no correctly", async function () {
        const { contract, contractAddress, alice, bob, carol } = await deploy();

        await castVote(contract, contractAddress, alice, 1);
        await castVote(contract, contractAddress, bob, 1);
        await castVote(contract, contractAddress, carol, 0);

        // Fast-forward past voting end
        await time.increase(3601);

        await contract.revealResults();

        // Read tallies via public decryption
        const yesHandle = await contract.yesCountHandle();
        const noHandle = await contract.noCountHandle();

        // In Hardhat tests the plugin exposes public decryption:
        const yes = await fhevm.publicDecryptEuint(FhevmType.euint32, yesHandle);
        const no = await fhevm.publicDecryptEuint(FhevmType.euint32, noHandle);

        expect(yes).to.equal(2n);
        expect(no).to.equal(1n);
    });

    it("prevents double voting", async function () {
        const { contract, contractAddress, alice } = await deploy();

        await castVote(contract, contractAddress, alice, 1);
        await expect(
            castVote(contract, contractAddress, alice, 0)
        ).to.be.revertedWith("already voted");
    });

    it("rejects votes after the deadline", async function () {
        const { contract, contractAddress, alice } = await deploy(10);
        await time.increase(11);
        await expect(
            castVote(contract, contractAddress, alice, 1)
        ).to.be.revertedWith("voting ended");
    });
});
