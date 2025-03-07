# Model Context Protocol (MCP) server

The MCP is a protocol for providing context to AI models from external services. [Read more about it here](https://modelcontextprotocol.io/introduction).

This folder contains basic MCP servers for interacting with Linear and Notion. See their respective `README.md` files for installation.

You may also wish to use:

## GitHub

1. Generate a Personal Access Token in your `Profile -> Developer Settings`.
2. You can use classic (repo scope) or fine-grained (choose whichever repos you want access to, and the scopes you want it to have, e.g. read/write Contents, Commits, Pull Requests, Issues)
3. In `Cursor -> Settings -> Cursor Settings -> MCP`
   - `Add MCP server`
   - `Name: github`
   - `Type: command`
   - `env GITHUB_PERSONAL_ACCESS_TOKEN=your_token npx -y @modelcontextprotocol/server-github`

## FileSystem

- Configuration should be automatically added in Cursor via `.cursor/mcp.json` in this repo, which you can verify in Cursor MCP Settings.
