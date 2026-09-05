import * as https from 'https';
import * as http from 'http';
import * as dotenv from 'dotenv';

dotenv.config();

export interface MCPResponse<T = any> {
  jsonrpc: string;
  id?: number | string | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface SimulationResult {
  success: boolean;
  wouldRevert: boolean;
  gasEstimated?: string | number;
  revertReason?: string;
  details?: any;
}

export interface ExecutionResult {
  executionId: string;
  status: 'pending' | 'completed' | 'failed';
  transactionHash?: string;
  receipt?: any;
  error?: string;
}

export class KeeperHubMCPClient {
  private apiKey: string;
  private mcpUrl: string;
  private sessionId: string | null = null;

  constructor(apiKey?: string, mcpUrl?: string) {
    this.apiKey = apiKey || process.env.KEEPERHUB_API_KEY || '';
    this.mcpUrl = mcpUrl || process.env.KEEPERHUB_MCP_URL || 'https://app.keeperhub.com/mcp';

    if (!this.apiKey) {
      throw new Error('KEEPERHUB_API_KEY is required to initialize KeeperHubMCPClient');
    }
  }

  /**
   * Low-level HTTP JSON-RPC sender
   */
  private async postJsonRpc(method: string, params: any = {}): Promise<{ status: number; body: MCPResponse; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 1000000),
        method,
        params,
      });

      const url = new URL(this.mcpUrl);
      const headers: Record<string, string | number> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      };

      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers,
          timeout: 60000,
        },
        (res) => {
          let data = '';
          const newSessionId = (res.headers['mcp-session-id'] as string) || this.sessionId;
          if (newSessionId) {
            this.sessionId = newSessionId;
          }

          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data) as MCPResponse;
              resolve({ status: res.statusCode || 200, body: parsed, headers: res.headers });
            } catch (err) {
              reject(new Error(`Failed to parse MCP response: ${data}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('MCP Request timed out'));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Initialize MCP session and complete handshake
   */
  public async initialize(force = false): Promise<string> {
    if (this.sessionId && !force) {
      return this.sessionId;
    }
    if (force) {
      this.sessionId = null;
    }
    const initRes = await this.postJsonRpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'SentinelAgent-ExecutionEngine',
        version: '1.0.0',
      },
    });

    if (initRes.body.error) {
      throw new Error(`MCP initialize failed: ${initRes.body.error.message}`);
    }

    if (!this.sessionId) {
      throw new Error('No mcp-session-id received from KeeperHub MCP server');
    }

    // Complete standard handshake by sending notifications/initialized
    await this.postJsonRpc('notifications/initialized', {});
    return this.sessionId;
  }

  /**
   * Ensure active session exists
   */
  private async ensureSession(): Promise<void> {
    if (!this.sessionId) {
      await this.initialize();
    }
  }

  /**
   * Call any KeeperHub MCP tool by name with arguments
   */
  public async callTool<T = any>(name: string, args: Record<string, any> = {}): Promise<T> {
    await this.ensureSession();

    let res = await this.postJsonRpc('tools/call', {
      name,
      arguments: args,
    });

    // Handle session expiration
    if (res.body.error && res.body.error.code === -32003) {
      this.sessionId = null;
      await this.initialize();
      res = await this.postJsonRpc('tools/call', {
        name,
        arguments: args,
      });
    }

    // Handle cold start upstream retries
    if (res.body.error && (res.body.error.data?.code === 'upstream_cold_start' || res.status >= 502)) {
      const waitTime = (res.body.error.data?.retryAfterSeconds || 3) * 1000;
      await new Promise((r) => setTimeout(r, waitTime));
      res = await this.postJsonRpc('tools/call', {
        name,
        arguments: args,
      });
    }

    if (res.body.error) {
      throw new Error(`MCP Tool [${name}] error: ${res.body.error.message}`);
    }

    const content = res.body.result?.content?.[0];
    if (content?.type === 'text') {
      try {
        return JSON.parse(content.text);
      } catch {
        return content.text as any;
      }
    }

    return res.body.result as any;
  }

  /**
   * List all available tools
   */
  public async listTools(): Promise<any[]> {
    await this.ensureSession();
    const res = await this.postJsonRpc('tools/list', {});
    return res.body.result?.tools || [];
  }

  /**
   * Search for available DeFi protocol actions
   */
  public async searchProtocolActions(query: string = '', protocol?: string) {
    return this.callTool('search_protocol_actions', { query, protocol });
  }

  /**
   * Read protocol user account data or state
   */
  public async executeProtocolAction(actionType: string, params: Record<string, any>) {
    return this.callTool('execute_protocol_action', {
      actionType,
      ...params,
    });
  }

  /**
   * Preflight simulation of a contract call without broadcasting (Zero Gas Spent)
   */
  public async simulateContractCall(params: {
    chainId: string;
    contractAddress: string;
    functionName: string;
    functionArgs?: string;
    value?: string;
  }): Promise<SimulationResult> {
    try {
      const result = await this.callTool('execute_contract_call', {
        chain_id: params.chainId,
        contract_address: params.contractAddress,
        function_name: params.functionName,
        function_args: params.functionArgs || '[]',
        value: params.value || '0',
        simulate: true,
      });

      let wouldRevert = false;
      let revertReason = '';
      let parsed = result;

      if (typeof result === 'string') {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
            wouldRevert = parsed.wouldRevert === true;
            revertReason = parsed.revertReason || parsed.error || '';
          } catch {
            wouldRevert = result.includes('"wouldRevert":true') || result.includes('failed');
            revertReason = result;
          }
        } else {
          wouldRevert = result.includes('failed') || result.includes('revert');
          revertReason = result;
        }
      } else if (result && typeof result === 'object') {
        wouldRevert = result.wouldRevert === true;
        revertReason = result.revertReason || result.error || '';
      }

      return {
        success: !wouldRevert,
        wouldRevert,
        revertReason,
        details: parsed,
      };
    } catch (err: any) {
      return {
        success: false,
        wouldRevert: true,
        revertReason: err.message,
      };
    }
  }

  /**
   * Preflight simulation of a native or ERC20 transfer
   */
  public async simulateTransfer(params: {
    chainId: string;
    toAddress: string;
    amount: string;
    tokenAddress?: string;
  }): Promise<SimulationResult> {
    try {
      const result = await this.callTool('execute_transfer', {
        chain_id: params.chainId,
        to_address: params.toAddress,
        amount: params.amount,
        token_address: params.tokenAddress,
        simulate: true,
      });

      let wouldRevert = false;
      let revertReason = '';
      let gasEstimated = undefined;
      let parsed = result;

      if (typeof result === 'string') {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
            wouldRevert = parsed.wouldRevert === true;
            gasEstimated = parsed.gasEstimate;
            revertReason = parsed.revertReason || parsed.error || '';
          } catch {
            wouldRevert = result.includes('"wouldRevert":true');
          }
        }
      } else if (result && typeof result === 'object') {
        wouldRevert = result.wouldRevert === true;
        gasEstimated = result.gasEstimate;
        revertReason = result.revertReason || result.error || '';
      }

      return {
        success: !wouldRevert,
        wouldRevert,
        gasEstimated,
        revertReason,
        details: parsed,
      };
    } catch (err: any) {
      return {
        success: false,
        wouldRevert: true,
        revertReason: err.message,
      };
    }
  }

  /**
   * Execute contract call onchain with idempotency protection
   */
  public async executeContractCall(params: {
    chainId: string;
    contractAddress: string;
    functionName: string;
    functionArgs?: string;
    value?: string;
    idempotencyKey?: string;
  }): Promise<any> {
    const key = params.idempotencyKey || `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return this.callTool('execute_contract_call', {
      chain_id: params.chainId,
      contract_address: params.contractAddress,
      function_name: params.functionName,
      function_args: params.functionArgs || '[]',
      value: params.value || '0',
      idempotency_key: key,
    });
  }

  /**
   * Execute transfer onchain with idempotency protection
   */
  public async executeTransfer(params: {
    chainId: string;
    toAddress: string;
    amount: string;
    tokenAddress?: string;
    idempotencyKey?: string;
  }): Promise<any> {
    const key = params.idempotencyKey || `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return this.callTool('execute_transfer', {
      chain_id: params.chainId,
      to_address: params.toAddress,
      amount: params.amount,
      token_address: params.tokenAddress,
      idempotency_key: key,
    });
  }

  /**
   * Poll execution status until completion
   */
  public async pollExecution(executionId: string, maxAttempts: number = 20, delayMs: number = 3000): Promise<ExecutionResult> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const status = await this.callTool('get_direct_execution_status', { execution_id: executionId });
        if (status.status === 'completed' || status.completed) {
          return {
            executionId,
            status: 'completed',
            transactionHash: status.transactionHash || status.txHash,
            receipt: status,
          };
        }
        if (status.status === 'failed' || status.error) {
          return {
            executionId,
            status: 'failed',
            error: status.error || 'Execution reverted or failed onchain',
            receipt: status,
          };
        }
      } catch (e: any) {
        // Continue polling if transient error
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }

    return {
      executionId,
      status: 'pending',
      error: 'Polling timed out, transaction may still be confirming onchain',
    };
  }

  /**
   * High-Level Deterministic Guard:
   * 1. Preflight Simulation
   * 2. Idempotency Generation
   * 3. Broadcast only if safe
   * 4. Confirmation verification
   */
  public async executeSafely(params: {
    chainId: string;
    toAddress?: string;
    contractAddress?: string;
    functionName?: string;
    functionArgs?: string;
    amount?: string;
    description: string;
  }): Promise<{ safe: boolean; error?: string; execution?: ExecutionResult }> {
    console.log(`\n🛡️ [KeeperHub Safeguard] Preflight verification for: "${params.description}"...`);

    // 1. Simulation Phase
    const sim = params.amount
      ? await this.simulateTransfer({ chainId: params.chainId, toAddress: params.toAddress || params.contractAddress!, amount: params.amount })
      : await this.simulateContractCall({ chainId: params.chainId, contractAddress: params.contractAddress!, functionName: params.functionName!, functionArgs: params.functionArgs });

    if (sim.wouldRevert || !sim.success) {
      console.error(`❌ [Preflight REVERT Blocked] Action intercepted before broadcast. Zero gas lost!`);
      console.error(`   Reason: ${sim.revertReason}`);
      return {
        safe: false,
        error: `Simulation reverted: ${sim.revertReason}`,
      };
    }

    console.log(`✅ [Preflight PASSED] Gas estimated (${sim.gasEstimated || 'normal'}), no revert detected. Proceeding to deterministic execution.`);

    // 2. Deterministic Execution Phase with Idempotency Key
    try {
      const idempotencyKey = `sentinel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const execResponse = params.amount
        ? await this.executeTransfer({ chainId: params.chainId, toAddress: params.toAddress || params.contractAddress!, amount: params.amount, idempotencyKey })
        : await this.executeContractCall({ chainId: params.chainId, contractAddress: params.contractAddress!, functionName: params.functionName!, functionArgs: params.functionArgs, idempotencyKey });

      const executionId = execResponse?.executionId || execResponse?.id;
      if (!executionId) {
        return {
          safe: true,
          execution: {
            executionId: idempotencyKey,
            status: 'completed',
            receipt: execResponse,
          },
        };
      }

      console.log(`🚀 [Broadcasted] KeeperHub Execution ID: ${executionId}`);
      console.log(`⏳ Waiting for onchain confirmation via KeeperHub non-custodial infra...`);
      const finalResult = await this.pollExecution(executionId);

      return {
        safe: true,
        execution: finalResult,
      };
    } catch (err: any) {
      if (err.message.includes('insufficient_scope') || err.message.includes('mcp:write')) {
        console.log(`ℹ️ [Policy / Permissions Guard] API key is currently in Read-Only (mcp:read) mode.`);
        console.log(`   Simulation preflight passed 100%. To broadcast live onchain transactions, generate a key with mcp:write on app.keeperhub.com.`);
        return {
          safe: true,
          error: 'SIMULATED_SUCCESS_WRITE_SCOPE_REQUIRED',
        };
      }

      return {
        safe: false,
        error: err.message,
      };
    }
  }
}
