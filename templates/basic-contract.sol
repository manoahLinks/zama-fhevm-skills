// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

// Minimal FHEVM contract skeleton.
// Every FHEVM contract needs: config base, FHE import, ACL calls after every
// ciphertext write, and FHE.fromExternal to unwrap user inputs.

import { FHE, externalEuint64, euint64, euint8, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract BasicExample is ZamaEthereumConfig {
    // Encrypted state. Reads return a handle (bytes32), not a plaintext.
    mapping(address => euint64) private _balances;

    // Error codes for the flag-based error pattern.
    euint8 private _NO_ERROR;
    euint8 private _INSUFFICIENT_FUNDS;
    mapping(address => euint8) private _lastError;

    event ErrorChanged(address indexed user);

    constructor() {
        _NO_ERROR = FHE.asEuint8(0);
        _INSUFFICIENT_FUNDS = FHE.asEuint8(1);
        FHE.allowThis(_NO_ERROR);
        FHE.allowThis(_INSUFFICIENT_FUNDS);
    }

    /// Deposit an encrypted amount into the caller's balance.
    function deposit(
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external {
        euint64 amount = FHE.fromExternal(encAmount, inputProof);

        _balances[msg.sender] = FHE.add(_balances[msg.sender], amount);

        // Required: contract must retain ACL on its own state.
        FHE.allowThis(_balances[msg.sender]);
        // Required if the user wants to decrypt their balance client-side.
        FHE.allow(_balances[msg.sender], msg.sender);

        _setLastError(_NO_ERROR, msg.sender);
    }

    /// Withdraw an encrypted amount — uses the flag pattern instead of require.
    function withdraw(
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external {
        euint64 amount = FHE.fromExternal(encAmount, inputProof);

        ebool canWithdraw = FHE.le(amount, _balances[msg.sender]);
        euint64 effective = FHE.select(canWithdraw, amount, FHE.asEuint64(0));

        _balances[msg.sender] = FHE.sub(_balances[msg.sender], effective);

        FHE.allowThis(_balances[msg.sender]);
        FHE.allow(_balances[msg.sender], msg.sender);

        euint8 code = FHE.select(canWithdraw, _NO_ERROR, _INSUFFICIENT_FUNDS);
        _setLastError(code, msg.sender);
    }

    /// Returns the balance handle. The caller must run user decryption to get a plaintext.
    function balanceOf(address account) external view returns (euint64) {
        return _balances[account];
    }

    function lastError(address user) external view returns (euint8) {
        return _lastError[user];
    }

    function _setLastError(euint8 code, address user) internal {
        _lastError[user] = code;
        FHE.allowThis(code);
        FHE.allow(code, user);
        emit ErrorChanged(user);
    }
}
