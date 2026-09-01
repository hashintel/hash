# Example configuration files

## In this directory

This directory contains example configuration files that can be used as a reference when configuring this repository locally (for example, when using this monorepo with a given IDE).

> [!NOTE]  
> The configuration files in this directory are not automatically used by their respective programs or tools by default. **Action has to be taken to use them.**

## Outside this directory

### AI-enabled development

In the monorepo root, we include:

- an [`AGENTS.md`](/AGENTS.md) file for standing instructions, which is symlinked to from elsewhere (e.g. `CLAUDE.md` used by [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) proxies to `AGENTS.md`)
- [`.agents/skills`](/.agents/skills) for on-demand Agent Skills. Claude Code also reads aliases under [`.claude/skills`](/.claude/skills).
