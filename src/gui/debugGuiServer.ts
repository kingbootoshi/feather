import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer } from 'ws';
import { agentEventBus } from './agentEventBus';
import { logger } from '../logger/logger';

/**
 * DebugGuiServer handles the GUI for the Feather framework,
 * serving the debug HTML/JS files and managing the WebSocket connections
 * that provide real-time updates on agent activity.
 */
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

  /**
   * Sets up an HTTP server that serves the debug GUI HTML and JS,
   * as well as API endpoints for retrieving agent data.
   */
  private setupHttpServer() {
    this.server = http.createServer(async (req, res) => {
      if (!req.url) {
        res.writeHead(400);
        res.end("No URL");
        return;
      }

      // Add CORS headers for ease of access
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Decode the URL in case it has special characters
      const decodedUrl = decodeURIComponent(req.url);

      // Serve the main debug GUI files
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

      // Endpoint to list all agents
      if (decodedUrl.startsWith('/agents')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const agents = agentEventBus.getAllAgents().map(a => ({ 
          id: a.id, 
          name: a.id.replace(/%20/g, ' ') // Clean up display name
        }));
        res.end(JSON.stringify(agents));
        return;
      }

      // Regex to match /agent/:id/:endpoint
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

        // Respond with agent data depending on the endpoint
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

      // POST /agent/:id/message - send a message to the agent
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
            // Add the message as user input and then run the agent
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

      // If no route matched, serve a default response
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end("Feather Debug GUI. Hit / to view.");
    });
  }

  /**
   * Sets up the WebSocket server to allow real-time communication
   * about agent events (new session, updated chat, logs, etc.)
   */
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
      // When a new connection is established, send the current agent list
      const agents = agentEventBus.getAllAgents().map(a => ({ id: a.id, name: a.id }));
      ws.send(JSON.stringify({ type: 'agents', agents }));

      // Define event handlers for relevant agent events
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

      // Listen to agent event bus
      agentEventBus.on('newAgentSession', handleNewSession);
      agentEventBus.on('systemPromptUpdated', handleSystemPromptUpdated);
      agentEventBus.on('chatHistoryUpdated', handleChatHistoryUpdated);
      agentEventBus.on('aiResponseUpdated', handleAgentResponseUpdated);
      agentEventBus.on('agentLogsUpdated', handleAgentLogsUpdated);
      agentEventBus.on('llmRequestsUpdated', handleLlmRequestsUpdated);

      // Clean up when the socket closes
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

  /**
   * Starts the server if not already started. 
   * If the initial port is taken, tries subsequent ports until a free one is found.
   * Logs the listening port.
   */
  public startServer() {
    if (this.started) return;

    const tryPort = (port: number) => {
      return new Promise<number>((resolve, reject) => {
        // Create a test server to check if port is available
        const testServer = http.createServer();
        testServer.once('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            // Port is in use, try next port
            testServer.close(() => resolve(tryPort(port + 1)));
          } else {
            reject(err);
          }
        });
        testServer.once('listening', () => {
          // Port is free, close test server and start actual server
          testServer.close(() => {
            this.server.listen(port, () => {
              this.started = true;
              logger.info(`Feather debug GUI at http://localhost:${port}`);
              resolve(port);
            });
          });
        });
        testServer.listen(port);
      });
    };

    // Start trying ports from the initial port
    tryPort(this.port).catch(err => {
      logger.error({ err }, "Failed to start debug GUI server");
    });
  }
}

export const debugGuiServer = DebugGuiServer.getInstance();