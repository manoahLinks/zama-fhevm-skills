// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { FHE, externalEuint64, euint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { ERC7984 } from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

contract ConfidentialToken is ZamaEthereumConfig, ERC7984, Ownable2Step {
    constructor(
        address initialOwner,
        uint64 initialSupply,
        string memory name_,
        string memory symbol_,
        string memory contractURI_
    )
        ERC7984(name_, symbol_, contractURI_)
        Ownable(initialOwner)
    {
        _mint(initialOwner, FHE.asEuint64(initialSupply));
    }

    function mint(address to, uint64 amount) external onlyOwner {
        _mint(to, FHE.asEuint64(amount));
    }

    function confidentialMint(
        address to,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external onlyOwner returns (euint64 transferred) {
        return _mint(to, FHE.fromExternal(encAmount, inputProof));
    }

    function confidentialBurn(
        address from,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external onlyOwner returns (euint64 transferred) {
        return _burn(from, FHE.fromExternal(encAmount, inputProof));
    }
}
