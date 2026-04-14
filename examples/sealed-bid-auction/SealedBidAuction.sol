// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, externalEuint64, euint64, eaddress, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title First-price sealed-bid NFT auction
/// @notice Bids stay encrypted until the auction ends, then the winner is revealed via public decryption.
contract SealedBidAuction is ZamaEthereumConfig {
    IERC721 public immutable nft;
    uint256 public immutable tokenId;
    uint256 public immutable auctionEnds;

    address public immutable seller;

    euint64 private _highestBid;
    eaddress private _winningAddress;

    // Set after resolve() has verified the public decryption proof.
    address public revealedWinner;
    uint64 public revealedBid;
    bool public resolved;

    event BidPlaced(address indexed bidder);
    event RevealRequested();
    event AuctionResolved(address indexed winner, uint64 bid);

    constructor(IERC721 nft_, uint256 tokenId_, uint256 durationSeconds, address seller_) {
        nft = nft_;
        tokenId = tokenId_;
        auctionEnds = block.timestamp + durationSeconds;
        seller = seller_;
    }

    modifier onlyBeforeEnd() {
        require(block.timestamp < auctionEnds, "auction ended");
        _;
    }

    modifier onlyAfterEnd() {
        require(block.timestamp >= auctionEnds, "auction still open");
        _;
    }

    function bid(
        externalEuint64 encBid,
        bytes calldata inputProof
    ) external onlyBeforeEnd {
        euint64 newBid = FHE.fromExternal(encBid, inputProof);

        if (FHE.isInitialized(_highestBid)) {
            ebool isHigher = FHE.gt(newBid, _highestBid);
            _highestBid = FHE.select(isHigher, newBid, _highestBid);
            _winningAddress = FHE.select(
                isHigher,
                FHE.asEaddress(msg.sender),
                _winningAddress
            );
        } else {
            _highestBid = newBid;
            _winningAddress = FHE.asEaddress(msg.sender);
        }

        FHE.allowThis(_highestBid);
        FHE.allowThis(_winningAddress);

        emit BidPlaced(msg.sender);
    }

    /// @notice Opens the winning bid and address for public decryption.
    function reveal() external onlyAfterEnd {
        require(FHE.isInitialized(_highestBid), "no bids");
        FHE.makePubliclyDecryptable(_winningAddress);
        FHE.makePubliclyDecryptable(_highestBid);
        emit RevealRequested();
    }

    /// @notice Anyone can call this with the decrypted values and relayer proof.
    /// @dev The handle order MUST match [winningAddress, highestBid] — same as in the client's publicDecrypt call.
    function resolve(
        address claimedWinner,
        uint64 claimedBid,
        bytes calldata decryptionProof
    ) external onlyAfterEnd {
        require(!resolved, "already resolved");

        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(_winningAddress);
        cts[1] = FHE.toBytes32(_highestBid);

        bytes memory cleartexts = abi.encode(claimedWinner, claimedBid);

        // Reverts if the proof does not match the ciphertexts.
        FHE.checkSignatures(cts, cleartexts, decryptionProof);

        revealedWinner = claimedWinner;
        revealedBid = claimedBid;
        resolved = true;

        nft.safeTransferFrom(address(this), claimedWinner, tokenId);

        emit AuctionResolved(claimedWinner, claimedBid);
    }

    function highestBidHandle() external view returns (euint64) {
        return _highestBid;
    }

    function winningAddressHandle() external view returns (eaddress) {
        return _winningAddress;
    }
}
