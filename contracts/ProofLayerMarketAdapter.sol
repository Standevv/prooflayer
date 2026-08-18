// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ProofLayerPolicyGate} from "./ProofLayerPolicyGate.sol";

/// @title ProofLayerMarketAdapter
/// @notice Minimal testnet market adapter demonstrating verification-gated RWA interactions.
/// @dev Every protected market action must first pass through PolicyGate.executeVerifiedAction.
///      Deposits are free; withdrawals/swap-outs require a valid PASS certificate.
///      This is a testnet-only demonstration contract — not a production AMM.
contract ProofLayerMarketAdapter {
    error ZeroAddress();
    error InsufficientBalance(uint256 requested, uint256 available);
    error InsufficientPoolBalance(uint256 requested, uint256 available);

    event Deposited(address indexed actor, uint256 amount);
    event Withdrawn(address indexed actor, uint256 amount, bytes32 decisionId);

    ProofLayerPolicyGate public immutable policyGate;

    mapping(address => uint256) public balances;

    constructor(address policyGateAddress) {
        if (policyGateAddress == address(0)) revert ZeroAddress();
        policyGate = ProofLayerPolicyGate(policyGateAddress);
    }

    /// @notice Deposit test tokens into the pool. No verification gate required.
    function deposit() external payable {
        require(msg.value > 0, "deposit requires ETH");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw test tokens from the pool, gated by PolicyGate.
    /// @dev Caller must present a usable PASS certificate for the protected asset.
    ///      The withdrawal is blocked if the certificate is not valid, revoked, expired, or mismatches.
    function withdraw(
        uint256 amount,
        bytes32 certificateId,
        bytes32 assetId,
        bytes32 claimType,
        bytes32 policyId
    ) external returns (bytes32 decisionId) {
        if (amount == 0) revert InsufficientBalance(0, balances[msg.sender]);
        if (amount > balances[msg.sender]) {
            revert InsufficientBalance(amount, balances[msg.sender]);
        }

        // Enforcement: PolicyGate must approve this protected action
        decisionId = policyGate.executeVerifiedAction(
            certificateId,
            assetId,
            claimType,
            policyId,
            keccak256("MARKET_WITHDRAW")
        );

        balances[msg.sender] -= amount;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "ETH transfer failed");
        emit Withdrawn(msg.sender, amount, decisionId);
    }

    /// @notice Check whether a certificate would be accepted for a protected action.
    function validateCertificate(
        bytes32 certificateId,
        bytes32 assetId,
        bytes32 claimType,
        bytes32 policyId
    ) external view returns (bool) {
        return policyGate.validateAction(certificateId, assetId, claimType, policyId);
    }

    /// @notice Read the pool balance for the adapter contract itself.
    function poolBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
