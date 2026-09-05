/**
 * deploy-contracts.ts
 * ────────────────────────────────────────────────────────────────────
 * Deploys SentinelRegistry, SentinelAction, and SentinelGuard contracts
 * to Base Sepolia using viem + the wallet's private key.
 *
 * Usage:
 *   npx tsx scripts/deploy-contracts.ts
 *
 * Required env vars in .env:
 *   DEPLOYER_PRIVATE_KEY  — 64-char hex private key (no 0x prefix needed)
 *   BASE_SEPOLIA_RPC      — Base Sepolia RPC URL (defaults to public endpoint)
 * ────────────────────────────────────────────────────────────────────
 */

import { createWalletClient, createPublicClient, http, parseGwei } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// ─── Bytecodes (compiled by Hardhat) ─────────────────────────────────────────
// These will be loaded from artifacts after compilation
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts', 'contracts');

function loadBytecode(contractPath: string, contractName: string): `0x${string}` {
  const artifactPath = path.join(ARTIFACTS_DIR, contractPath, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found at ${artifactPath}. Run 'npm run compile' first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return artifact.bytecode as `0x${string}`;
}

function loadAbi(contractPath: string, contractName: string): any[] {
  const artifactPath = path.join(ARTIFACTS_DIR, contractPath, `${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return artifact.abi;
}

async function main() {
  // ─── Validate env ──────────────────────────────────────────────────────────
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rawKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set in .env');
  }
  const privateKey = rawKey.startsWith('0x') ? rawKey as `0x${string}` : `0x${rawKey}` as `0x${string}`;

  const rpcUrl = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';

  // ─── Setup clients ─────────────────────────────────────────────────────────
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  console.log('\n🚀 KeeperSentinel Contract Deployment');
  console.log('════════════════════════════════════════');
  console.log(`   Network  : Base Sepolia (chainId 84532)`);
  console.log(`   Deployer : ${account.address}`);
  console.log(`   RPC      : ${rpcUrl}`);

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  const ethBalance = Number(balance) / 1e18;
  console.log(`   Balance  : ${ethBalance.toFixed(6)} ETH`);

  if (ethBalance < 0.001) {
    console.warn('\n⚠️  Low balance! Get testnet ETH from https://www.coinbase.com/faucets/base-ethereum-goerli-faucet');
    console.warn('   Or: https://faucet.quicknode.com/base/sepolia');
  }

  // ─── Load artifacts ────────────────────────────────────────────────────────
  console.log('\n📦 Loading compiled artifacts...');
  const registryBytecode = loadBytecode('src/SentinelRegistry.sol', 'SentinelRegistry');
  const actionBytecode   = loadBytecode('src/SentinelAction.sol', 'SentinelAction');
  const guardBytecode    = loadBytecode('src/SentinelGuard.sol', 'SentinelGuard');
  const registryAbi = loadAbi('src/SentinelRegistry.sol', 'SentinelRegistry');
  const guardAbi    = loadAbi('src/SentinelGuard.sol', 'SentinelGuard');
  console.log('   ✅ Artifacts loaded');

  // ─── Deploy SentinelRegistry ───────────────────────────────────────────────
  console.log('\n[1/3] Deploying SentinelRegistry...');
  const registryDeployHash = await walletClient.deployContract({
    abi: registryAbi,
    bytecode: registryBytecode,
    args: [],
  });
  console.log(`   📨 Tx sent: ${registryDeployHash}`);

  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryDeployHash, timeout: 120_000 });
  const registryAddress = registryReceipt.contractAddress!;
  console.log(`   ✅ SentinelRegistry deployed at: ${registryAddress}`);
  console.log(`   🔗 https://sepolia.basescan.org/address/${registryAddress}`);

  // ─── Deploy SentinelAction ─────────────────────────────────────────────────
  console.log('\n[2/3] Deploying SentinelAction...');
  const actionDeployHash = await walletClient.deployContract({
    abi: loadAbi('src/SentinelAction.sol', 'SentinelAction'),
    bytecode: actionBytecode,
    args: [],
  });
  console.log(`   📨 Tx sent: ${actionDeployHash}`);

  const actionReceipt = await publicClient.waitForTransactionReceipt({ hash: actionDeployHash, timeout: 120_000 });
  const actionAddress = actionReceipt.contractAddress!;
  console.log(`   ✅ SentinelAction deployed at: ${actionAddress}`);
  console.log(`   🔗 https://sepolia.basescan.org/address/${actionAddress}`);

  // ─── Deploy SentinelGuard (takes registry address as constructor arg) ───────
  console.log('\n[3/3] Deploying SentinelGuard...');
  const guardDeployHash = await walletClient.deployContract({
    abi: guardAbi,
    bytecode: guardBytecode,
    args: [registryAddress],
  });
  console.log(`   📨 Tx sent: ${guardDeployHash}`);

  const guardReceipt = await publicClient.waitForTransactionReceipt({ hash: guardDeployHash, timeout: 120_000 });
  const guardAddress = guardReceipt.contractAddress!;
  console.log(`   ✅ SentinelGuard deployed at: ${guardAddress}`);
  console.log(`   🔗 https://sepolia.basescan.org/address/${guardAddress}`);

  // ─── Register our KeeperHub wallet as guardian ────────────────────────────
  console.log('\n[4/3] Registering Aave v3 position in SentinelRegistry...');
  const keeperWallet = process.env.WALLET_ADDRESS || account.address;
  const aavePool = process.env.AAVE_POOL_BASE_SEPOLIA || '0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b';

  try {
    const registerHash = await walletClient.writeContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'registerPosition',
      args: [
        aavePool as `0x${string}`,         // protocol (Aave v3)
        BigInt('1500000000000000000'),       // hfThreshold = 1.5e18
        keeperWallet as `0x${string}`,     // guardian = our KeeperHub wallet
      ],
    });
    const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerHash, timeout: 60_000 });
    console.log(`   ✅ Position registered! Tx: ${registerHash}`);
    console.log(`   🔗 https://sepolia.basescan.org/tx/${registerHash}`);
  } catch (err: any) {
    console.warn(`   ⚠️  Registration skipped: ${err.message}`);
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  const deployedAddresses = {
    network: 'Base Sepolia',
    chainId: 84532,
    deployer: account.address,
    contracts: {
      SentinelRegistry: registryAddress,
      SentinelAction:   actionAddress,
      SentinelGuard:    guardAddress,
    },
    transactions: {
      SentinelRegistry: registryDeployHash,
      SentinelAction:   actionDeployHash,
      SentinelGuard:    guardDeployHash,
    },
    basescanLinks: {
      SentinelRegistry: `https://sepolia.basescan.org/address/${registryAddress}`,
      SentinelAction:   `https://sepolia.basescan.org/address/${actionAddress}`,
      SentinelGuard:    `https://sepolia.basescan.org/address/${guardAddress}`,
    },
    deployedAt: new Date().toISOString(),
  };

  // Save addresses
  const outPath = path.join(__dirname, '..', 'deployed-contracts.json');
  fs.writeFileSync(outPath, JSON.stringify(deployedAddresses, null, 2));

  console.log('\n════════════════════════════════════════');
  console.log('✅ ALL CONTRACTS DEPLOYED SUCCESSFULLY');
  console.log('════════════════════════════════════════');
  console.log(`\n   SentinelRegistry : ${registryAddress}`);
  console.log(`   SentinelAction   : ${actionAddress}`);
  console.log(`   SentinelGuard    : ${guardAddress}`);
  console.log(`\n📄 Addresses saved to: deployed-contracts.json`);
  console.log(`\n🔍 View all on BaseScan:`);
  console.log(`   https://sepolia.basescan.org/address/${registryAddress}`);
  console.log(`   https://sepolia.basescan.org/address/${actionAddress}`);
  console.log(`   https://sepolia.basescan.org/address/${guardAddress}`);

  return deployedAddresses;
}

main()
  .then((result) => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Deployment failed:', err.message);
    process.exit(1);
  });
