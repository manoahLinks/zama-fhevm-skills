// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// Minimal ERC-721 used only by the sealed-bid auction tests.
// NOT part of the FHEVM skill itself — production code should use
// a real ERC-721 implementation.

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockNft is ERC721 {
    constructor() ERC721("MockNft", "MKNFT") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}
