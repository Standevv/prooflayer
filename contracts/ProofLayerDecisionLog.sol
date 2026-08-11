// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ProofLayerDecisionLog
/// @notice An append-only log for decisions made using ProofLayer certificates.
contract ProofLayerDecisionLog {
    struct Decision {
        bytes32 decisionId;
        bytes32 certificateId;
        address actor;
        bytes32 actionType;
        bool allowed;
        uint64 timestamp;
    }

    error NotOwner(address caller);
    error ZeroAddress();
    error UnauthorizedWriter(address caller);
    error InvalidDecisionId();
    error DecisionAlreadyExists(bytes32 decisionId);
    error DecisionNotFound(bytes32 decisionId);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event WriterAuthorizationUpdated(address indexed writer, bool authorized);
    event DecisionRecorded(
        bytes32 indexed decisionId,
        bytes32 indexed certificateId,
        address indexed actor,
        bytes32 actionType,
        bool allowed,
        uint64 timestamp
    );

    address public owner;
    uint256 public decisionCount;
    mapping(address writer => bool authorized) public authorizedWriters;

    mapping(bytes32 decisionId => Decision decision) private _decisions;
    mapping(bytes32 decisionId => bool exists) private _decisionExists;

    constructor() {
        owner = msg.sender;
        authorizedWriters[msg.sender] = true;

        emit OwnershipTransferred(address(0), msg.sender);
        emit WriterAuthorizationUpdated(msg.sender, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    modifier onlyAuthorizedWriter() {
        if (!authorizedWriters[msg.sender]) revert UnauthorizedWriter(msg.sender);
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();

        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function setWriterAuthorization(address writer, bool authorized) external onlyOwner {
        if (writer == address(0)) revert ZeroAddress();

        authorizedWriters[writer] = authorized;
        emit WriterAuthorizationUpdated(writer, authorized);
    }

    function recordDecision(
        bytes32 decisionId,
        bytes32 certificateId,
        address actor,
        bytes32 actionType,
        bool allowed
    ) external onlyAuthorizedWriter returns (bytes32) {
        if (decisionId == bytes32(0)) revert InvalidDecisionId();
        if (_decisionExists[decisionId]) revert DecisionAlreadyExists(decisionId);

        uint64 timestamp = uint64(block.timestamp);
        _decisions[decisionId] = Decision({
            decisionId: decisionId,
            certificateId: certificateId,
            actor: actor,
            actionType: actionType,
            allowed: allowed,
            timestamp: timestamp
        });
        _decisionExists[decisionId] = true;
        unchecked {
            ++decisionCount;
        }

        emit DecisionRecorded(decisionId, certificateId, actor, actionType, allowed, timestamp);
        return decisionId;
    }

    function decisionExists(bytes32 decisionId) external view returns (bool) {
        return _decisionExists[decisionId];
    }

    function getDecision(bytes32 decisionId) external view returns (Decision memory) {
        if (!_decisionExists[decisionId]) revert DecisionNotFound(decisionId);
        return _decisions[decisionId];
    }
}
