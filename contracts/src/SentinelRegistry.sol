// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SentinelRegistry
 * @notice Registry for DeFi positions monitored by KeeperSentinel agents.
 *         Each registered position has an owner, a protocol address, and a health
 *         factor threshold below which autonomous protection is triggered.
 * @dev Deployed on Base Sepolia (chainId 84532).
 *      Part of the KeeperSentinel — Agent Economy Hackathon submission.
 */
contract SentinelRegistry {
    // ─── Events ──────────────────────────────────────────────────────────────

    event PositionRegistered(
        uint256 indexed positionId,
        address indexed owner,
        address indexed protocol,
        uint256 healthFactorThreshold,
        uint256 timestamp
    );

    event PositionUpdated(
        uint256 indexed positionId,
        uint256 newThreshold,
        bool active
    );

    event GuardianSet(
        uint256 indexed positionId,
        address indexed guardian
    );

    // ─── Data Structures ─────────────────────────────────────────────────────

    struct Position {
        uint256 id;
        address owner;
        address protocol;          // e.g. Aave v3 Pool address
        uint256 hfThreshold;       // Health factor threshold × 1e18 (e.g. 1.5e18)
        address guardian;          // KeeperHub wallet authorized to protect
        bool active;
        uint256 registeredAt;
        uint256 lastCheckedAt;
    }

    // ─── State ───────────────────────────────────────────────────────────────

    uint256 public nextPositionId;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public ownerPositions;

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() {
        nextPositionId = 1;
    }

    // ─── Mutative Functions ───────────────────────────────────────────────────

    /**
     * @notice Register a new DeFi position for sentinel monitoring.
     * @param protocol    The DeFi protocol contract address (e.g. Aave Pool).
     * @param hfThreshold Health factor threshold × 1e18 (e.g. 1.5e18 = 1.5).
     * @param guardian    Address of the KeeperHub wallet allowed to protect.
     * @return positionId The unique ID assigned to this position.
     */
    function registerPosition(
        address protocol,
        uint256 hfThreshold,
        address guardian
    ) external returns (uint256 positionId) {
        require(protocol != address(0), "Invalid protocol");
        require(hfThreshold > 1e18, "Threshold must be > 1.0");
        require(guardian != address(0), "Invalid guardian");

        positionId = nextPositionId++;
        positions[positionId] = Position({
            id:            positionId,
            owner:         msg.sender,
            protocol:      protocol,
            hfThreshold:   hfThreshold,
            guardian:      guardian,
            active:        true,
            registeredAt:  block.timestamp,
            lastCheckedAt: block.timestamp
        });

        ownerPositions[msg.sender].push(positionId);

        emit PositionRegistered(positionId, msg.sender, protocol, hfThreshold, block.timestamp);
    }

    /**
     * @notice Update the health factor threshold or active status of a position.
     */
    function updatePosition(
        uint256 positionId,
        uint256 newThreshold,
        bool active
    ) external {
        Position storage pos = positions[positionId];
        require(pos.owner == msg.sender, "Not owner");
        require(newThreshold > 1e18, "Threshold must be > 1.0");

        pos.hfThreshold = newThreshold;
        pos.active = active;

        emit PositionUpdated(positionId, newThreshold, active);
    }

    /**
     * @notice Set or change the guardian (KeeperHub executor) for a position.
     */
    function setGuardian(uint256 positionId, address guardian) external {
        Position storage pos = positions[positionId];
        require(pos.owner == msg.sender, "Not owner");
        require(guardian != address(0), "Invalid guardian");

        pos.guardian = guardian;
        emit GuardianSet(positionId, guardian);
    }

    /**
     * @notice Mark a position's last check timestamp (callable by guardian).
     */
    function recordHealthCheck(uint256 positionId) external {
        Position storage pos = positions[positionId];
        require(pos.guardian == msg.sender || pos.owner == msg.sender, "Unauthorized");
        pos.lastCheckedAt = block.timestamp;
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Get all positions registered by a specific owner.
     */
    function getOwnerPositions(address owner) external view returns (uint256[] memory) {
        return ownerPositions[owner];
    }

    /**
     * @notice Get a position by ID.
     */
    function getPosition(uint256 positionId) external view returns (Position memory) {
        return positions[positionId];
    }

    /**
     * @notice Check if a position is active and requires guardian protection
     *         based on reported health factor.
     * @param positionId  Position to evaluate.
     * @param currentHF   Current health factor × 1e18.
     * @return needsProtection True if guardian should trigger protection.
     */
    function needsProtection(uint256 positionId, uint256 currentHF) external view returns (bool) {
        Position memory pos = positions[positionId];
        return pos.active && (currentHF < pos.hfThreshold);
    }
}
