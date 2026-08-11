// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ProofLayerCertificateRegistry} from "./ProofLayerCertificateRegistry.sol";
import {ProofLayerDecisionLog} from "./ProofLayerDecisionLog.sol";

/// @title ProofLayerPolicyGate
/// @notice Demonstrates enforcement of protected actions using ProofLayer certificates.
/// @dev Only successful decisions are logged here. A denied action reverts, and any log
///      written during the same transaction would be rolled back by EVM atomicity.
contract ProofLayerPolicyGate {
    error ZeroAddress();
    error CertificateNotFound(bytes32 certificateId);
    error CertificateNotUsable(bytes32 certificateId);
    error AssetMismatch(bytes32 expectedAssetId, bytes32 actualAssetId);
    error ClaimTypeMismatch(bytes32 expectedClaimType, bytes32 actualClaimType);
    error PolicyMismatch(bytes32 expectedPolicyId, bytes32 actualPolicyId);

    event VerifiedActionExecuted(
        bytes32 indexed certificateId,
        bytes32 indexed decisionId,
        address indexed actor,
        bytes32 actionType,
        uint256 executionNumber
    );

    ProofLayerCertificateRegistry public immutable registry;
    ProofLayerDecisionLog public immutable decisionLog;
    uint256 public executedActionCount;

    constructor(address registryAddress, address decisionLogAddress) {
        if (registryAddress == address(0) || decisionLogAddress == address(0)) revert ZeroAddress();

        registry = ProofLayerCertificateRegistry(registryAddress);
        decisionLog = ProofLayerDecisionLog(decisionLogAddress);
    }

    function validateAction(
        bytes32 certificateId,
        bytes32 expectedAssetId,
        bytes32 expectedClaimType,
        bytes32 expectedPolicyId
    ) external view returns (bool) {
        _validateAction(certificateId, expectedAssetId, expectedClaimType, expectedPolicyId);
        return true;
    }

    function executeVerifiedAction(
        bytes32 certificateId,
        bytes32 expectedAssetId,
        bytes32 expectedClaimType,
        bytes32 expectedPolicyId,
        bytes32 actionType
    ) external returns (bytes32 decisionId) {
        _validateAction(certificateId, expectedAssetId, expectedClaimType, expectedPolicyId);

        uint256 executionNumber;
        unchecked {
            executionNumber = ++executedActionCount;
        }
        decisionId = computeDecisionId(executionNumber, certificateId, msg.sender, actionType);
        decisionLog.recordDecision(decisionId, certificateId, msg.sender, actionType, true);

        emit VerifiedActionExecuted(certificateId, decisionId, msg.sender, actionType, executionNumber);
    }

    function computeDecisionId(
        uint256 executionNumber,
        bytes32 certificateId,
        address actor,
        bytes32 actionType
    ) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, executionNumber, certificateId, actor, actionType));
    }

    function _validateAction(
        bytes32 certificateId,
        bytes32 expectedAssetId,
        bytes32 expectedClaimType,
        bytes32 expectedPolicyId
    ) private view {
        if (!registry.certificateExists(certificateId)) revert CertificateNotFound(certificateId);
        if (!registry.isCertificateUsable(certificateId)) revert CertificateNotUsable(certificateId);

        ProofLayerCertificateRegistry.Certificate memory certificate = registry.getCertificate(certificateId);
        if (certificate.assetId != expectedAssetId) {
            revert AssetMismatch(expectedAssetId, certificate.assetId);
        }
        if (certificate.claimType != expectedClaimType) {
            revert ClaimTypeMismatch(expectedClaimType, certificate.claimType);
        }
        if (certificate.policyId != expectedPolicyId) {
            revert PolicyMismatch(expectedPolicyId, certificate.policyId);
        }
    }
}
