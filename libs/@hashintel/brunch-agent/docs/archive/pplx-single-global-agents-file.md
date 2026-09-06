<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# is there a single global (user-level) AGENTS.md location

Yes—**for OpenAI Codex**, the user-level/global location is:

```text
~/.codex/AGENTS.md
```

More precisely, Codex uses its home directory, which defaults to `~/.codex` but can be relocated with `CODEX_HOME`. At that global level it loads exactly one non-empty file:

1. `~/.codex/AGENTS.override.md`, if present
2. otherwise `~/.codex/AGENTS.md`[^1_1]

So, for a portable setup:

```sh
mkdir -p "${CODEX_HOME:-$HOME/.codex}"
$EDITOR "${CODEX_HOME:-$HOME/.codex}/AGENTS.md"
```


## Scope and precedence

Treat the global file as your **personal, cross-repository defaults**—communication preferences, preferred package managers, test expectations, code-review habits, and so on. Repository and nested-directory instruction files are then added with more specific scope, so they can supersede conflicting global guidance.[^1_1]

A sensible global file might be:

```md
# Personal defaults

- Prefer TypeScript with strict typing; avoid `any`.
- Before editing, inspect the local AGENTS.md files and existing conventions.
- Run the narrowest relevant checks before reporting completion.
- Keep changes minimal and explain non-obvious trade-offs.
- Do not alter lockfiles or dependencies unless necessary.
```


## Is it universal?

No. There is **not yet a single cross-agent standard user-level path** that every coding agent honors. The proposed `~/.config/agents/AGENTS.md` convention is an open community-standardization idea, rather than something broadly implemented. Different tools retain tool-specific global instruction locations—for example, Claude Code conventionally uses `~/.claude/CLAUDE.md`, while Codex uses `~/.codex/AGENTS.md`.[^1_2]

If you want one canonical source of truth across tools, keep it in a dotfiles repository and symlink or generate each tool’s native configuration file from it.

<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_3][^1_4][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://learn.chatgpt.com/docs/agent-configuration/agents-md

[^1_2]: https://github.com/agentsmd/agents.md/issues/91

[^1_3]: https://github.com/openai/codex/blob/main/docs/agents_md.md

[^1_4]: https://github.com/openai/codex/issues/27705

[^1_5]: https://github.com/openai/codex/issues/23788

[^1_6]: https://github.com/openai/codex/issues/3043

[^1_7]: https://kirill-markin.com/articles/codex-rules-for-ai/

[^1_8]: https://www.codegateway.dev/en/blog/agents-md-playbook-2026

[^1_9]: https://eastondev.com/blog/en/posts/ai/20260626-codex-agents-md-project-rules/

[^1_10]: https://agentsmd.io/how-to-use-agents-md-in-codex

[^1_11]: https://www.verdent.ai/guides/codex-agents-md-explained

[^1_12]: https://codex.danielvaughan.com/2026/03/26/agents-md-advanced-patterns/

[^1_13]: https://www.agensi.io/learn/codex-cli-agents-md-complete-guide

[^1_14]: https://note.com/dyve/n/n8634107f8e47?hl=en

[^1_15]: https://blakecrosley.com/guides/codex

