# Example configuration files

## In this directory

This directory contains example configuration files that can be used as a reference when configuring this repository locally (for example, when using this monorepo with a given IDE).

> [!NOTE]  
> The configuration files in this directory are not automatically used by their respective programs or tools by default. **Action has to be taken to use them.**

## Outside this directory

### AI-enabled development

In the monorepo root, we include:

- an [`AGENTS.md`](/AGENTS.md) file for guiding various AI coding tools, which is symlinked to from elsewhere (e.g. `CLAUDE.md` used by [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) proxies to `AGENTS.md`)
- a [`.config/agents`](/.config/agents) directory containing [rules](https://docs.cursor.com/context/rules-for-ai) used by Cursor, Windsurf, Cline, Augment, and OpenAI Codex (symlinked to from their respective expected paths).
