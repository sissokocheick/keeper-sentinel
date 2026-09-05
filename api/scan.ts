import type { VercelRequest, VercelResponse } from '@vercel/node';
import { KeeperHubMCPClient } from '../src/keeperhub-client.js';
import { SentinelDeFiAgent } from '../src/sentinel-agent.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const client = new KeeperHubMCPClient();
    await client.initialize();
    const agent = new SentinelDeFiAgent(client);
    const health = await agent.getAccountHealth();
    return res.status(200).json(health);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Scan failed' });
  }
}
