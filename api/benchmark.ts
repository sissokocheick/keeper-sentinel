import type { VercelRequest, VercelResponse } from '@vercel/node';
import { KeeperHubMCPClient } from '../src/keeperhub-client.js';
import { GasOptimizer } from '../src/gas-optimizer.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const client = new KeeperHubMCPClient();
    const optimizer = new GasOptimizer(client);
    const benchmark = optimizer.calculateBenchmark(5);
    return res.status(200).json(benchmark);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Benchmark error' });
  }
}
