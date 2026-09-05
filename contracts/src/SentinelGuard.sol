// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SentinelRegistry.sol";

/**
 * @title SentinelGuard
 * @notice Pre-execution guard contract for KeeperHub autonomous agents.
 *         Before any protection action is broadcast onchain, KeeperHub
 *         calls `canExecute()` to ensure the health factor truly requires
 *         intervention — preventing false positives and wasted gas.
 *
 *         The guard also enforces cooldown periods (prevent over-triggering)
 *         and validates guardian authorization.
 *
 * @dev This is the "circuit breaker" that makes KeeperSentinel deterministic.
 *      Deployed on Base Sepolia (chainId 84532).
 */
contract SentinelGuard {
    // ─── Events ──────────────────────────────────────────────────────────────

    event ExecutionAllowed(uint256 indexed positionId, address guardian, uint256 reportedHF);
    event ExecutionBlocked(uint256 indexed positionId, address guardian, string reason);
    event CooldownUpdated(uint256 positionId, uint256 cooldownSeconds);

    // ─── State ───────────────────────────────────────────────────────────────

    SentinelRegistry public immutable registry;

    /// @notice Minimum seconds between consecutive protections (anti-spam)
    uint256 public defaultCooldown = 5 minutes;

    /// @notice Per-position override cooldowns
    mapping(uint256 => uint256) public positionCooldown;

    /// @notice Last protection timestamp per position
    mapping(uint256 => uint256) public lastProtectedAt;

    /// @notice Emergency pause flag (owner only)
    bool public paused;
    address public owner;

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address registryAddress) {
        require(registryAddress != address(0), "Invalid registry");
        registry = SentinelRegistry(registryAddress);
        owner = msg.sender;
    }

    // ─── Guard Logic ─────────────────────────────────────────────────────────

    /**
     * @notice Core guard check. Returns true if the protection execution
     *         is authorized to proceed. Called by KeeperHub before broadcast.
     *
     * @param positionId  The sentinel position to check.
     * @param reportedHF  The health factor reported by the agent × 1e18.
     * @return allowed    True if KeeperHub may proceed with the protection action.
     * @return reason     Human-readable reason (for audit logging).
     */
    function canExecute(
        uint256 positionId,
        uint256 reportedHF
    ) external view returns (bool allowed, string memory reason) {
        if (paused) {
            return (false, "Guard: system paused");
        }

        SentinelRegistry.Position memory pos = registry.getPosition(positionId);

        if (!pos.active) {
            return (false, "Guard: position not active");
        }

        if (pos.guardian != msg.sender && pos.owner != msg.sender) {
            return (false, "Guard: caller not authorized guardian");
        }

        // Cooldown check
        uint256 cooldown = positionCooldown[positionId] > 0
            ? positionCooldown[positionId]
            : defaultCooldown;

        if (block.timestamp < lastProtectedAt[positionId] + cooldown) {
            return (false, "Guard: cooldown not elapsed");
        }

        // Deterministic health factor check
        if (reportedHF >= pos.hfThreshold) {
            return (false, "Guard: health factor above threshold, no action needed");
        }

        return (true, "Guard: execution authorized");
    }

    /**
     * @notice Record a successful execution (update cooldown timestamp).
     *         Called after execution completes to reset the cooldown timer.
     * @param positionId The position that was protected.
     */
    function recordExecution(uint256 positionId) external {
        SentinelRegistry.Position memory pos = registry.getPosition(positionId);
        require(pos.guardian == msg.sender || pos.owner == msg.sender, "Unauthorized");

        lastProtectedAt[positionId] = block.timestamp;
        emit ExecutionAllowed(positionId, msg.sender, block.timestamp);
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    function setPositionCooldown(uint256 positionId, uint256 cooldownSeconds) external {
        SentinelRegistry.Position memory pos = registry.getPosition(positionId);
        require(pos.owner == msg.sender, "Not owner");
        require(cooldownSeconds >= 60, "Cooldown must be >= 60s");

        positionCooldown[positionId] = cooldownSeconds;
        emit CooldownUpdated(positionId, cooldownSeconds);
    }

    function setDefaultCooldown(uint256 cooldownSeconds) external {
        require(msg.sender == owner, "Not owner");
        require(cooldownSeconds >= 60, "Cooldown must be >= 60s");
        defaultCooldown = cooldownSeconds;
    }

    function setPaused(bool _paused) external {
        require(msg.sender == owner, "Not owner");
        paused = _paused;
    }

    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Not owner");
        require(newOwner != address(0), "Invalid");
        owner = newOwner;
    }
}
