import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer } from 'ws';
import { agentEventBus } from './agentEventBus';
import { logger } from '../logger/logger';

class DebugGuiServer {
  private static instance: DebugGuiServer;
  private server!: http.Server;
  private wss!: WebSocketServer;
  private port: number;
  private wsPort: number;
  private started: boolean = false;

  private constructor(port = 3000, wsPort = 3001) {
    this.port = port;
    this.wsPort = wsPort;
    this.setupHttpServer();
    this.setupWebSocketServer();
  }

  public static getInstance(): DebugGuiServer {
    if (!DebugGuiServer.instance) {
      DebugGuiServer.instance = new DebugGuiServer();
    }
    return DebugGuiServer.instance;
  }

  private setupHttpServer() {
    this.server = http.createServer(async (req, res) => {
      if (!req.url) {
        res.writeHead(400);
        res.end("No URL");
        return;
      }

      // Add CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Decode the URL to handle special characters in agent IDs
      const decodedUrl = decodeURIComponent(req.url);

      // Serve HTML and JS
      if (decodedUrl === '/' || decodedUrl === '/debugGui.html') {
        const filePath = path.join(__dirname, 'debugGui.html');
        try {
          const content = fs.readFileSync(filePath);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
        } catch (err) {
          res.writeHead(404);
          res.end("Not Found");
        }
        return;
      }
      if (decodedUrl === '/debugGui.js') {
        const filePath = path.join(__dirname, 'debugGui.js');
        try {
          const content = fs.readFileSync(filePath);
          res.writeHead(200, { 'Content-Type': 'application/javascript' });
          res.end(content);
        } catch (err) {
          res.writeHead(404);
          res.end("Not Found");
        }
        return;
      }

      // /agents -> list agents
      if (decodedUrl.startsWith('/agents')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const agents = agentEventBus.getAllAgents().map(a => ({ 
          id: a.id, 
          name: a.id.replace(/%20/g, ' ') // Clean up display name
        }));
        res.end(JSON.stringify(agents));
        return;
      }

      // /agent/:id/:endpoint
      const agentMatch = decodedUrl.match(/^\/agent\/([^/]+)\/([^/]+)$/);
      if (agentMatch) {
        const agentId = agentMatch[1];
        const endpoint = agentMatch[2];
        const agentInfo = agentEventBus.getAgent(agentId);
        if (!agentInfo) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Agent not found' }));
          return;
        }

        switch (endpoint) {
          case 'system-prompt':
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(agentInfo.systemPrompt);
            return;
          case 'chat-history':
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(agentInfo.chatHistory));
            return;
          case 'ai-response':
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(agentInfo.aiResponse || '');
            return;
          case 'logs':
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(agentInfo.logs));
            return;
          case 'llm-requests':
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(agentInfo.llmRequests || []));
            return;
          default:
            res.writeHead(404);
            res.end('Not found');
            return;
        }
      }

      // POST /agent/:id/message
      const postMatch = decodedUrl.match(/^\/agent\/([^/]+)\/message$/);
      if (postMatch && req.method === 'POST') {
        const agentId = postMatch[1];
        const agentInfo = agentEventBus.getAgent(agentId);
        if (!agentInfo) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Agent not found' }));
          return;
        }
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const message = data.message;
            if (!message) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'No message provided' }));
              return;
            }
            agentInfo.agentInstance.addUserMessage(message);
            const result = await agentInfo.agentInstance.run();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: result.success, output: result.output }));
          } catch (err) {
            logger.error("Error processing POST message:", err);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end("Feather Debug GUI. Hit / to view.");
    });
  }

  private setupWebSocketServer() {
    this.wss = new WebSocketServer({ noServer: true });
    this.server.on('upgrade', (request, socket, head) => {
      const url = request.url || '';
      if (url.includes('debug')) {
        this.wss.handleUpgrade(request, socket, head, ws => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
    this.wss.on('connection', ws => {
      const agents = agentEventBus.getAllAgents().map(a => ({ id: a.id, name: a.id }));
      ws.send(JSON.stringify({ type: 'agents', agents }));

      const handleNewSession = (data: any) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'newAgentSession', ...data }));
        }
      };
      const handleSystemPromptUpdated = (data: any) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'systemPromptUpdated', ...data }));
        }
      };
      const handleChatHistoryUpdated = (data: any) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'chatHistoryUpdated', ...data }));
        }
      };
      const handleAgentResponseUpdated = (data: any) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'aiResponseUpdated', ...data }));
        }
      };
      const handleAgentLogsUpdated = (data: any) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'agentLogsUpdated', ...data }));
        }
      };
      const handleLlmRequestsUpdated = (data: any) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'llmRequestsUpdated', ...data }));
        }
      };

      agentEventBus.on('newAgentSession', handleNewSession);
      agentEventBus.on('systemPromptUpdated', handleSystemPromptUpdated);
      agentEventBus.on('chatHistoryUpdated', handleChatHistoryUpdated);
      agentEventBus.on('aiResponseUpdated', handleAgentResponseUpdated);
      agentEventBus.on('agentLogsUpdated', handleAgentLogsUpdated);
      agentEventBus.on('llmRequestsUpdated', handleLlmRequestsUpdated);

      ws.on('close', () => {
        agentEventBus.removeListener('newAgentSession', handleNewSession);
        agentEventBus.removeListener('systemPromptUpdated', handleSystemPromptUpdated);
        agentEventBus.removeListener('chatHistoryUpdated', handleChatHistoryUpdated);
        agentEventBus.removeListener('aiResponseUpdated', handleAgentResponseUpdated);
        agentEventBus.removeListener('agentLogsUpdated', handleAgentLogsUpdated);
        agentEventBus.removeListener('llmRequestsUpdated', handleLlmRequestsUpdated);
      });
    });
  }

  public startServer() {
    if (this.started) return;
    this.started = true;
    this.server.listen(this.port, () => {
      logger.info(`Feather debug GUI at http://localhost:${this.port}`);
    });
  }
}

export const debugGuiServer = DebugGuiServer.getInstance();