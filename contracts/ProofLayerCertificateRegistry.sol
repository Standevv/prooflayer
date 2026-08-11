// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ProofLayerCertificateRegistry
/// @notice Anchors canonical summaries of verification certificates issued off-chain.
contract ProofLayerCertificateRegistry {
    uint8 public constant RESULT_INDETERMINATE = 0;
    uint8 public constant RESULT_PASS = 1;
    uint8 public constant RESULT_FAIL = 2;

    struct Certificate {
        bytes32 certificateId;
        bytes32 assetId;
        bytes32 claimType;
        bytes32 policyId;
        bytes32 evidenceRoot;
        uint64 observedAt;
        uint64 validUntil;
        uint32 independentRootCount;
        uint8 result;
        address issuer;
        bool revoked;
    }

    error NotOwner(address caller);
    error ZeroAddress();
    error UnauthorizedIssuer(address caller);
    error UnauthorizedRevoker(address caller, bytes32 certificateId);
    error InvalidCertificateId();
    error CertificateAlreadyExists(bytes32 certificateId);
    error CertificateNotFound(bytes32 certificateId);
    error InvalidValidityRange(uint64 observedAt, uint64 validUntil);
    error InvalidResult(uint8 result);
    error CertificateAlreadyRevoked(bytes32 certificateId);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event IssuerAuthorizationUpdated(address indexed issuer, bool authorized);
    event CertificateRegistered(
        bytes32 indexed certificateId,
        bytes32 indexed assetId,
        bytes32 indexed policyId,
        bytes32 claimType,
        bytes32 evidenceRoot,
        uint64 observedAt,
        uint64 validUntil,
        uint32 independentRootCount,
        uint8 result,
        address issuer
    );
    event CertificateRevoked(bytes32 indexed certificateId, address indexed revokedBy);

    address public owner;
    mapping(address issuer => bool authorized) public authorizedIssuers;

    mapping(bytes32 certificateId => Certificate certificate) private _certificates;
    mapping(bytes32 certificateId => bool exists) private _certificateExists;

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    modifier onlyAuthorizedIssuer() {
        if (!authorizedIssuers[msg.sender]) revert UnauthorizedIssuer(msg.sender);
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();

        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function setIssuerAuthorization(address issuer, bool authorized) external onlyOwner {
        if (issuer == address(0)) revert ZeroAddress();

        authorizedIssuers[issuer] = authorized;
        emit IssuerAuthorizationUpdated(issuer, authorized);
    }

    function registerCertificate(
        bytes32 certificateId,
        bytes32 assetId,
        bytes32 claimType,
        bytes32 policyId,
        bytes32 evidenceRoot,
        uint64 observedAt,
        uint64 validUntil,
        uint32 independentRootCount,
        uint8 result
    ) external onlyAuthorizedIssuer {
        if (certificateId == bytes32(0)) revert InvalidCertificateId();
        if (_certificateExists[certificateId]) revert CertificateAlreadyExists(certificateId);
        if (validUntil <= observedAt) revert InvalidValidityRange(observedAt, validUntil);
        if (result > RESULT_FAIL) revert InvalidResult(result);

        _certificates[certificateId] = Certificate({
            certificateId: certificateId,
            assetId: assetId,
            claimType: claimType,
            policyId: policyId,
            evidenceRoot: evidenceRoot,
            observedAt: observedAt,
            validUntil: validUntil,
            independentRootCount: independentRootCount,
            result: result,
            issuer: msg.sender,
            revoked: false
        });
        _certificateExists[certificateId] = true;

        emit CertificateRegistered(
            certificateId,
            assetId,
            policyId,
            claimType,
            evidenceRoot,
            observedAt,
            validUntil,
            independentRootCount,
            result,
            msg.sender
        );
    }

    /// @notice A certificate can be revoked by the registry owner or its original issuer.
    function revokeCertificate(bytes32 certificateId) external {
        if (!_certificateExists[certificateId]) revert CertificateNotFound(certificateId);

        Certificate storage certificate = _certificates[certificateId];
        if (msg.sender != owner && msg.sender != certificate.issuer) {
            revert UnauthorizedRevoker(msg.sender, certificateId);
        }
        if (certificate.revoked) revert CertificateAlreadyRevoked(certificateId);

        certificate.revoked = true;
        emit CertificateRevoked(certificateId, msg.sender);
    }

    function certificateExists(bytes32 certificateId) external view returns (bool) {
        return _certificateExists[certificateId];
    }

    function getCertificate(bytes32 certificateId) external view returns (Certificate memory) {
        if (!_certificateExists[certificateId]) revert CertificateNotFound(certificateId);
        return _certificates[certificateId];
    }

    function isCertificateUsable(bytes32 certificateId) external view returns (bool) {
        if (!_certificateExists[certificateId]) return false;

        Certificate storage certificate = _certificates[certificateId];
        return certificate.result == RESULT_PASS && !certificate.revoked && block.timestamp <= certificate.validUntil;
    }
}
