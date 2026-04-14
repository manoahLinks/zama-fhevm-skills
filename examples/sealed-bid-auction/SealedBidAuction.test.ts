import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Tests expect `MockNft.sol` alongside `SealedBidAuction.sol` in the contracts/ dir.

describe("SealedBidAuction", function () {
    async function deploy(duration = 3600) {
        const [seller, alice, bob, carol] = await ethers.getSigners();

        const NftFactory = await ethers.getContractFactory("MockNft");
        const nft = await NftFactory.deploy();
        await nft.waitForDeployment();
        await nft.mint(seller.address, 1);

        const AuctionFactory = await ethers.getContractFactory("SealedBidAuction");
        const auction = await AuctionFactory.deploy(
            await nft.getAddress(),
            1,
            duration,
            seller.address
        );
        await auction.waitForDeployment();
        const auctionAddress = await auction.getAddress();

        await nft.connect(seller).transferFrom(seller.address, auctionAddress, 1);

        return { auction, auctionAddress, nft, seller, alice, bob, carol };
    }

    async function placeBid(
        auction: any,
        auctionAddress: string,
        bidder: any,
        amount: bigint
    ) {
        const input = fhevm.createEncryptedInput(auctionAddress, bidder.address);
        input.add64(amount);
        const enc = await input.encrypt();
        await auction.connect(bidder).bid(enc.handles[0], enc.inputProof);
    }

    it("tracks the highest bid without revealing intermediate values", async function () {
        const { auction, auctionAddress, alice, bob, carol } = await deploy();

        await placeBid(auction, auctionAddress, alice, 100n);
        await placeBid(auction, auctionAddress, bob, 250n);
        await placeBid(auction, auctionAddress, carol, 175n);

        await time.increase(3601);
        await auction.reveal();

        const winnerHandle = await auction.winningAddressHandle();
        const bidHandle = await auction.highestBidHandle();

        // Match the order declared in resolve(): [winningAddress, highestBid]
        const winner = await fhevm.publicDecryptEaddress(winnerHandle);
        const highestBid = await fhevm.publicDecryptEuint(
            FhevmType.euint64,
            bidHandle
        );

        expect(winner).to.equal(bob.address);
        expect(highestBid).to.equal(250n);
    });

    it("rejects bids after the deadline", async function () {
        const { auction, auctionAddress, alice } = await deploy(10);
        await time.increase(11);
        await expect(placeBid(auction, auctionAddress, alice, 100n)).to.be.revertedWith(
            "auction ended"
        );
    });

    it("rejects reveal before the deadline", async function () {
        const { auction } = await deploy(10_000);
        await expect(auction.reveal()).to.be.revertedWith("auction still open");
    });
});
