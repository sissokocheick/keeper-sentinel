// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SentinelRegistry.sol";
import "../src/SentinelAction.sol";
import "../src/SentinelGuard.sol";

/**
 * @title Sentinel Contract Test Suite
 * @notice 27 Foundry tests covering the full KeeperSentinel contract stack.
 *         Tests: unit, integration, access control, fuzz, and edge cases.
 * @dev Run: forge test -vvv
 */
contract SentinelFullTest is Test {
    SentinelRegistry public registry;
    SentinelAction   public actionLog;
    SentinelGuard    public guard;

    address public constant OWNER    = address(0x1111);
    address public constant GUARDIAN = address(0x2222);
    address public constant PROTOCOL = address(0x3333); // e.g. Aave Pool
    address public constant ATTACKER = address(0x9999);
    address public constant ZERO     = address(0);

    uint256 public constant HF_1_5 = 1.5e18;
    uint256 public constant HF_1_2 = 1.2e18;
    uint256 public constant HF_2_0 = 2.0e18;

    event PositionRegistered(
        uint256 indexed positionId,
        address indexed owner,
        address indexed protocol,
        uint256 healthFactorThreshold,
        uint256 timestamp
    );
    event ActionLogged(
        uint256 indexed actionId,
        uint256 indexed positionId,
        address indexed guardian,
        SentinelAction.ActionType actionType,
        uint256 healthFactorBefore,
        uint256 healthFactorAfter,
        string keeperExecId,
        bytes32 txHash,
        uint256 timestamp
    );

    // ─── Setup ───────────────────────────────────────────────────────────────

    function setUp() public {
        vm.startPrank(OWNER);
        registry  = new SentinelRegistry();
        actionLog = new SentinelAction();
        guard     = new SentinelGuard(address(registry));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SentinelRegistry — Core Registration
    // ═══════════════════════════════════════════════════════════════════════

    function test_Registry_InitialState() public view {
        assertEq(registry.nextPositionId(), 1, "Counter starts at 1");
    }

    function test_Registry_RegisterPosition_EmitsEvent() public {
        vm.prank(OWNER);
        vm.expectEmit(true, true, true, false);
        emit PositionRegistered(1, OWNER, PROTOCOL, HF_1_5, block.timestamp);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);
    }

    function test_Registry_RegisterPosition_StoredCorrectly() public {
        vm.prank(OWNER);
        uint256 posId = registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        SentinelRegistry.Position memory pos = registry.getPosition(posId);
        assertEq(pos.id, 1, "Position ID");
        assertEq(pos.owner, OWNER, "Owner");
        assertEq(pos.protocol, PROTOCOL, "Protocol");
        assertEq(pos.hfThreshold, HF_1_5, "Threshold");
        assertEq(pos.guardian, GUARDIAN, "Guardian");
        assertTrue(pos.active, "Active flag");
        assertEq(pos.registeredAt, block.timestamp, "Timestamp");
    }

    function test_Registry_RegisterPosition_IncrementsCounter() public {
        vm.startPrank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);
        registry.registerPosition(PROTOCOL, HF_1_2, GUARDIAN);
        vm.stopPrank();
        assertEq(registry.nextPositionId(), 3, "Counter should be 3 after 2 registrations");
    }

    function test_Registry_RegisterPosition_RevertOnZeroProtocol() public {
        vm.prank(OWNER);
        vm.expectRevert("Invalid protocol");
        registry.registerPosition(ZERO, HF_1_5, GUARDIAN);
    }

    function test_Registry_RegisterPosition_RevertOnZeroGuardian() public {
        vm.prank(OWNER);
        vm.expectRevert("Invalid guardian");
        registry.registerPosition(PROTOCOL, HF_1_5, ZERO);
    }

    function test_Registry_RegisterPosition_RevertOnThresholdBelowOne() public {
        vm.prank(OWNER);
        vm.expectRevert("Threshold must be > 1.0");
        registry.registerPosition(PROTOCOL, 0.99e18, GUARDIAN);
    }

    function test_Registry_RegisterPosition_RevertOnThresholdEqualsOne() public {
        vm.prank(OWNER);
        vm.expectRevert("Threshold must be > 1.0");
        registry.registerPosition(PROTOCOL, 1e18, GUARDIAN);
    }

    function test_Registry_MultipleOwners_IsolatedPositions() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(ATTACKER);
        registry.registerPosition(PROTOCOL, HF_1_2, GUARDIAN);

        uint256[] memory ownerPos   = registry.getOwnerPositions(OWNER);
        uint256[] memory attackerPos = registry.getOwnerPositions(ATTACKER);

        assertEq(ownerPos.length,    1, "Owner has 1 position");
        assertEq(attackerPos.length, 1, "Attacker has 1 position");
        assertEq(ownerPos[0],    1, "Owner pos ID = 1");
        assertEq(attackerPos[0], 2, "Attacker pos ID = 2");
    }

    function test_Registry_UpdatePosition_OwnerCanChange() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(OWNER);
        registry.updatePosition(1, HF_1_2, false);

        SentinelRegistry.Position memory pos = registry.getPosition(1);
        assertEq(pos.hfThreshold, HF_1_2, "Threshold updated");
        assertFalse(pos.active, "Deactivated");
    }

    function test_Registry_UpdatePosition_AttackerBlocked() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(ATTACKER);
        vm.expectRevert("Not owner");
        registry.updatePosition(1, HF_1_2, true);
    }

    function test_Registry_SetGuardian_OwnerCanChange() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        address newGuardian = address(0x5555);
        vm.prank(OWNER);
        registry.setGuardian(1, newGuardian);

        SentinelRegistry.Position memory pos = registry.getPosition(1);
        assertEq(pos.guardian, newGuardian, "Guardian updated");
    }

    function test_Registry_NeedsProtection_BelowThreshold() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        assertTrue(registry.needsProtection(1, 1.3e18),  "1.3 < 1.5 → needs protection");
        assertTrue(registry.needsProtection(1, 1.0e18),  "1.0 < 1.5 → needs protection");
        assertFalse(registry.needsProtection(1, 1.5e18), "1.5 == 1.5 → no protection");
        assertFalse(registry.needsProtection(1, 2.0e18), "2.0 > 1.5 → no protection");
    }

    function test_Registry_NeedsProtection_InactivePosition() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(OWNER);
        registry.updatePosition(1, HF_1_5, false); // deactivate

        // Even if HF is critically low, inactive positions don't trigger
        assertFalse(registry.needsProtection(1, 0.1e18), "Inactive position never needs protection");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SentinelAction — Audit Log
    // ═══════════════════════════════════════════════════════════════════════

    function test_Action_LogSuccess_StoresCorrectly() public {
        uint256 id = actionLog.logSuccess(
            1,
            SentinelAction.ActionType.SupplyCollateral,
            1.3e18,
            1.8e18,
            "xhqu0kplwzt15ei9bisp2",
            bytes32(uint256(0xdeadbeef)),
            46120
        );

        SentinelAction.Action memory action = actionLog.getAction(id);
        assertTrue(action.success, "Marked success");
        assertEq(action.positionId, 1, "Position ID");
        assertEq(action.healthFactorBefore, 1.3e18, "HF before");
        assertEq(action.healthFactorAfter, 1.8e18, "HF after");
        assertEq(action.keeperExecId, "xhqu0kplwzt15ei9bisp2", "Exec ID");
        assertEq(actionLog.totalGasSaved(), 46120, "Gas saved");
    }

    function test_Action_LogFailure_EmergencyHaltType() public {
        uint256 id = actionLog.logFailure(1, "Simulation: wouldRevert=true");

        SentinelAction.Action memory action = actionLog.getAction(id);
        assertFalse(action.success, "Not success");
        assertEq(uint256(action.actionType), uint256(SentinelAction.ActionType.EmergencyHalt), "Type = EmergencyHalt");
        assertEq(action.txHash, bytes32(0), "No tx hash on failure");
        assertEq(actionLog.totalSuccessfulProtections(), 0, "No successful protection counted");
    }

    function test_Action_SuccessCounter_OnlyIncrementsOnSuccess() public {
        actionLog.logSuccess(1, SentinelAction.ActionType.SupplyCollateral, 1.3e18, 1.8e18, "e1", bytes32(0), 0);
        actionLog.logSuccess(1, SentinelAction.ActionType.RepayDebt,        1.2e18, 1.7e18, "e2", bytes32(0), 0);
        actionLog.logFailure(1, "blocked");

        assertEq(actionLog.totalSuccessfulProtections(), 2, "2 successes, 1 failure");
        assertEq(actionLog.nextActionId(), 4, "3 total actions logged");
    }

    function test_Action_GetSuccessCount_PerPosition() public {
        actionLog.logSuccess(1, SentinelAction.ActionType.SupplyCollateral, 1.3e18, 1.8e18, "a", bytes32(0), 0);
        actionLog.logSuccess(2, SentinelAction.ActionType.RepayDebt,        1.1e18, 1.6e18, "b", bytes32(0), 0);
        actionLog.logSuccess(1, SentinelAction.ActionType.SupplyCollateral, 1.4e18, 1.9e18, "c", bytes32(0), 0);

        assertEq(actionLog.getSuccessCount(1), 2, "Position 1: 2 successes");
        assertEq(actionLog.getSuccessCount(2), 1, "Position 2: 1 success");
        assertEq(actionLog.getSuccessCount(3), 0, "Position 3: 0 (never logged)");
    }

    function test_Action_CumulativeGasSaved() public {
        actionLog.logSuccess(1, SentinelAction.ActionType.SupplyCollateral, 0, 0, "a", bytes32(0), 46120);
        actionLog.logSuccess(1, SentinelAction.ActionType.RepayDebt,        0, 0, "b", bytes32(0), 21000);
        actionLog.logSuccess(1, SentinelAction.ActionType.SupplyCollateral, 0, 0, "c", bytes32(0), 65000);

        assertEq(actionLog.totalGasSaved(), 46120 + 21000 + 65000, "Gas saved accumulates correctly");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SentinelGuard — Pre-Execution Guard
    // ═══════════════════════════════════════════════════════════════════════

    function test_Guard_Allows_ValidExecution() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(GUARDIAN);
        (bool allowed, string memory reason) = guard.canExecute(1, 1.3e18);
        assertTrue(allowed, "Should allow");
        assertEq(reason, "Guard: execution authorized");
    }

    function test_Guard_Blocks_HFAboveThreshold() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(GUARDIAN);
        (bool allowed, string memory reason) = guard.canExecute(1, 1.8e18);
        assertFalse(allowed, "Should block healthy position");
        assertEq(reason, "Guard: health factor above threshold, no action needed");
    }

    function test_Guard_Blocks_UnauthorizedCaller() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(ATTACKER);
        (bool allowed, string memory reason) = guard.canExecute(1, 1.0e18);
        assertFalse(allowed, "Attacker blocked");
        assertEq(reason, "Guard: caller not authorized guardian");
    }

    function test_Guard_Blocks_InactivePosition() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);
        vm.prank(OWNER);
        registry.updatePosition(1, HF_1_5, false);

        vm.prank(GUARDIAN);
        (bool allowed, string memory reason) = guard.canExecute(1, 0.5e18);
        assertFalse(allowed, "Inactive position blocked");
        assertEq(reason, "Guard: position not active");
    }

    function test_Guard_Cooldown_Enforced() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(GUARDIAN);
        guard.recordExecution(1);

        vm.prank(GUARDIAN);
        (bool blocked, string memory reason) = guard.canExecute(1, 1.0e18);
        assertFalse(blocked, "Cooldown blocks immediate retry");
        assertEq(reason, "Guard: cooldown not elapsed");

        vm.warp(block.timestamp + 6 minutes);

        vm.prank(GUARDIAN);
        (bool allowed,) = guard.canExecute(1, 1.0e18);
        assertTrue(allowed, "Allowed after cooldown");
    }

    function test_Guard_Paused_BlocksAll() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(OWNER);
        guard.setPaused(true);

        vm.prank(GUARDIAN);
        (bool allowed, string memory reason) = guard.canExecute(1, 0.1e18);
        assertFalse(allowed, "Paused blocks all");
        assertEq(reason, "Guard: system paused");
    }

    function test_Guard_CustomCooldown_Respected() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(OWNER);
        guard.setPositionCooldown(1, 1 hours);

        vm.prank(GUARDIAN);
        guard.recordExecution(1);

        // 10 minutes later — still blocked (< 1 hour cooldown)
        vm.warp(block.timestamp + 10 minutes);
        vm.prank(GUARDIAN);
        (bool blocked,) = guard.canExecute(1, 1.0e18);
        assertFalse(blocked, "Custom cooldown (1h) not elapsed");

        // 61 minutes later — should pass
        vm.warp(block.timestamp + 51 minutes);
        vm.prank(GUARDIAN);
        (bool allowed,) = guard.canExecute(1, 1.0e18);
        assertTrue(allowed, "Allowed after 1h custom cooldown");
    }

    function test_Guard_OwnerAlsoAuthorizedAsGuardian() public {
        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        // Owner (not guardian address) should also be able to execute
        vm.prank(OWNER);
        (bool allowed,) = guard.canExecute(1, 1.0e18);
        assertTrue(allowed, "Owner is also authorized");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Fuzz Tests
    // ═══════════════════════════════════════════════════════════════════════

    function testFuzz_Registry_AlwaysBlocksThresholdAtOrBelowOne(uint256 threshold) public {
        vm.assume(threshold <= 1e18);
        vm.prank(OWNER);
        vm.expectRevert("Threshold must be > 1.0");
        registry.registerPosition(PROTOCOL, threshold, GUARDIAN);
    }

    function testFuzz_Guard_AlwaysBlocksWhenHFAboveThreshold(uint256 hf) public {
        vm.assume(hf >= HF_1_5);
        vm.assume(hf < type(uint128).max);

        vm.prank(OWNER);
        registry.registerPosition(PROTOCOL, HF_1_5, GUARDIAN);

        vm.prank(GUARDIAN);
        (bool allowed,) = guard.canExecute(1, hf);
        assertFalse(allowed, "Must block when HF >= threshold");
    }

    function testFuzz_Action_GasSavedAccumulatesCorrectly(uint256 gas1, uint256 gas2) public {
        vm.assume(gas1 < type(uint128).max);
        vm.assume(gas2 < type(uint128).max);
        vm.assume(gas1 + gas2 < type(uint256).max);

        actionLog.logSuccess(1, SentinelAction.ActionType.SupplyCollateral, 0, 0, "a", bytes32(0), gas1);
        actionLog.logSuccess(1, SentinelAction.ActionType.RepayDebt,        0, 0, "b", bytes32(0), gas2);

        assertEq(actionLog.totalGasSaved(), gas1 + gas2, "Gas accumulation correct");
    }
}
