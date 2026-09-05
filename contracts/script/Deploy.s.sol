// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SentinelRegistry.sol";
import "../src/SentinelAction.sol";
import "../src/SentinelGuard.sol";

/**
 * @title Deploy
 * @notice Foundry deployment script for the full KeeperSentinel contract stack.
 *
 * Usage (Base Sepolia):
 *   forge script contracts/script/Deploy.s.sol:Deploy \
 *     --rpc-url https://sepolia.base.org \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --broadcast \
 *     --verify
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address keeperWallet = vm.envOr("WALLET_ADDRESS", deployer);
        address aavePool = vm.envOr("AAVE_POOL_BASE_SEPOLIA", address(0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b));

        console.log("Deploying KeeperSentinel contracts from:", deployer);

        vm.startBroadcast(deployerKey);

        // 1. Deploy Registry
        SentinelRegistry registry = new SentinelRegistry();
        console.log("SentinelRegistry:", address(registry));

        // 2. Deploy Action Log
        SentinelAction actionLog = new SentinelAction();
        console.log("SentinelAction:", address(actionLog));

        // 3. Deploy Guard (depends on registry)
        SentinelGuard guard = new SentinelGuard(address(registry));
        console.log("SentinelGuard:", address(guard));

        // 4. Register Aave v3 position
        uint256 positionId = registry.registerPosition(
            aavePool,
            1.5e18,        // healthFactorThreshold
            keeperWallet   // guardian = KeeperHub wallet
        );
        console.log("Registered position ID:", positionId);

        vm.stopBroadcast();
    }
}
