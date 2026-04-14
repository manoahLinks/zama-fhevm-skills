// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, externalEuint8, euint8, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Confidential voting
/// @notice Individual votes are encrypted; only the final tallies are revealed.
contract Voting is ZamaEthereumConfig {
    euint32 private _yesCount;
    euint32 private _noCount;
    mapping(address => bool) public hasVoted;

    uint256 public immutable votingEnds;
    bool public resultsRevealed;

    event VoteCast(address indexed voter);
    event ResultsRequested();

    constructor(uint256 votingDurationSeconds) {
        votingEnds = block.timestamp + votingDurationSeconds;
        _yesCount = FHE.asEuint32(0);
        _noCount = FHE.asEuint32(0);
        FHE.allowThis(_yesCount);
        FHE.allowThis(_noCount);
    }

    modifier onlyBeforeEnd() {
        require(block.timestamp < votingEnds, "voting ended");
        _;
    }

    modifier onlyAfterEnd() {
        require(block.timestamp >= votingEnds, "voting still open");
        _;
    }

    /// @notice Cast an encrypted vote. `encVote` should encrypt 0 (no) or 1 (yes).
    function vote(
        externalEuint8 encVote,
        bytes calldata inputProof
    ) external onlyBeforeEnd {
        require(!hasVoted[msg.sender], "already voted");
        hasVoted[msg.sender] = true;

        euint8 v = FHE.fromExternal(encVote, inputProof);

        // Interpret vote as boolean: any non-zero becomes yes.
        ebool isYes = FHE.ne(v, FHE.asEuint8(0));

        // Add 1 to the winning tally, 0 to the other — no branching.
        euint32 one = FHE.asEuint32(1);
        euint32 zero = FHE.asEuint32(0);

        _yesCount = FHE.add(_yesCount, FHE.select(isYes, one, zero));
        _noCount = FHE.add(_noCount, FHE.select(isYes, zero, one));

        FHE.allowThis(_yesCount);
        FHE.allowThis(_noCount);

        emit VoteCast(msg.sender);
    }

    /// @notice Open the final tallies for public decryption.
    function revealResults() external onlyAfterEnd {
        require(!resultsRevealed, "already revealed");
        resultsRevealed = true;

        FHE.makePubliclyDecryptable(_yesCount);
        FHE.makePubliclyDecryptable(_noCount);

        emit ResultsRequested();
    }

    /// @notice Handle fetches (decrypt off-chain via the Relayer SDK).
    function yesCountHandle() external view returns (euint32) {
        return _yesCount;
    }

    function noCountHandle() external view returns (euint32) {
        return _noCount;
    }
}
