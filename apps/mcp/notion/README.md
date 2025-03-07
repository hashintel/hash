# Notion MCP Server

Model Context Protocol (MCP) server for searching for and retrieving Notion documents. [Read more about MCP](https://modelcontextprotocol.io/introduction).

## Tools

- Search Notion pages by title
- Retrieve Notion page content as markdown

## Installation

### Prerequisites

1. If you are a HASH employee:
   - Get the shared Notion MCP API key
2. If you are setting up a new Notion integration
   - Create a [Notion integration](https://www.notion.so/profile/integrations)
   - Ensure the integration can 'Read content' (the MCP Server does not require anything else)
   - Copy the API key

**Note**: the integration can only access pages which have been specifically shared with it, via the context menu in Notion.
Sharing a page will also automatically share its children (direct and indirect).

3. The `yarn build` command must have been run for the MCP Server to work when adding to the client.
   This should happen automatically after running `yarn` (via the `postinstall` script), but if you have any issues, run `yarn build`.

### Claude Code

**Note**: the Claude config is currently saved for the **directory you ran it from**.

If you move to a different directory, the MCP server will not be there and will need to be readded.

See [this issue](https://github.com/anthropics/claude-code/issues/374).

1. Set `MCP_NOTION_API_KEY=YOUR_INTEGRATION_SECRET` in the root `.env.local`
2. `claude mcp add notion yarn workspace @apps/notion-mcp start`

### Cursor

Cursor executes MCP servers from outside the context of the repository, which means that it does not load environment variables automatically, and needs an absolute path.

1. Right-click on `dist/main.js` and 'Copy path' (if `dist/main.js` is missing, you need to run `yarn build` in this folder)
1. `Settings -> Cursor Settings -> MCP -> Add MCP server`
2. Add with the following settings:
   - `name`: `Notion`
   - `type`: `command`
   - `command`: `env MCP_NOTION_API_KEY=YOUR_INTEGRATION_SECRET node /absolute/path/to/hash/apps/mcp/notion/dist/main.js`

## Development

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) can connect to an MCP server process and test commands with it.

1. Run `yarn dev`, then open the URL it prints to the console: `MCP Inspector is up and running at http://localhost:xxxx`
2. Click `Connect` and then try commands ('Tools -> List Tools` and select a tool to run)
3. If you make changes to TS files, they will be recompiled automatically. Click `Connect` again in the Inspector for changes to take effect.

**Note**: the MCP client is watching `stdout` for messages from the server.
You can use `stderr` (e.g. `console.error`) for debug logs during development (they will show up in the inspector under 'Error output').
