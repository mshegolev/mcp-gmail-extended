#!/usr/bin/env node

if (process.argv.includes('--http')) {
  await import('../src/http.js');
} else {
  const { createServer } = await import('../src/server.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('multi-gmail-mcp server started');
}
