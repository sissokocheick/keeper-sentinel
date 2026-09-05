// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SentinelAction
 * @notice Immutable on-chain log of every autonomous protection action
 *         executed by a KeeperSentinel agent via KeeperHub.
 *         Provides a verifiable audit trail: health factor before/after,
 *         KeeperHub execution ID, and the resulting transaction hash.
 * @dev Deployed on Base Sepolia (chainId 84532).
 */
contract SentinelAction {
    // ─── Events ──────────────────────────────────────────────────────────────

    event ActionLogged(
        uint256 indexed actionId,
        uint256 indexed positionId,
        address indexed guardian,
        ActionType actionType,
        uint256 healthFactorBefore,
        uint256 healthFactorAfter,
        string keeperExecId,
        bytes32 txHash,
        uint256 timestamp
    );

    event ActionFailed(
        uint256 indexed actionId,
        uint256 indexed positionId,
        string reason,
        uint256 timestamp
    );

    // ─── Data Structures ─────────────────────────────────────────────────────

    enum ActionType {
        SupplyCollateral,  // Added collateral to restore health
        RepayDebt,         // Repaid debt to restore health
        Simulation,        // Preflight simulation (no broadcast)
        EmergencyHalt      // Action blocked by guardian (prevented revert)
    }

    struct Action {
        uint256 id;
        uint256 positionId;
        address guardian;
        ActionType actionType;
        uint256 healthFactorBefore;  // × 1e18
        uint256 healthFactorAfter;   // × 1e18 (0 if not yet confirmed)
        string keeperExecId;         // KeeperHub execution ID
        bytes32 txHash;              // Onchain tx hash (bytes32 for compactness)
        bool success;
        string failureReason;
        uint256 loggedAt;
    }

    // ─── State ───────────────────────────────────────────────────────────────

    uint256 public nextActionId;
    mapping(uint256 => Action) public actions;

    /// @notice All action IDs for a given position (ordered chronologically)
    mapping(uint256 => uint256[]) public positionActions;

    /// @notice Total successful protections (useful for reputation scoring)
    uint256 public totalSuccessfulProtections;

    /// @notice Total gas saved vs naive agent (cumulative, updated by guardian)
    uint256 public totalGasSaved;

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() {
        nextActionId = 1;
    }

    // ─── Mutative Functions ───────────────────────────────────────────────────

    /**
     * @notice Log a successful autonomous protection action.
     * @param positionId        The registered position that was protected.
     * @param actionType        Type of protection taken.
     * @param hfBefore          Health factor before protection × 1e18.
     * @param hfAfter           Health factor after protection × 1e18.
     * @param keeperExecId      KeeperHub execution ID string.
     * @param txHashBytes       Transaction hash as bytes32.
     * @param gasSaved          Gas units saved vs naive agent execution.
     * @return actionId         The unique action log ID.
     */
    function logSuccess(
        uint256 positionId,
        ActionType actionType,
        uint256 hfBefore,
        uint256 hfAfter,
        string calldata keeperExecId,
        bytes32 txHashBytes,
        uint256 gasSaved
    ) external returns (uint256 actionId) {
        actionId = nextActionId++;

        actions[actionId] = Action({
            id:                 actionId,
            positionId:         positionId,
            guardian:           msg.sender,
            actionType:         actionType,
            healthFactorBefore: hfBefore,
            healthFactorAfter:  hfAfter,
            keeperExecId:       keeperExecId,
            txHash:             txHashBytes,
            success:            true,
            failureReason:      "",
            loggedAt:           block.timestamp
        });

        positionActions[positionId].push(actionId);
        totalSuccessfulProtections++;
        totalGasSaved += gasSaved;

        emit ActionLogged(
            actionId, positionId, msg.sender, actionType,
            hfBefore, hfAfter, keeperExecId, txHashBytes, block.timestamp
        );
    }

    /**
     * @notice Log a failed or blocked action (e.g., simulation revert intercepted).
     * @param positionId  The position affected.
     * @param reason      Why the action was halted.
     * @return actionId   The unique action log ID.
     */
    function logFailure(
        uint256 positionId,
        string calldata reason
    ) external returns (uint256 actionId) {
        actionId = nextActionId++;

        actions[actionId] = Action({
            id:                 actionId,
            positionId:         positionId,
            guardian:           msg.sender,
            actionType:         ActionType.EmergencyHalt,
            healthFactorBefore: 0,
            healthFactorAfter:  0,
            keeperExecId:       "",
            txHash:             bytes32(0),
            success:            false,
            failureReason:      reason,
            loggedAt:           block.timestamp
        });

        positionActions[positionId].push(actionId);

        emit ActionFailed(actionId, positionId, reason, block.timestamp);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Get all action IDs for a position.
     */
    function getPositionActions(uint256 positionId) external view returns (uint256[] memory) {
        return positionActions[positionId];
    }

    /**
     * @notice Get action details by ID.
     */
    function getAction(uint256 actionId) external view returns (Action memory) {
        return actions[actionId];
    }

    /**
     * @notice Count successful protections for a given position.
     */
    function getSuccessCount(uint256 positionId) external view returns (uint256 count) {
        uint256[] memory ids = positionActions[positionId];
        for (uint256 i = 0; i < ids.length; i++) {
            if (actions[ids[i]].success) count++;
        }
    }
}
