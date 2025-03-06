# Linear MCP Server

Model Context Protocol (MCP) server for basic Linear operations. [Read more about MCP](https://modelcontextprotocol.io/introduction).

## Tools

### List issues

- List issues in the current sprint:
  - Title
  - Description
  - Assignee name (if any)
  - State (e.g. In Progress)

### Get issue details

- Get a single issue (including threaded comments)

### Add comment to issue

- Add a comment to an issue

## Installation

### Prerequisites

1. Generate an API Key in Linear `Settings -> Security & access`
2. Add a `.env.local` file in this directory and set `LINEAR_API_KEY=your_api_key`

### Claude Code

**Note**: the Claude config is currently saved for the **directory you ran it from**.

If you move to a different directory, the MCP server will not be there and will need to be readded.

See [this issue](https://github.com/anthropics/claude-code/issues/374).

`claude mcp add linear yarn workspace @apps/linear-mcp start`

### Cursor

1. `Settings -> Cursor Settings -> MCP -> Add MCP server`
2. Add with the following settings:
   - `name`: `Linear`
   - `type`: `command`
   - `command`: `turbo run start --filter @apps/linear-mcp`

## Development

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) can connect to an MCP server process and test commands with it.

1. Run `yarn dev`, then open the URL it prints to the console: `MCP Inspector is up and running at http://localhost:xxxx`
2. Click `Connect` and then try commands ('Tools -> List Tools` and select a tool to run)
3. If you make changes to TS files, they will be recompiled automatically. Click `Connect` again in the Inspector for changes to take effect.

**Note**: the MCP client is watching `stdout` for messages from the server.
You can use `stderr` (e.g. `console.error`) for debug logs during development (they will show up in the inspector under 'Error output').
