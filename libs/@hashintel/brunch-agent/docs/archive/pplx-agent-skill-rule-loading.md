<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# I'm trying to clarify agent skill- and rules-loading behaviour in different harnesses: the agent I'm working with researched codex and cursor, and came up with the following results; I want to determine definitively what claude and pi are known to do:


______________________________________________________________________

## Codex: git root down to launch dir, plus user home

If you start Codex in `libs/@hashintel/petrinaut`, it finds the Git root, then concatenates every `AGENTS.md` on the path **from that root down to CWD**:

1. `~/.codex/AGENTS.md` (or `AGENTS.override.md` if that exists)
2. repo-root `AGENTS.md`
3. any intermediate `AGENTS.md` on the path
4. the subdirectory `AGENTS.md`

Deeper files are appended later, so they win on conflict. Sibling packages (`ds-components`, `ds-helpers`) are **not** on that path, so they are not loaded.

If it cannot find a project root (no `.git` walking up), it only reads CWD. An empty `project_root_markers` list also disables parent traversal.

`.agents/` is skills, not extra always-on prose. Codex scans `.agents/skills` in **every directory from CWD up to the Git root**, plus `$HOME/.agents/skills`. So a repo-root `.agents/skills` is still available when you launch from a package. HASH currently has no `.agents/` at repo or package level; your personal skills live in `~/.agents/skills`.

## Cursor: workspace folder, not Git root

Cursor treats the **opened folder** as project root.

- Nested `AGENTS.md` files **inside** that folder are combined with parents, more specific winning — but “parent” here means a parent **inside the workspace**, not the Git root sitting above it.
- `.cursor/rules` is only discovered at the **workspace root**. Cursor does not walk up to `hash/.cursor/rules` if you opened `petrinaut`.
- User rules from **Customize → Rules** still apply globally. That is Cursor’s analogue of user-level guidance; it is not `~/.codex/AGENTS.md`.

Cursor staff’s advice for huge monorepos is exactly this: open the package so you **don’t** ingest the repo-root / sibling `AGENTS.md` files.

Short answer: Claude Code and Pi both differ meaningfully from Codex/Cursor, and from each other, on two axes — how far they walk up the tree, and whether they stop at a Git boundary.

## Claude Code: filesystem root, not Git root, for CLAUDE.md

Claude Code walks up the directory tree from the working directory, checking **every** directory for `CLAUDE.md`/`CLAUDE.local.md`, with no mention of stopping at a `.git` boundary — the docs describe ordering "from the filesystem root down to your working directory". So if you launch inside `libs/@hashintel/petrinaut`, Claude reads that file plus every ancestor's `CLAUDE.md` all the way up, potentially including a `CLAUDE.md` sitting above the Git root (e.g. in `libs/`, `hash/`, or even higher) if one exists there — unlike Codex's git-root-bounded walk. Files are concatenated (never override), ordered so deeper/closer-to-CWD files are read last and thus "win" on conflicting guidance in practice, and `CLAUDE.local.md` is appended after `CLAUDE.md` at each level. Separately, `~/.claude/CLAUDE.md` (user scope) and a managed/org-level `CLAUDE.md` also load, in a fixed load order: managed → user → project → local. Subdirectory `CLAUDE.md` files below CWD are not loaded at launch — they load lazily only when Claude reads a file in that subdirectory. Claude Code doesn't read `AGENTS.md` natively at all; teams typically get equivalence via an `@AGENTS.md` import or a symlink inside `CLAUDE.md`.[^1_1][^1_2][^1_3]

## Claude Code: skills are Git-root-bounded (unlike CLAUDE.md)

Skills discovery is explicitly bounded, in contrast to memory files: "Project skills load from `.claude/skills/` in the directory where you start Claude Code and in every parent directory **up to the repository root**". So sibling packages are excluded, matching Codex's behavior for `.agents/skills`, but the two mechanisms in the same tool (CLAUDE.md vs skills) use different stopping rules — CLAUDE.md is unbounded up the filesystem, skills stop at the Git root. Nested `.claude/skills/` directories below CWD load on demand the first time Claude touches a file in that subdirectory (same lazy pattern as CLAUDE.md), and `~/.claude/skills/` is always available as the user/personal scope. `--add-dir` also pulls in that directory's `.claude/skills/` automatically, though not its `CLAUDE.md` unless you set an extra environment variable.[^1_4][^1_5][^1_1]

## Pi: walks up to home directory, no Git-root concept at all

