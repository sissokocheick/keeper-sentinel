/**
 * deploy-sentinel.ts
 * ─────────────────────────────────────────────────────────────────────
 * Standalone deployment script using viem + compiled Hardhat artifacts.
 * Deploys SentinelRegistry, SentinelAction, SentinelGuard on Base Sepolia,
 * then registers an Aave v3 position monitored by our KeeperHub wallet.
 *
 * Run: npx tsx scripts/deploy-sentinel.ts
 *
 * Requires in .env:
 *   DEPLOYER_PRIVATE_KEY  = hex private key (with or without 0x prefix)
 *   BASE_SEPOLIA_RPC      = RPC URL (optional, defaults to public endpoint)
 * ─────────────────────────────────────────────────────────────────────
 */
import { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env') });

// ─── Load compiled artifacts ────────────────────────────────────────────────

function loadArtifact(contractName: string) {
  const paths = [
    join(ROOT, 'artifacts', 'contracts', 'src', `${contractName}.sol`, `${contractName}.json`),
    join(ROOT, 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      const art = JSON.parse(readFileSync(p, 'utf8'));
      return { abi: art.abi, bytecode: art.bytecode as `0x${string}` };
    }
  }
  throw new Error(`Artifact for ${contractName} not found. Run 'npm run compile' first.`);
}

async function main() {
  // ─── Validate env ─────────────────────────────────────────────────────────
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rawKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not set in .env');
    console.error('   Add your wallet private key to .env:');
    console.error('   DEPLOYER_PRIVATE_KEY=your_private_key_here');
    process.exit(1);
  }

  const privateKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const rpcUrl = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
  const keeperWallet = (process.env.WALLET_ADDRESS || '') as `0x${string}`;
  const aavePool = (process.env.AAVE_POOL_BASE_SEPOLIA || '0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b') as `0x${string}`;

  // ─── Setup clients ────────────────────────────────────────────────────────
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

  console.log('\n🚀 KeeperSentinel — Contract Deployment to Base Sepolia');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`   Network  : Base Sepolia (chainId 84532)`);
  console.log(`   Deployer : ${account.address}`);

  const balance = await publicClient.getBalance({ address: account.address });
  const ethBal = Number(balance) / 1e18;
  console.log(`   Balance  : ${ethBal.toFixed(6)} ETH`);

  if (ethBal < 0.001) {
    console.error('\n❌ Insufficient balance! You need at least 0.001 ETH on Base Sepolia.');
    console.error('   Get free testnet ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet');
    console.error('   Or: https://faucet.quicknode.com/base/sepolia');
    process.exit(1);
  }

  // ─── Load artifacts ───────────────────────────────────────────────────────
  console.log('\n📦 Loading compiled contract artifacts...');
  const registry = loadArtifact('SentinelRegistry');
  const action   = loadArtifact('SentinelAction');
  const guard    = loadArtifact('SentinelGuard');
  console.log('   ✅ All artifacts loaded (compiled with solc 0.8.20)');

  const addresses: Record<string, string> = {};
  const txHashes: Record<string, string> = {};

  // ─── Deploy SentinelRegistry ──────────────────────────────────────────────
  console.log('\n[1/3] Deploying SentinelRegistry...');
  const regHash = await walletClient.deployContract({
    abi: registry.abi,
    bytecode: registry.bytecode,
    args: [],
  });
  console.log(`   📨 Deploy tx: ${regHash}`);
  console.log(`   ⏳ Waiting for confirmation...`);
  const regReceipt = await publicClient.waitForTransactionReceipt({ hash: regHash, timeout: 120_000 });
  addresses.SentinelRegistry = regReceipt.contractAddress!;
  txHashes.SentinelRegistry = regHash;
  console.log(`   ✅ SentinelRegistry: ${addresses.SentinelRegistry}`);
  console.log(`   🔗 https://sepolia.basescan.org/address/${addresses.SentinelRegistry}`);

  // ─── Deploy SentinelAction ────────────────────────────────────────────────
  console.log('\n[2/3] Deploying SentinelAction...');
  const actHash = await walletClient.deployContract({
    abi: action.abi,
    bytecode: action.bytecode,
    args: [],
  });
  console.log(`   📨 Deploy tx: ${actHash}`);
  console.log(`   ⏳ Waiting for confirmation...`);
  const actReceipt = await publicClient.waitForTransactionReceipt({ hash: actHash, timeout: 120_000 });
  addresses.SentinelAction = actReceipt.contractAddress!;
  txHashes.SentinelAction = actHash;
  console.log(`   ✅ SentinelAction: ${addresses.SentinelAction}`);
  console.log(`   🔗 https://sepolia.basescan.org/address/${addresses.SentinelAction}`);

  // ─── Deploy SentinelGuard ─────────────────────────────────────────────────
  console.log('\n[3/3] Deploying SentinelGuard...');
  const guardHash = await walletClient.deployContract({
    abi: guard.abi,
    bytecode: guard.bytecode,
    args: [addresses.SentinelRegistry as `0x${string}`],
  });
  console.log(`   📨 Deploy tx: ${guardHash}`);
  console.log(`   ⏳ Waiting for confirmation...`);
  const guardReceipt = await publicClient.waitForTransactionReceipt({ hash: guardHash, timeout: 120_000 });
  addresses.SentinelGuard = guardReceipt.contractAddress!;
  txHashes.SentinelGuard = guardHash;
  console.log(`   ✅ SentinelGuard: ${addresses.SentinelGuard}`);
  console.log(`   🔗 https://sepolia.basescan.org/address/${addresses.SentinelGuard}`);

  // ─── Register Aave position ───────────────────────────────────────────────
  console.log('\n[4/4] Registering Aave v3 position in SentinelRegistry...');
  const guardian = keeperWallet || account.address;
  try {
    const regPosHash = await walletClient.writeContract({
      address: addresses.SentinelRegistry as `0x${string}`,
      abi: registry.abi,
      functionName: 'registerPosition',
      args: [
        aavePool,
        BigInt('1500000000000000000'),  // 1.5e18 = health factor threshold
        guardian as `0x${string}`,
      ],
    });
    const regPosReceipt = await publicClient.waitForTransactionReceipt({ hash: regPosHash, timeout: 60_000 });
    txHashes.RegisterPosition = regPosHash;
    console.log(`   ✅ Position #1 registered! Tx: ${regPosHash}`);
    console.log(`   🔗 https://sepolia.basescan.org/tx/${regPosHash}`);
  } catch (e: any) {
    console.warn(`   ⚠️  Position registration skipped: ${e.message}`);
  }

  // ─── Save deployment info ─────────────────────────────────────────────────
  const deployment = {
    network: 'Base Sepolia',
    chainId: 84532,
    deployer: account.address,
    deployedAt: new Date().toISOString(),
    contracts: addresses,
    deployTransactions: txHashes,
    basescanLinks: Object.fromEntries(
      Object.entries(addresses).map(([name, addr]) => [
        name,
        `https://sepolia.basescan.org/address/${addr}`,
      ])
    ),
    aavePool,
    guardian,
    positionId: 1,
    healthFactorThreshold: '1.5',
  };

  const outPath = join(ROOT, 'deployed-contracts.json');
  writeFileSync(outPath, JSON.stringify(deployment, null, 2));

  // ─── Final summary ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅  ALL 3 CONTRACTS DEPLOYED ON BASE SEPOLIA');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`\n   SentinelRegistry : ${addresses.SentinelRegistry}`);
  console.log(`   SentinelAction   : ${addresses.SentinelAction}`);
  console.log(`   SentinelGuard    : ${addresses.SentinelGuard}`);
  console.log(`\n📄 Full deployment info saved → deployed-contracts.json`);
  console.log(`\n🔍 Verify on BaseScan:`);
  Object.entries(addresses).forEach(([name, addr]) => {
    console.log(`   ${name}: https://sepolia.basescan.org/address/${addr}`);
  });
  console.log('');
}

main().catch((err) => {
  console.error('\n❌ Deployment failed:', err.message || err);
  process.exit(1);
});
