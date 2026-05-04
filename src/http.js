import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { createServer } from './server.js';

const PORT = parseInt(process.env.GMAIL_MCP_HTTP_PORT ?? '3765', 10);

const app = createMcpExpressApp();

// Session ID → transport for both protocols
const transports = new Map();

// ---------------------------------------------------------------------------
// StreamableHTTP — newer clients (Claude Code, cron agents)
// URL: http://127.0.0.1:3765/mcp
// ---------------------------------------------------------------------------
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
          console.error(`[gmail-mcp] StreamableHTTP session opened: ${id} (${transports.size} active)`);
        },
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) {
          transports.delete(id);
          console.error(`[gmail-mcp] StreamableHTTP session closed: ${id} (${transports.size} active)`);
        }
      };
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
    console.error('[gmail-mcp] /mcp error:', err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

// ---------------------------------------------------------------------------
// SSE — Claude Desktop (uses older 2024-11-05 SSE protocol)
// URL to put in claude_desktop_config.json: http://127.0.0.1:3765/sse
// ---------------------------------------------------------------------------
app.get('/sse', async (req, res) => {
  try {
    const transport = new SSEServerTransport('/messages', res);
    transports.set(transport.sessionId, transport);
    console.error(`[gmail-mcp] SSE session opened: ${transport.sessionId} (${transports.size} active)`);

    transport.onclose = () => {
      transports.delete(transport.sessionId);
      console.error(`[gmail-mcp] SSE session closed: ${transport.sessionId} (${transports.size} active)`);
    };

    await createServer().connect(transport);
  } catch (err) {
    console.error('[gmail-mcp] /sse error:', err);
    if (!res.headersSent) res.status(500).send('SSE error');
  }
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).send('Session not found');
    return;
  }
  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    console.error('[gmail-mcp] /messages error:', err);
    if (!res.headersSent) res.status(500).send('Error');
  }
});

// ---------------------------------------------------------------------------

const httpServer = createHttpServer(app);

httpServer.listen(PORT, '127.0.0.1', () => {
  console.error(`[gmail-mcp] HTTP server listening on http://127.0.0.1:${PORT}`);
  console.error(`  StreamableHTTP : /mcp  (Claude Code / cron agents)`);
  console.error(`  SSE            : /sse  (Claude Desktop)`);
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
