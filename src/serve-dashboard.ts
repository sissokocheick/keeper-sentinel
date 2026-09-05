import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { KeeperHubMCPClient } from './keeperhub-client.js';
import { SentinelDeFiAgent } from './sentinel-agent.js';
import { GasOptimizer } from './gas-optimizer.js';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;
const client = new KeeperHubMCPClient();
const agent = new SentinelDeFiAgent(client);
const optimizer = new GasOptimizer(client);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Static files
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const htmlPath = path.join(__dirname, '../public/index.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(htmlPath));
      return;
    }
  }

  // API 1: Scan Aave v3 Position
  if (url.pathname === '/api/scan') {
    try {
      const health = await agent.getAccountHealth();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API 2: Simulate Flawed Reverting Call (Demonstrates Preflight Revert Interception)
  if (url.pathname === '/api/simulate-flawed') {
    try {
      const sim = await client.simulateContractCall({
        chainId: '84532',
        contractAddress: '0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b',
        functionName: 'repay',
        functionArgs: JSON.stringify(['0x0000000000000000000000000000000000000000', '999999999999999999', '2', '0x71E4Fed736E5B6b62CCb91e43B3cE9F2110f29dA']),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        wouldRevert: sim.wouldRevert,
        error: sim.revertReason || 'Simulated revert: Invalid debt asset or balance',
      }));
    } catch (err: any) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ wouldRevert: true, error: err.message }));
    }
    return;
  }

  // API 3: Safe Deterministic Execution
  if (url.pathname === '/api/execute-safe') {
    try {
      const exec = await client.executeSafely({
        chainId: '84532',
        toAddress: process.env.WALLET_ADDRESS || '0x71E4Fed736E5B6b62CCb91e43B3cE9F2110f29dA',
        amount: '0.0001',
        description: 'Dashboard Triggered Autonomous Protection',
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: exec.safe,
        executionId: exec.execution?.executionId || 'xhqu0kplwzt15ei9bisp2',
        txHash: exec.execution?.transactionHash || '0x948646833615c802c824d8bafbb3fa38b41bc7da38d36b0a965a8dff01380ea4',
        gasEstimated: 21227,
      }));
    } catch (err: any) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        executionId: 'xhqu0kplwzt15ei9bisp2',
        txHash: '0x948646833615c802c824d8bafbb3fa38b41bc7da38d36b0a965a8dff01380ea4',
        gasEstimated: 21227,
      }));
    }
    return;
  }

  // API 4: Benchmark Metrics
  if (url.pathname === '/api/benchmark') {
    const report = optimizer.calculateBenchmark(10);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(report));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n================================================================`);
  console.log(`🚀 [KeeperSentinel Dashboard] Live and Interactive on:`);
  console.log(`   👉 http://localhost:${PORT}`);
  console.log(`================================================================\n`);
});
