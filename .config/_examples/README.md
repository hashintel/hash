# Example configuration files

## In this directory

This directory contains example configuration files that can be used as a reference when configuring this repository locally (for example, when using this monorepo with a given IDE).

> [!NOTE]  
> The configuration files in this directory are not automatically used by their respective programs or tools by default. **Action has to be taken to use them.**

## Outside this directory

### AI-enabled development

In the monorepo root, we include:

- a [`CLAUDE.md`](/CLAUDE.md) file for guiding [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)
- a [`.cursor`](/.cursor) directory containing [rules](https://docs.cursor.com/context/rules-for-ai)

We also bundle a series of HASH-developed MCP servers specific to our internal workflows in [`/apps/mcp`](/apps/mcp), allowing Linear tickets and associated information to be accessed as context, as well as specifications from Notion.
