// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./src/SentinelRegistry.sol";
import "./src/SentinelAction.sol";
import "./src/SentinelGuard.sol";

/**
 * @title SentinelFactory
 * @notice Deploy all three KeeperSentinel contracts in one atomic transaction.
 *         Emits the addresses of all deployed contracts for easy indexing.
 */
contract SentinelFactory {
    event Deployed(
        address indexed registry,
        address indexed actionLog,
        address indexed guard,
        address deployer,
        uint256 timestamp
    );

    SentinelRegistry public registry;
    SentinelAction   public actionLog;
    SentinelGuard    public guard;

    constructor() {
        registry  = new SentinelRegistry();
        actionLog = new SentinelAction();
        guard     = new SentinelGuard(address(registry));

        emit Deployed(
            address(registry),
            address(actionLog),
            address(guard),
            msg.sender,
            block.timestamp
        );
    }
}
