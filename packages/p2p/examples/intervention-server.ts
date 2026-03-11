/**
 * A2A Server Human Intervention Example
 * Demonstrates complete integration flow for human participation in agent conversations
 */

import * as http from 'http';
import {
  A2AIntegationServer,
  type AgentRegistry,
  type A2AInterventionConfig,
} from '../src/integration/a2a-integration.js';
import {
  INTERVENTION_METHODS,
  createInterventionRequest,
} from '../src/integration/jsonrpc-methods.js';
import type { A2AMessage, JSONRPCResponse } from '@clawchat/core';
import type { AgentConnection } from '../src/intervention/router.js';

// ============================================
// Mock Agent Registry
// ============================================

class MockAgentRegistry implements AgentRegistry {
  private agents: Map<string, AgentConnection[]> = new Map();
  private messages: Map<string, A2AMessage[]> = new Map();

  /**
   * Register agents for a conversation
   */
  registerAgents(conversationId: string, agents: AgentConnection[]): void {
    this.agents.set(conversationId, agents);
    console.log(`[Registry] Registered ${agents.length} agents for conversation ${conversationId}`);
  }

  /**
   * Get agents in a conversation
   */
  async getAgents(conversationId: string): Promise<AgentConnection[]> {
    return this.agents.get(conversationId) ?? [];
  }

  /**
   * Send message to an agent
   */
  async sendMessage(agentId: string, message: A2AMessage): Promise<void> {
    console.log(`[Registry] Sending message to agent ${agentId}:`, message.parts?.[0]);
    // In a real implementation, this would route to the actual agent
    if (!this.messages.has(agentId)) {
      this.messages.set(agentId, []);
    }
    this.messages.get(agentId)!.push(message);
  }

  /**
   * Get messages sent to an agent (for testing)
   */
  getAgentMessages(agentId: string): A2AMessage[] {
    return this.messages.get(agentId) ?? [];
  }
}

// ============================================
// HTTP Client Helper
// ============================================

class InterventionClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Send JSON-RPC request
   */
  async sendRequest(method: string, params: unknown): Promise<JSONRPCResponse> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now(),
      });

      const url = new URL('/intervention', this.baseUrl);

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data) as JSONRPCResponse);
            } catch (error) {
              reject(error);
            }
          });
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Create SSE connection
   */
  connectSSE(
    conversationId: string,
    participantId: string,
    onEvent: (event: string, data: unknown) => void
  ): Promise<http.ClientRequest> {
    return new Promise((resolve) => {
      const url = new URL(
        `/intervention/events/${conversationId}/${participantId}`,
        this.baseUrl
      );

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'GET',
        },
        (res) => {
          let buffer = '';
          res.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  onEvent(data.event ?? 'message', data);
                } catch {
                  // Ignore parse errors
                }
              } else if (line.startsWith('event: ')) {
                const event = line.slice(7);
                console.log(`[SSE] Event: ${event}`);
              }
            }
          });
        }
      );

      req.on('error', (error) => {
        console.error('[SSE] Connection error:', error.message);
      });

      req.end();
      resolve(req);
    });
  }
}

// ============================================
// Example Server Setup
// ============================================

