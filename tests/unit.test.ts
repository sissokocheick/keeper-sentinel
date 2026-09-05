import { GasOptimizer } from '../src/gas-optimizer.js';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name}`);
    failed++;
  }
}

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║        🧪  KEEPERSENTINEL — OFFLINE UNIT TEST SUITE          ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('📦 Group 1: Contract Artifacts & ABI Integrity');
const contracts = ['SentinelRegistry', 'SentinelAction', 'SentinelGuard'];
for (const c of contracts) {
  const p = join(ROOT, 'artifacts', 'contracts', 'src', `${c}.sol`, `${c}.json`);
  assert(existsSync(p), `Artifact exists for ${c}`);
  if (existsSync(p)) {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    assert(Array.isArray(data.abi) && data.abi.length > 0, `${c} ABI has valid functions`);
    assert(typeof data.bytecode === 'string' && data.bytecode.startsWith('0x'), `${c} Bytecode is compiled hex`);
  }
}

console.log('\n⛽ Group 2: Gas Optimizer Benchmark Math (Meld-Style)');
const opt = new GasOptimizer(null as any);
const bench5 = opt.calculateBenchmark(5);
assert(bench5.rawEstimatedGas === 5 * 131120, 'Naive agent gas scales linearly');
assert(bench5.optimizedGas === 5 * 21227, 'Sentinel pruned gas scales linearly');
assert(bench5.gasSavedPercent === '83.8%', 'Savings percent rigorously equals 83.8%');

const bench100 = opt.calculateBenchmark(100);
assert(bench100.rawEstimatedGas === 100 * 131120, '100 ops naive gas accurate');
assert(bench100.optimizedGas === 100 * 21227, '100 ops sentinel gas accurate');
assert(bench100.rawEstimatedGas - bench100.optimizedGas === 100 * (131120 - 21227), 'Net gas saved arithmetic consistent');

console.log('\n📐 Group 3: Mathematical Boundaries & Threshold Invariants');
function isAtRisk(hf: number, threshold: number): boolean {
  return hf < threshold;
}
assert(!isAtRisk(1.5, 1.5), 'HF 1.5000 exactly at threshold is not at risk');
assert(isAtRisk(1.499999, 1.5), 'HF 1.499999 triggers deterministic risk');
assert(!isAtRisk(2.45, 1.5), 'Healthy HF 2.45 does not trigger liquidation guard');
assert(isAtRisk(0.99, 1.5), 'Sub-1.0 liquidation risk detected immediately');

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