Pi has no Git-repo-boundary logic whatsoever for `AGENTS.md`. Official docs state it loads context files at startup from three concatenated sources: `~/.pi/agent/AGENTS.md` (global), parent directories walking up from CWD, and the current directory. Looking at Pi's actual discovery source code, the walk-up loop explicitly terminates when `current === (ctx.repoRoot ?? ctx.home)` — i.e., it stops at the repo root *if Pi detects one*, otherwise it stops at `$HOME`. This is a meaningful nuance: Pi does have an internal `repoRoot` concept it can use as a stop condition, but multiple independent sources describe the practical/global behavior as "walking up to home directory," and unlike Codex there's no messaging about `project_root_markers` or explicit Git-root semantics as the primary design — home directory is the documented fallback ceiling. `AGENTS.override.md` takes precedence over `AGENTS.md` at a given directory level, mirroring Codex. `CLAUDE.md` is also accepted by Pi as an alternate filename for the same mechanism.[^1_6][^1_7][^1_8][^1_9][^1_10][^1_11][^1_12]

Pi's skills discovery is separately git-root-bounded like Codex/Claude: official third-party docs describe Pi (and its `prime-agent`/`oh-my-pi` ecosystem) scanning `.agents/skills` (or `.pi/skills`) "in `cwd` and ancestor directories (up to git repo root, or filesystem root when not in a repo)," plus a global `~/.pi/agent/skills` or `~/.agents/skills`. A separate extension, `pi-subdir-context`, adds Codex/Cursor-like descendant-loading for context files that Pi doesn't do natively, and it explicitly caps its own walk "at the project root (current working directory)".[^1_13][^1_12][^1_14]

## Side-by-side comparison

| Aspect | Codex | Cursor | Claude Code | Pi |
| :-- | :-- | :-- | :-- | :-- |
| Context-file walk-up boundary | Git root (or CWD only if no `.git`) [context] | Opened workspace folder, not Git root [context] | Filesystem root — no Git-root stop documented [^1_1] | Repo root if detected, else `$HOME` (code); docs simplify to "up to home" [^1_10][^1_6] |
| Skills/rules walk-up boundary | Git root, plus `$HOME/.agents/skills` [context] | `.cursor/rules` only at workspace root, no walk [context] | Git repo root, plus `~/.claude/skills/` [^1_4] | Git repo root (or filesystem root if no repo), plus `~/.pi/agent/skills` [^1_14] |
| Descendant/subdirectory loading | Not addressed in your Codex writeup | Not addressed | Lazy, on file access, stays for session [^1_1][^1_4] | Not native; requires `pi-subdir-context` extension [^1_12] |
| User/global file | `~/.codex/AGENTS.md` (or override) [context] | Customize → Rules (separate mechanism) [context] | `~/.claude/CLAUDE.md`, `~/.claude/skills/` [^1_1][^1_4] | `~/.pi/agent/AGENTS.md`, `~/.pi/agent/skills` [^1_11] |

The one point worth flagging as a real risk for your `petrinaut` case: Claude Code's CLAUDE.md walk is **not** Git-root-bounded, so if HASH (or you personally) ever add a `CLAUDE.md` anywhere above the repo root in the filesystem path, Claude Code will silently ingest it — something Codex's Git-root logic and Cursor's workspace-folder logic both explicitly prevent [context]. Skills behave more consistently across all four tools (Git-root-bounded almost everywhere), so your `.agents/skills` mental model transfers to Claude's `.claude/skills` and Pi's `.agents/skills`/`.pi/skills`, just not to Claude's `CLAUDE.md`.[^1_1]

- Claude Code
    - CLAUDE.md/CLAUDE.local.md: walks up from CWD, no git-root stop, goes to filesystem root[^1_1]
    - concatenated all levels, deeper dirs read last (win on conflict), CLAUDE.local.md after CLAUDE.md per dir[^1_1]
    - subdir CLAUDE.md below CWD: lazy-loaded on file read, not at launch[^1_1]
    - user: ~/.claude/CLAUDE.md; managed/org level also exists; load order managed>user>project>local[^1_1]
    - no native AGENTS.md support; needs @import or symlink[^1_1]
    - skills: `.claude/skills/` walk stops at **git repo root** (unlike CLAUDE.md)[^1_4]
    - skills: nested subdir skills lazy-loaded on file access; `~/.claude/skills/` global scope[^1_4]
    - `--add-dir` auto-loads that dir's skills, not its CLAUDE.md (needs env var)[^1_4][^1_1]
- Pi
    - AGENTS.md/CLAUDE.md: concatenates `~/.pi/agent/AGENTS.md` + walk-up from CWD + CWD itself[^1_9][^1_11][^1_6]
    - source code: walk-up stops at `repoRoot` if detected, else `$HOME`[^1_10]
    - docs/community describe it loosely as "up to home directory," no strong git-root framing[^1_7][^1_6]
    - AGENTS.override.md wins over AGENTS.md per directory[^1_6]
    - skills: `.agents/skills`/`.pi/skills` walk bounded by git repo root (or filesystem root if no repo) + global `~/.pi/agent/skills` or `~/.agents/skills`[^1_14]
    - no native descendant/subdir context loading; requires `pi-subdir-context` extension, which caps itself at project root[^1_12]