async function createExampleServer(port: number = 3000): Promise<{
  server: http.Server;
  integration: A2AIntegationServer;
  registry: MockAgentRegistry;
}> {
  // Create agent registry
  const registry = new MockAgentRegistry();

  // Create integration server
  const config: Partial<A2AInterventionConfig> = {
    enableIntervention: true,
    defaultRole: 'participant',
    maxParticipantsPerConversation: 5,
    interventionCooldown: 500,
    autoPauseOnConflict: true,
  };

  const integration = new A2AIntegationServer(config);
  integration.setAgentRegistry(registry);
  integration.startHeartbeat();

  // Create HTTP server
  const server = http.createServer((req, res) => {
    integration.handleRequest(req, res);
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[Server] Listening on port ${port}`);
      resolve({ server, integration, registry });
    });
  });
}

// ============================================
// Demo Scenarios
// ============================================

async function runDemo(): Promise<void> {
  console.log('='.repeat(60));
  console.log('A2A Human Intervention Integration Demo');
  console.log('='.repeat(60));
  console.log();

  const PORT = 3001;
  const { server, integration, registry } = await createExampleServer(PORT);

  const client = new InterventionClient(`http://localhost:${PORT}`);

  try {
    // ----------------------------------------
    // Scenario 1: Create Conversation
    // ----------------------------------------
    console.log('[Demo] Scenario 1: Creating a guided conversation');
    console.log('-'.repeat(40));

    const conversationId = 'demo-conv-001';
    const createResult = await client.sendRequest(
      INTERVENTION_METHODS.CREATE_CONVERSATION,
      {
        conversationId,
        enableIntervention: true,
        defaultRole: 'participant',
        maxParticipants: 5,
        hooks: [
          {
            point: 'on_decision_point',
            enabled: true,
            requireHumanResponse: true,
            timeout: 30000,
          },
        ],
      }
    );

    console.log('[Demo] Conversation created:', createResult.result);
    console.log();

    // ----------------------------------------
    // Scenario 2: Register Agents
    // ----------------------------------------
    console.log('[Demo] Scenario 2: Registering agents');
    console.log('-'.repeat(40));

    registry.registerAgents(conversationId, [
      {
        agentId: 'agent-001',
        endpoint: 'http://localhost:4001',
        capabilities: ['chat', 'analysis'],
        lastSeen: Date.now(),
      },
      {
        agentId: 'agent-002',
        endpoint: 'http://localhost:4002',
        capabilities: ['chat', 'translation'],
        lastSeen: Date.now(),
      },
    ]);

    console.log('[Demo] Agents registered for conversation');
    console.log();

    // ----------------------------------------
    // Scenario 3: Human Joins Conversation
    // ----------------------------------------
    console.log('[Demo] Scenario 3: Human joins conversation');
    console.log('-'.repeat(40));

    const joinResult = await client.sendRequest(INTERVENTION_METHODS.JOIN, {
      conversationId,
      participantId: 'human-alice',
      role: 'moderator',
    });

    console.log('[Demo] Join result:', JSON.stringify(joinResult.result, null, 2));
    console.log();

    // Also join as a participant
    await client.sendRequest(INTERVENTION_METHODS.JOIN, {
      conversationId,
      participantId: 'human-bob',
      role: 'participant',
    });

    console.log('[Demo] Two humans joined the conversation');
    console.log();

    // ----------------------------------------
    // Scenario 4: Setup SSE Connection
    // ----------------------------------------
    console.log('[Demo] Scenario 4: Setting up SSE connection');
    console.log('-'.repeat(40));

    const sseConnection = await client.connectSSE(
      conversationId,
      'human-alice',
      (event, data) => {
        console.log(`[SSE Event] ${event}:`, JSON.stringify(data, null, 2));
      }
    );

    console.log('[Demo] SSE connection established');
    console.log();

    // Wait a moment for SSE to settle
    await new Promise((resolve) => setTimeout(resolve, 100));

    // ----------------------------------------
    // Scenario 5: List Sessions
    // ----------------------------------------
    console.log('[Demo] Scenario 5: Listing sessions');
    console.log('-'.repeat(40));

    const sessionsResult = await client.sendRequest(INTERVENTION_METHODS.LIST_SESSIONS, {
      conversationId,
    });

    console.log('[Demo] Sessions:', JSON.stringify(sessionsResult.result, null, 2));
    console.log();

    // ----------------------------------------
    // Scenario 6: Human Sends Message
    // ----------------------------------------
    console.log('[Demo] Scenario 6: Human sends intervention message');
    console.log('-'.repeat(40));

    const sendResult = await client.sendRequest(INTERVENTION_METHODS.SEND, {
      conversationId,
      participantId: 'human-alice',
      action: 'send_message',
      content: 'Please focus on the technical aspects of the problem.',
    });

    console.log('[Demo] Send result:', JSON.stringify(sendResult.result, null, 2));
    console.log();

    // ----------------------------------------
    // Scenario 7: Pause Conversation
    // ----------------------------------------
    console.log('[Demo] Scenario 7: Pause conversation');
    console.log('-'.repeat(40));

    const pauseResult = await client.sendRequest(INTERVENTION_METHODS.PAUSE, {
      conversationId,
      participantId: 'human-alice',
      reason: 'Need to review the current state',
    });

    console.log('[Demo] Pause result:', JSON.stringify(pauseResult.result, null, 2));
    console.log();

    // ----------------------------------------
    // Scenario 8: Request Clarification
    // ----------------------------------------
    console.log('[Demo] Scenario 8: Request clarification from agent');
    console.log('-'.repeat(40));

    const clarifyResult = await client.sendRequest(
      INTERVENTION_METHODS.REQUEST_CLARIFICATION,
      {
        conversationId,
        participantId: 'human-bob',
        content: 'Can you explain your reasoning?',
        targetAgentId: 'agent-001',
      }
    );

    console.log('[Demo] Clarification result:', JSON.stringify(clarifyResult.result, null, 2));
    console.log();

    // ----------------------------------------
    // Scenario 9: Get Pending Interventions
    // ----------------------------------------
    console.log('[Demo] Scenario 9: Get pending interventions');
    console.log('-'.repeat(40));

    const pendingResult = await client.sendRequest(INTERVENTION_METHODS.GET_PENDING, {
      conversationId,
    });

    console.log('[Demo] Pending interventions:', JSON.stringify(pendingResult.result, null, 2));
    console.log();

    // ----------------------------------------
    // Scenario 10: Resume Conversation
    // ----------------------------------------
    console.log('[Demo] Scenario 10: Resume conversation');
    console.log('-'.repeat(40));

    const resumeResult = await client.sendRequest(INTERVENTION_METHODS.RESUME, {
      conversationId,
      participantId: 'human-alice',
    });

    console.log('[Demo] Resume result:', JSON.stringify(resumeResult.result, null, 2));
    console.log();

    // ----------------------------------------
    // Scenario 11: Simulate Agent Message with Hook
    // ----------------------------------------
    console.log('[Demo] Scenario 11: Simulate agent message with hook');
    console.log('-'.repeat(40));

    const agentMessage: A2AMessage = {
      role: 'agent',
      parts: [{ type: 'text', text: 'I need a decision: should I proceed with option A or B?' }],
      contextId: conversationId,
      timestamp: Date.now(),
    };

    // This will trigger the on_decision_point hook
    await integration.handleAgentMessage(conversationId, 'agent-001', agentMessage);

    console.log('[Demo] Agent message processed (hook should trigger SSE event)');
    console.log();

    // Wait for SSE events
    await new Promise((resolve) => setTimeout(resolve, 500));

    // ----------------------------------------
    // Scenario 12: Get Server Stats
    // ----------------------------------------
    console.log('[Demo] Scenario 12: Get server stats');
    console.log('-'.repeat(40));

    const stats = integration.getStats();
    console.log('[Demo] Server stats:', JSON.stringify(stats, null, 2));
    console.log();

    // ----------------------------------------
    // Scenario 13: Human Leaves
    // ----------------------------------------
    console.log('[Demo] Scenario 13: Human leaves conversation');
    console.log('-'.repeat(40));

    // Get the session ID first
    const sessions = (sessionsResult.result as { id: string; humanParticipantId?: string }[]);
    const aliceSession = sessions.find((s) => s.humanParticipantId === 'human-alice');

    if (aliceSession) {
      const leaveResult = await client.sendRequest(INTERVENTION_METHODS.LEAVE, {
        conversationId,
        sessionId: aliceSession.id,
      });

      console.log('[Demo] Leave result:', JSON.stringify(leaveResult.result, null, 2));
    }
    console.log();

    // ----------------------------------------
    // Cleanup
    // ----------------------------------------
    console.log('[Demo] Cleaning up...');

    sseConnection.destroy();
    integration.destroy();

    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('[Demo] Server closed');
        resolve();
      });
    });

    console.log();
    console.log('='.repeat(60));
    console.log('Demo completed successfully!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('[Demo] Error:', error);
    server.close();
    process.exit(1);
  }
}

// ============================================
// Run Demo
// ============================================

// Run demo if this file is executed directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  runDemo().catch(console.error);
}

export {
  createExampleServer,
  MockAgentRegistry,
  InterventionClient,
  runDemo,
};