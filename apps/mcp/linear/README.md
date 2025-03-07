# Linear MCP Server

Model Context Protocol (MCP) server for retrieving Linear issue information. [Read more about MCP](https://modelcontextprotocol.io/introduction).

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

2. The `yarn build` command must have been run for the MCP Server to work when adding to the client.
   This should happen automatically after running `yarn` (via the `postinstall` script), but if you have any issues, run `yarn build`.

### Claude Code

**Note**: the Claude config is currently saved for the **directory you ran it from**.

If you move to a different directory, the MCP server will not be there and will need to be readded.

See [this issue](https://github.com/anthropics/claude-code/issues/374).

1. Set `MCP_LINEAR_API_KEY=YOUR_INTEGRATION_SECRET` in the root `.env.local`
2. `claude mcp add linear yarn workspace @apps/linear-mcp start`

### Cursor

Cursor executes MCP servers from outside the context of the repository, which means that it does not load environment variables, and needs an absolute path.

1. Right-click on `dist/main.js` and 'Copy path' (if `dist/main.js` is missing, you need to run `yarn build` in this folder)
2. `Settings -> Cursor Settings -> MCP -> Add MCP server`
3. Add with the following settings:
   - `name`: `Linear`
   - `type`: `command`
   - `command`: `env MCP_LINEAR_API_KEY=YOUR_INTEGRATION_SECRET node /absolute/path/to/hash/apps/mcp/linear/dist/main.js`

## Development

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) can connect to an MCP server process and test commands with it.

1. Run `yarn dev`, then open the URL it prints to the console: `MCP Inspector is up and running at http://localhost:xxxx`
2. Click `Connect` and then try commands ('Tools -> List Tools` and select a tool to run)
3. If you make changes to TS files, they will be recompiled automatically. Click `Connect` again in the Inspector for changes to take effect.

**Note**: the MCP client is watching `stdout` for messages from the server.
You can use `stderr` (e.g. `console.error`) for debug logs during development (they will show up in the inspector under 'Error output').
