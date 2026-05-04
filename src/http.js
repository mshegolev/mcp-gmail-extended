import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { createServer } from './server.js';

const PORT = parseInt(process.env.GMAIL_MCP_HTTP_PORT ?? '3765', 10);

const app = createMcpExpressApp();

// Session ID → transport. One entry per connected MCP client.
const transports = new Map();

app.all('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    let transport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId);
    } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: id => {
          transports.set(id, transport);
          console.error(`[gmail-mcp] session opened: ${id} (${transports.size} active)`);
        },
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) {
          transports.delete(id);
          console.error(`[gmail-mcp] session closed: ${id} (${transports.size} active)`);
        }
      };
      // Each session gets its own server instance → isolated activeAccount state
      await createServer().connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: missing or invalid session' },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[gmail-mcp] request error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

const httpServer = createHttpServer(app);

httpServer.listen(PORT, '127.0.0.1', () => {
  console.error(`[gmail-mcp] HTTP server listening on http://127.0.0.1:${PORT}/mcp`);
});

async function shutdown() {
  console.error('[gmail-mcp] shutting down...');
  for (const t of transports.values()) {
    await t.close().catch(() => {});
  }
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