- key contrast vs Codex/Cursor
    - Codex/Cursor both explicitly bound context-file loading (git root, or workspace folder) [context]
    - Claude Code's CLAUDE.md is the outlier: unbounded up the filesystem tree[^1_1]
    - Claude's own skills mechanism is git-root-bounded, inconsistent with its own CLAUDE.md rule[^1_4][^1_1]
    - Pi's skills are git-root-bounded like Codex; Pi's AGENTS.md is home-bounded, not git-bounded[^1_10][^1_14]

<span style="display:none">[^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_21][^1_22][^1_23][^1_24][^1_25][^1_26][^1_27][^1_28][^1_29][^1_30][^1_31][^1_32][^1_33][^1_34][^1_35][^1_36][^1_37][^1_38][^1_39][^1_40][^1_41][^1_42][^1_43][^1_44]</span>

<div align="center">⁂</div>

[^1_1]: https://code.claude.com/docs/en/memory

[^1_2]: https://code.claude.com/docs/en/large-codebases

[^1_3]: https://github.com/shanraisshan/claude-code-best-practice/blob/main/best-practice/claude-memory.md

[^1_4]: https://code.claude.com/docs/en/skills

[^1_5]: https://hidekazu-konishi.com/entry/claude_code_skills_complete_guide.html

[^1_6]: https://pi.dev/docs/latest/usage

[^1_7]: https://deepakness.com/blog/pi-agent-setup/

[^1_8]: https://app.unpkg.com/@oh-my-pi/pi-coding-agent@16.1.7/files/src/prompts/system/autolearn-guidance.md

[^1_9]: https://classic.yarnpkg.com/en/package/@mariozechner/pi-coding-agent

[^1_10]: https://app.unpkg.com/@oh-my-pi/pi-coding-agent@16.1.19/files/src/discovery/agents-md.ts

[^1_11]: https://deepwiki.com/varunisrani/Pi-coding-agent-/6.1-settings

[^1_12]: https://pi.dev/packages/pi-subdir-context

[^1_13]: https://github.com/code-yeongyu/pi-rules

[^1_14]: https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/skills.md

[^1_15]: https://claudskills.com/learn/how-claude-code-discovers-and-loads-skills/

[^1_16]: https://www.morphllm.com/claude-md-examples

[^1_17]: https://www.reddit.com/r/ClaudeAI/comments/1ryf13d/claude_code_get_claude_code_to_read_claudemd/

[^1_18]: https://code.claude.com/docs/en/claude-directory

[^1_19]: https://sidsaladi.substack.com/p/the-ideal-project-structure-for-claude

[^1_20]: https://claudefa.st/blog/guide/mechanics/subdirectory-claude-md

[^1_21]: https://dev.to/tacoda/building-the-agent-harness-subdirectory-claudemd-files-dcl

[^1_22]: https://codewithmukesh.com/blog/anatomy-of-the-claude-folder/

[^1_23]: https://deepwiki.com/shanraisshan/claude-code-best-practice/5.3-monorepo-support

[^1_24]: https://www.developersdigest.tech/blog/how-to-write-claudemd-the-complete-guide

[^1_25]: https://claudearchitectcertification.com/concepts/claude-md-hierarchy

[^1_26]: https://www.morphllm.com/claude-md-guide

[^1_27]: https://github.com/dnouri/pi-coding-agent/blob/master/AGENTS.md

[^1_28]: https://pi.dev/docs/latest/prompt-templates

[^1_29]: https://pi.dev/packages/pi-agentsmd

[^1_30]: https://pi.dev/packages/@tintinweb/pi-subagents

[^1_31]: https://alejandro-ao.com/pi-agent-overview/

[^1_32]: https://pi.dev/packages/@spences10/pi-skills

[^1_33]: https://code.claude.com/docs/en/agent-sdk/skills

[^1_34]: https://vanja.io/claude-code-skills-guide/

[^1_35]: https://claudskills.com/skills/docs-discovery/

[^1_36]: https://code.claude.com/docs/de/skills

[^1_37]: https://code.claude.com/docs/en/claude_code_docs_map

[^1_38]: https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf

[^1_39]: https://support.claude.com/en/articles/12512176-what-are-skills

[^1_40]: https://code.claude.com/docs/fr/features-overview

[^1_41]: https://gist.github.com/mellanon/50816550ecb5f3b239aa77eef7b8ed8d

[^1_42]: https://www.skillsdirectory.com/docs/getting-started

[^1_43]: https://code.claude.com/docs/fr/skills

[^1_44]: https://code.claude.com/docs/en/features-overview

