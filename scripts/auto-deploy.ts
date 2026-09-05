/**
 * auto-deploy.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fully Autonomous Smart Contract Deployer for KeeperSentinel
 *
 * 1. Generates an ephemeral deployer account on Base Sepolia.
 * 2. Seeds it with 0.01 ETH directly from KeeperHub wallet via MCP execute_transfer.
 * 3. Compiles & deploys SentinelRegistry, SentinelAction, SentinelGuard onchain.
 * 4. Registers Aave v3 monitored position with KeeperHub wallet as Guardian.
 * 5. Sweeps remaining ETH back to KeeperHub wallet.
 * 6. Generates deployed-contracts.json with real onchain addresses & BaseScan links.
 *
 * Zero manual private keys — 100% autonomous on-chain infrastructure!
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, createPublicClient, http, formatEther, parseEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import { KeeperHubMCPClient } from '../src/keeperhub-client.js';
import * as dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env') });

function loadArtifact(contractName: string) {
  const p = join(ROOT, 'artifacts', 'contracts', 'src', `${contractName}.sol`, `${contractName}.json`);
  if (!existsSync(p)) {
    throw new Error(`Artifact for ${contractName} not found at ${p}. Run 'npm run compile' first.`);
  }
  const art = JSON.parse(readFileSync(p, 'utf8'));
  return { abi: art.abi, bytecode: art.bytecode as `0x${string}` };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🚀  AUTONOMOUS CONTRACT DEPLOYMENT — BASE SEPOLIA (84532)  ║');
  console.log('║   Powered by KeeperHub MCP Execution Layer                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const rpcUrl = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
  const keeperWalletAddress = (process.env.WALLET_ADDRESS || '0x71E4Fed736E5B6b62CCb91e43B3cE9F2110f29dA') as `0x${string}`;
  const aavePool = (process.env.AAVE_POOL_BASE_SEPOLIA || '0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b') as `0x${string}`;

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  // Check KeeperHub wallet balance
  const keeperBal = await publicClient.getBalance({ address: keeperWalletAddress });
  console.log(`🏦 KeeperHub Wallet: ${keeperWalletAddress}`);
  console.log(`   Balance: ${formatEther(keeperBal)} ETH`);

  // Step 1: Generate ephemeral deployer wallet
  console.log('\n[Step 1/5] Generating ephemeral deployer account...');
  const deployerKey = generatePrivateKey();
  const deployerAccount = privateKeyToAccount(deployerKey);
  console.log(`   Deployer Address: ${deployerAccount.address}`);

  // Step 2: Fund deployer wallet via KeeperHub MCP execute_transfer
  console.log('\n[Step 2/5] Funding deployer wallet via KeeperHub MCP execute_transfer (0.01 ETH)...');
  const mcpClient = new KeeperHubMCPClient();
  await mcpClient.initialize();

  const fundRes = await mcpClient.executeTransfer({
    chainId: '84532',
    toAddress: deployerAccount.address,
    amount: '0.01',
  });

  console.log(`   📨 Transfer executed!`);
  console.log(`   Execution ID: ${fundRes.executionId}`);
  if (fundRes.transactionHash) {
    console.log(`   Tx Hash: ${fundRes.transactionHash}`);
    console.log(`   🔗 https://sepolia.basescan.org/tx/${fundRes.transactionHash}`);
  }

  // Wait for funds to be available onchain
  console.log('   ⏳ Waiting for deployer balance to confirm...');
  let deployerBal = 0n;
  for (let i = 0; i < 30; i++) {
    deployerBal = await publicClient.getBalance({ address: deployerAccount.address });
    if (deployerBal >= parseEther('0.005')) break;
    await sleep(2000);
  }
  console.log(`   ✅ Deployer funded: ${formatEther(deployerBal)} ETH`);

  // Step 3: Setup viem wallet client for deployment
  const walletClient = createWalletClient({
    account: deployerAccount,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  // Step 4: Deploy all 3 contracts
  console.log('\n[Step 3/5] Deploying Sentinel smart contracts on Base Sepolia...');

  const registryArt = loadArtifact('SentinelRegistry');
  const actionArt   = loadArtifact('SentinelAction');
  const guardArt    = loadArtifact('SentinelGuard');

  // 4a. SentinelRegistry
  console.log('   [1/3] Deploying SentinelRegistry...');
  const regHash = await walletClient.deployContract({
    abi: registryArt.abi,
    bytecode: registryArt.bytecode,
    args: [],
  });
  console.log(`         Deploy tx: ${regHash}`);
  const regReceipt = await publicClient.waitForTransactionReceipt({ hash: regHash, timeout: 120_000 });
  const registryAddress = regReceipt.contractAddress!;
  console.log(`         ✅ SentinelRegistry deployed at: ${registryAddress}`);
  console.log(`         🔗 https://sepolia.basescan.org/address/${registryAddress}`);

  // 4b. SentinelAction
  console.log('   [2/3] Deploying SentinelAction...');
  const actHash = await walletClient.deployContract({
    abi: actionArt.abi,
    bytecode: actionArt.bytecode,
    args: [],
  });
  console.log(`         Deploy tx: ${actHash}`);
  const actReceipt = await publicClient.waitForTransactionReceipt({ hash: actHash, timeout: 120_000 });
  const actionAddress = actReceipt.contractAddress!;
  console.log(`         ✅ SentinelAction deployed at: ${actionAddress}`);
  console.log(`         🔗 https://sepolia.basescan.org/address/${actionAddress}`);

  // 4c. SentinelGuard
  console.log('   [3/3] Deploying SentinelGuard...');
  const guardHash = await walletClient.deployContract({
    abi: guardArt.abi,
    bytecode: guardArt.bytecode,
    args: [registryAddress],
  });
  console.log(`         Deploy tx: ${guardHash}`);
  const guardReceipt = await publicClient.waitForTransactionReceipt({ hash: guardHash, timeout: 120_000 });
  const guardAddress = guardReceipt.contractAddress!;
  console.log(`         ✅ SentinelGuard deployed at: ${guardAddress}`);
  console.log(`         🔗 https://sepolia.basescan.org/address/${guardAddress}`);

  // Step 5: Register position in SentinelRegistry
  console.log('\n[Step 4/5] Registering Aave v3 Position in SentinelRegistry...');
  const regPosHash = await walletClient.writeContract({
    address: registryAddress,
    abi: registryArt.abi,
    functionName: 'registerPosition',
    args: [
      aavePool,
      1500000000000000000n, // 1.5e18 threshold
      keeperWalletAddress,  // guardian
    ],
  });
  console.log(`   Register tx: ${regPosHash}`);
  await publicClient.waitForTransactionReceipt({ hash: regPosHash, timeout: 60_000 });
  console.log(`   ✅ Position registered with Guardian: ${keeperWalletAddress}`);
  console.log(`   🔗 https://sepolia.basescan.org/tx/${regPosHash}`);

  // Step 6: Return remaining balance back to KeeperHub wallet
  console.log('\n[Step 5/5] Sweeping remaining gas funds back to KeeperHub wallet...');
  const remainingBal = await publicClient.getBalance({ address: deployerAccount.address });
  const gasReserve = parseEther('0.0005');
  let sweepTx = '';
  if (remainingBal > gasReserve) {
    const refundAmount = remainingBal - gasReserve;
    try {
      sweepTx = await walletClient.sendTransaction({
        to: keeperWalletAddress,
        value: refundAmount,
      });
      console.log(`   Swept ${formatEther(refundAmount)} ETH back to ${keeperWalletAddress}`);
      console.log(`   Tx: ${sweepTx}`);
    } catch (e: any) {
      console.log(`   Sweep note: ${e.message}`);
    }
  }

  // Save deployment artifact
  const deploymentRecord = {
    network: 'Base Sepolia',
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    deployerAddress: deployerAccount.address,
    keeperHubWallet: keeperWalletAddress,
    aavePoolAddress: aavePool,
    contracts: {
      SentinelRegistry: registryAddress,
      SentinelAction: actionAddress,
      SentinelGuard: guardAddress,
    },
    transactions: {
      fundingTx: fundRes.transactionHash,
      SentinelRegistryDeploy: regHash,
      SentinelActionDeploy: actHash,
      SentinelGuardDeploy: guardHash,
      PositionRegisterTx: regPosHash,
      sweepTx: sweepTx || undefined,
    },
    basescan: {
      SentinelRegistry: `https://sepolia.basescan.org/address/${registryAddress}`,
      SentinelAction: `https://sepolia.basescan.org/address/${actionAddress}`,
      SentinelGuard: `https://sepolia.basescan.org/address/${guardAddress}`,
    },
  };

  const outFile = join(ROOT, 'deployed-contracts.json');
  writeFileSync(outFile, JSON.stringify(deploymentRecord, null, 2));

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           🎉 DEPLOYMENT COMPLETE & VERIFIED ONCHAIN          ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ SentinelRegistry : ${registryAddress.padEnd(42)}║`);
  console.log(`║ SentinelAction   : ${actionAddress.padEnd(42)}║`);
  console.log(`║ SentinelGuard    : ${guardAddress.padEnd(42)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n📄 Deployment saved to: deployed-contracts.json`);
}

main().catch((err) => {
  console.error('\n❌ Auto-deployment failed:', err);
  process.exit(1);
});
