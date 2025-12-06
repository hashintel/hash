import { MCPClient } from '@mastra/mcp';

// Build servers configuration
// Supports both URL-based (Zapier) and command-based (Hacker News) servers
const servers: Record<string, { url: URL } | { command: string; args: string[] }> = {
  zapier: {
    url: new URL(process.env.ZAPIER_MCP_URL || ''),
  },
  hackernews: {
    command: 'npx',
    args: ['-y', '@devabdultech/hn-mcp-server'],
  },
};

const mcp = new MCPClient({
  id: 'mcp-client-id',
  servers,
});

// Initialize MCP tools - fetches all available tools from configured MCP servers
const mcpTools = await mcp.listTools();

export { mcp, mcpTools };
