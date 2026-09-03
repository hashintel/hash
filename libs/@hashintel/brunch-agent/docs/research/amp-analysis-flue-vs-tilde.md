---
title: Compare two agent frameworks
author: Lu Nelson
threadId: T-019fffb3-00c1-7275-a991-40af8a6f5824
created: 2026-08-14T09:55:49.057Z
agentMode: high
---

# Compare two agent frameworks

## User

I'd like you to make a comparative assessment of the following two agent frameworks, focusing on their respetive development and deployment stories, and consider the import of that anlysis for the present project

## Assistant

Which two frameworks should I compare? Please send their names or links; I’ll assess both against this project’s current architecture and deployment constraints.

Which two agent frameworks should I compare? Please provide their names or links.

## User

[Getting Started | Flue](https://flueframework.com/docs/guide/getting-started/)

[Start building with Tilde - Tilde documentation](https://trytilde.ai/docs)

## Assistant

**Tool Use:** `skill`

```json
{
  "name": "context-mode"
}
```

## User

**Tool Result:** `TU-0346wWTIKtjEH3KCehifXF`

````
{
  "content": [
    {
      "text": "<loaded_skill name=\"context-mode\">\n# context-mode Skill\n\n\n# Context Mode: Default for All Large Output\n\n## MANDATORY RULE\n\n<context_mode_logic>\n  <mandatory_rule>\n    Default to context-mode for ALL commands. Only use Bash for guaranteed-small-output operations.\n  </mandatory_rule>\n</context_mode_logic>\n\nBash whitelist (safe to run directly):\n- **File mutations**: `mkdir`, `mv`, `cp`, `rm`, `touch`, `chmod`\n- **Git writes**: `git add`, `git commit`, `git push`, `git checkout`, `git branch`, `git merge`\n- **Navigation**: `cd`, `pwd`, `which`\n- **Process control**: `kill`, `pkill`\n- **Package management**: `npm install`, `npm publish`, `pip install`\n- **Simple output**: `echo`, `printf`\n\n**Everything else → `ctx_execute` or `ctx_execute_file`.** Any command that reads, queries, fetches, lists, logs, tests, builds, diffs, inspects, or calls an external service. This includes ALL CLIs (gh, aws, kubectl, docker, terraform, wrangler, fly, heroku, gcloud, etc.) — there are thousands and we cannot list them all.\n\n**When uncertain, use context-mode.** Every KB of unnecessary context reduces the quality and speed of the entire session.\n\n## Decision Tree\n\n```\nAbout to run a command / read a file / call an API?\n│\n├── Command is on the Bash whitelist (file mutations, git writes, navigation, echo)?\n│   └── Use Bash\n│\n├── Output MIGHT be large or you're UNSURE?\n│   └── Use context-mode ctx_execute or ctx_execute_file\n│\n├── Fetching web documentation or HTML page?\n│   └── Use ctx_fetch_and_index → ctx_search\n│\n├── Using Playwright (navigate, snapshot, console, network)?\n│   └── ALWAYS use filename parameter to save to file, then:\n│       browser_snapshot(filename) → ctx_index(path) or ctx_execute_file(path)\n│       browser_console_messages(filename) → ctx_execute_file(path)\n│       browser_network_requests(filename) → ctx_execute_file(path)\n│       ⚠ browser_navigate returns a snapshot automatically — ignore it,\n│         use browser_snapshot(filename) for any inspection.\n│       ⚠ Playwright MCP uses a SINGLE browser instance — NOT parallel-safe.\n│         For parallel browser ops, use agent-browser via execute instead.\n│\n├── Using agent-browser (parallel-safe browser automation)?\n│   └── Run via execute (shell) — each call gets its own subprocess:\n│       execute(\"agent-browser open example.com && agent-browser snapshot -i -c\")\n│       ✓ Supports sessions for isolated browser instances\n│       ✓ Safe for parallel subagent execution\n│       ✓ Lightweight accessibility tree with ref-based interaction\n│\n├── Processing output from another MCP tool (Context7, GitHub API, etc.)?\n│   ├── Output already in context from a previous tool call?\n│   │   └── Use it directly. Do NOT re-index with ctx_index(content: ...).\n│   ├── Need to search the output multiple times?\n│   │   └── Save to file via ctx_execute, then ctx_index(path) → ctx_search\n│   └── One-shot extraction?\n│       └── Save to file via ctx_execute, then ctx_execute_file(path)\n│\n└── Reading a file to analyze/summarize (not edit)?\n    └── Use ctx_execute_file (file loads into FILE_CONTENT, not context)\n```\n\n## When to Use Each Tool\n\n| Situation | Tool | Example |\n|-----------|------|---------|\n| Hit an API endpoint | `ctx_execute` | `fetch('http://localhost:3000/api/orders')` |\n| Run CLI that returns data | `ctx_execute` | `gh pr list`, `aws s3 ls`, `kubectl get pods` |\n| Run tests | `ctx_execute` | `npm test`, `pytest`, `go test ./...` |\n| Git operations | `ctx_execute` | `git log --oneline -50`, `git diff HEAD~5` |\n| Docker/K8s inspection | `ctx_execute` | `docker stats --no-stream`, `kubectl describe pod` |\n| Read a log file | `ctx_execute_file` | Parse access.log, error.log, build output |\n| Read a data file | `ctx_execute_file` | Analyze CSV, JSON, YAML, XML |\n| Read source code to analyze | `ctx_execute_file` | Count functions, find patterns, extract metrics |\n| Fetch web docs | `ctx_fetch_and_index` | Index React/Next.js/Zod docs, then search |\n| Playwright snapshot | `browser_snapshot(filename)` → `ctx_index(path)` → `ctx_search` | Save to file, index server-side, query |\n| Playwright snapshot (one-shot) | `browser_snapshot(filename)` → `ctx_execute_file(path)` | Save to file, extract in sandbox |\n| Playwright console/network | `browser_*(filename)` → `ctx_execute_file(path)` | Save to file, analyze in sandbox |\n| MCP output (already in context) | Use directly | Don't re-index — it's already loaded |\n| MCP output (need multi-query) | `ctx_execute` to save → `ctx_index(path)` → `ctx_search` | Save to file first, index server-side |\n| Wipe indexed KB content | `ctx_purge(confirm: true)` | Permanently deletes all indexed content |\n\n## Automatic Triggers\n\nUse context-mode for ANY of these, without being asked:\n\n- **API debugging**: \"hit this endpoint\", \"call the API\", \"check the response\", \"find the bug in the response\"\n- **Log analysis**: \"check the logs\", \"what errors\", \"read access.log\", \"debug the 500s\"\n- **Test runs**: \"run the tests\", \"check if tests pass\", \"test suite output\"\n- **Git history**: \"show recent commits\", \"git log\", \"what changed\", \"diff between branches\"\n- **Data inspection**: \"look at the CSV\", \"parse the JSON\", \"analyze the config\"\n- **Infrastructure**: \"list containers\", \"check pods\", \"S3 buckets\", \"show running services\"\n- **Dependency audit**: \"check dependencies\", \"outdated packages\", \"security audit\"\n- **Build output**: \"build the project\", \"check for warnings\", \"compile errors\"\n- **Code metrics**: \"count lines\", \"find TODOs\", \"function count\", \"analyze codebase\"\n- **Web docs lookup**: \"look up the docs\", \"check the API reference\", \"find examples\"\n\n## Language Selection\n\n| Situation | Language | Why |\n|-----------|----------|-----|\n| HTTP/API calls, JSON | `javascript` | Native fetch, JSON.parse, async/await |\n| Data analysis, CSV, stats | `python` | csv, statistics, collections, re |\n| Shell commands with pipes | `shell` | grep, awk, jq, native tools |\n| File pattern matching | `shell` | find, wc, sort, uniq |\n\n## Search Query Strategy\n\n- BM25 uses **OR semantics** — results matching more terms rank higher automatically\n- Use 2-4 specific technical terms per query\n- **Always use `source` parameter** when multiple docs are indexed to avoid cross-source contamination\n  - Partial match works: `source: \"Node\"` matches `\"Node.js v22 CHANGELOG\"`\n- **Always use `queries` array** — batch ALL search questions in ONE call:\n  - `ctx_search(queries: [\"transform pipe\", \"refine superRefine\", \"coerce codec\"], source: \"Zod\")`\n  - NEVER make multiple separate ctx_search() calls — put all queries in one array\n\n## External Documentation\n\n- **Always use `ctx_fetch_and_index`** for external docs — NEVER `cat` or `ctx_execute` with local paths for packages you don't own\n- For GitHub-hosted projects, use the raw URL: `https://raw.githubusercontent.com/org/repo/main/CHANGELOG.md`\n- After indexing, use the `source` parameter in search to scope results to that specific document\n\n## Critical Rules\n\n1. **Always console.log/print your findings.** stdout is all that enters context. No output = wasted call.\n2. **Write analysis code, not just data dumps.** Don't `console.log(JSON.stringify(data))` — analyze first, print findings.\n3. **Be specific in output.** Print bug details with IDs, line numbers, exact values — not just counts.\n4. **For files you need to EDIT**: Use the normal Read tool. context-mode is for analysis, not editing.\n5. **For Bash whitelist commands only**: Use Bash for file mutations, git writes, navigation, process control, package install, and echo. Everything else goes through context-mode.\n6. **Never use `ctx_index(content: large_data)`.** Use `ctx_index(path: ...)` to read files server-side. The `content` parameter sends data through context as a tool parameter — use it only for small inline text.\n7. **Always use `filename` parameter** on Playwright tools (`browser_snapshot`, `browser_console_messages`, `browser_network_requests`). Without it, the full output enters context.\n8. **Don't re-index data already in context.** If an MCP tool returned data in a previous response, it's already loaded — use it directly or save to file first.\n\n## Sandboxed Data Workflow\n\n<sandboxed_data_workflow>\n  <critical_rule>\n    When using tools that support saving to a file: ALWAYS use the 'filename' parameter.\n    NEVER return large raw datasets directly to context.\n  </critical_rule>\n  <workflow>\n    LargeDataTool(filename: \"path\") → mcp__context-mode__ctx_index(path: \"path\") → ctx_search()\n  </workflow>\n</sandboxed_data_workflow>\n\nThis is the universal pattern for context preservation regardless of\nthe source tool (Playwright, GitHub API, AWS CLI, etc.).\n\n## Examples\n\n### Debug an API endpoint\n```javascript\nconst resp = await fetch('http://localhost:3000/api/orders');\nconst { orders } = await resp.json();\n\nconst bugs = [];\nconst negQty = orders.filter(o => o.quantity < 0);\nif (negQty.length) bugs.push(`Negative qty: ${negQty.map(o => o.id).join(', ')}`);\n\nconst nullFields = orders.filter(o => !o.product || !o.customer);\nif (nullFields.length) bugs.push(`Null fields: ${nullFields.map(o => o.id).join(', ')}`);\n\nconsole.log(`${orders.length} orders, ${bugs.length} bugs found:`);\nbugs.forEach(b => console.log(`- ${b}`));\n```\n\n### Analyze test output\n```shell\nnpm test 2>&1\necho \"EXIT=$?\"\n```\n\n### Check GitHub PRs\n```shell\ngh pr list --json number,title,state,reviewDecision --jq '.[] | \"\\(.number) [\\(.state)] \\(.title) — \\(.reviewDecision // \"no review\")\"'\n```\n\n### Read and analyze a large file\n```python\n# FILE_CONTENT is pre-loaded by ctx_execute_file\nimport json\ndata = json.loads(FILE_CONTENT)\nprint(f\"Records: {len(data)}\")\n# ... analyze and print findings\n```\n\n## Browser & Playwright Integration\n\n**When a task involves Playwright snapshots, screenshots, or page inspection, ALWAYS route through file → sandbox.**\n\nPlaywright `browser_snapshot` returns 10K–135K tokens of accessibility tree data. Calling it without `filename` dumps all of that into context. Passing the output to `ctx_index(content: ...)` sends it into context a SECOND time as a parameter. Both are wrong.\n\n**The key insight**: `browser_snapshot` has a `filename` parameter that saves to file instead of returning to context. `ctx_index` has a `path` parameter that reads files server-side. `ctx_execute_file` processes files in a sandbox. **None of these touch context.**\n\n### Workflow A: Snapshot → File → Index → Search (multiple queries)\n\n```\nStep 1: browser_snapshot(filename: \"/tmp/playwright-snapshot.md\")\n        → saves to file, returns ~50B confirmation (NOT 135K tokens)\n\nStep 2: ctx_index(path: \"/tmp/playwright-snapshot.md\", source: \"Playwright snapshot\")\n        → reads file SERVER-SIDE, indexes into FTS5, returns ~80B confirmation\n\nStep 3: ctx_search(queries: [\"login form email password\"], source: \"Playwright\")\n        → returns only matching chunks (~300B)\n```\n\n**Total context: ~430B** instead of 270K tokens. Real 99% savings.\n\n### Workflow B: Snapshot → File → Execute File (one-shot extraction)\n\n```\nStep 1: browser_snapshot(filename: \"/tmp/playwright-snapshot.md\")\n        → saves to file, returns ~50B confirmation\n\nStep 2: ctx_execute_file(path: \"/tmp/playwright-snapshot.md\", language: \"javascript\", code: \"\n          const links = [...FILE_CONTENT.matchAll(/- link \\\"([^\\\"]+)\\\"/g)].map(m => m[1]);\n          const buttons = [...FILE_CONTENT.matchAll(/- button \\\"([^\\\"]+)\\\"/g)].map(m => m[1]);\n          const inputs = [...FILE_CONTENT.matchAll(/- textbox|- checkbox|- radio/g)];\n          console.log('Links:', links.length, '| Buttons:', buttons.length, '| Inputs:', inputs.length);\n          console.log('Navigation:', links.slice(0, 10).join(', '));\n        \")\n        → processes in sandbox, returns ~200B summary\n```\n\n**Total context: ~250B** instead of 135K tokens.\n\n### Workflow C: Console & Network (save to file if large)\n\n```\nbrowser_console_messages(level: \"error\", filename: \"/tmp/console.md\")\n→ ctx_execute_file(path: \"/tmp/console.md\", ...) or ctx_index(path: \"/tmp/console.md\", ...)\n\nbrowser_network_requests(includeStatic: false, filename: \"/tmp/network.md\")\n→ ctx_execute_file(path: \"/tmp/network.md\", ...) or ctx_index(path: \"/tmp/network.md\", ...)\n```\n\n### CRITICAL: Why `filename` + `path` is mandatory\n\n| Approach | Context cost | Correct? |\n|----------|-------------|----------|\n| `browser_snapshot()` → raw into context | **135K tokens** | NO |\n| `browser_snapshot()` → `ctx_index(content: raw)` | **270K tokens** (doubled!) | NO |\n| `browser_snapshot(filename)` → `ctx_index(path)` → `ctx_search` | **~430B** | YES |\n| `browser_snapshot(filename)` → `ctx_execute_file(path)` | **~250B** | YES |\n\n### Key Rule\n\n> **ALWAYS use `filename` parameter when calling `browser_snapshot`, `browser_console_messages`, or `browser_network_requests`.**\n> Then process via `ctx_index(path: ...)` or `ctx_execute_file(path: ...)` — never `ctx_index(content: ...)`.\n>\n> Data flow: **Playwright → file → server-side read → context**. Never: **Playwright → context → ctx_index(content) → context again**.\n\n## Subagent Usage\n\nSubagents automatically receive context-mode tool routing via a PreToolUse hook. You do NOT need to manually add tool names to subagent prompts — the hook injects them. Just write natural task descriptions.\n\n## Anti-Patterns\n\n- Using `curl http://api/endpoint` via Bash → 50KB floods context. Use `ctx_execute` with fetch instead.\n- Using `cat large-file.json` via Bash → entire file in context. Use `ctx_execute_file` instead.\n- Using `gh pr list` via Bash → raw JSON in context. Use `ctx_execute` with `--jq` filter instead.\n- Piping Bash output through `| head -20` → you lose the rest. Use `ctx_execute` to analyze ALL data and print summary.\n- Narrowing `ctx_execute` output upstream of capture → `ctx_execute` captures, `ctx_search` filters; merging the layers drops data that the index never sees. See `references/anti-patterns.md` §8.\n- Running `npm test` via Bash → full test output in context. Use `ctx_execute` to capture and summarize.\n- Calling `browser_snapshot()` WITHOUT `filename` parameter → 135K tokens flood context. **Always** use `browser_snapshot(filename: \"/tmp/snap.md\")`.\n- Calling `browser_console_messages()` or `browser_network_requests()` WITHOUT `filename` → entire output floods context. **Always** use the `filename` parameter.\n- Passing ANY large data to `ctx_index(content: ...)` → data enters context as a parameter. **Always** use `ctx_index(path: ...)` to read server-side. The `content` parameter should only be used for small inline text you're composing yourself.\n- Calling an MCP tool (Context7 `query-docs`, GitHub API, etc.) then passing the response to `ctx_index(content: response)` → **doubles** context usage. The response is already in context — use it directly or save to file first.\n- Ignoring `browser_navigate` auto-snapshot → navigation response includes a full page snapshot. Don't rely on it for inspection — call `browser_snapshot(filename)` separately.\n- Expecting `ctx_stats` to reset or wipe anything → `ctx_stats` is read-only (shows stats only). Use `ctx_purge(confirm: true)` to permanently delete all indexed content.\n\n## Reference Files\n\n- [JavaScript/TypeScript Patterns](../reference/references/patterns-javascript.md)\n- [Python Patterns](../reference/references/patterns-python.md)\n- [Shell Patterns](../reference/references/patterns-shell.md)\n- [Anti-Patterns & Common Mistakes](../reference/references/anti-patterns.md)\n\n\nBase directory for this skill: file:///Users/lunelson/.claude/plugins/cache/context-mode/context-mode/1.0.169/skills/context-mode\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n\n<skill_files>\n<file>/Users/lunelson/.claude/plugins/cache/context-mode/context-mode/1.0.169/skills/context-mode/references/anti-patterns.md</file>\n<file>/Users/lunelson/.claude/plugins/cache/context-mode/context-mode/1.0.169/skills/context-mode/references/patterns-javascript.md</file>\n<file>/Users/lunelson/.claude/plugins/cache/context-mode/context-mode/1.0.169/skills/context-mode/references/patterns-python.md</file>\n<file>/Users/lunelson/.claude/plugins/cache/context-mode/context-mode/1.0.169/skills/context-mode/references/patterns-shell.md</file>\n</skill_files>\n</loaded_skill>",
      "type": "text"
    }
  ]
}
````

## Assistant

I’ll compare the frameworks from their current documentation, then map the differences onto this repository’s actual agent workflow, runtime boundaries, and deployment assumptions rather than treating it as a generic feature comparison.

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/guide/getting-started/",
  "objective": "Establish Flue's current development model, core abstractions, local setup, runtime requirements, state/tool/model integration, observability/testing story, and deployment model. Capture links to authoritative follow-on documentation needed for a rigorous framework assessment.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://trytilde.ai/docs",
  "objective": "Establish Tilde's current development model, core abstractions, local setup, runtime requirements, state/tool/model integration, observability/testing story, and deployment model. Capture links to authoritative follow-on documentation needed for a rigorous framework assessment.",
  "forceRefetch": true
}
```

**Tool Use:** `finder`

```json
{
  "query": "Assess the present brunch-lite project's agent framework architecture and deployment story. Identify the production entry points and end-to-end flow, agent/workflow abstractions and dependencies, persistence/state model, integrations, local development commands, tests/evaluation/observability mechanisms, and deployment configuration or assumptions. Return concise findings with exact file paths and line numbers, and flag planned-vs-implemented distinctions from CONTEXT.md and ADRs."
}
```

## User

**Tool Result:** `TU-0346wWoPgf9Ql9EvAhklZY`

````
# description: Set up a Flue project automatically or create your first agent manually.
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg
**Flue** is the open agent framework, from the creators of [Astro](https://astro.build/). Use a React-like hooks API to build agents in TypeScript using your favorite LLMs.
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg
Run them locally or deploy them anywhere: Node.js, Cloudflare, GitHub Actions, GitHub CI/CD, etc.
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Prerequisites
* **Node.js** — `>=22.19.0` minimum required version.
* **LLM** — API key(s) to connect to your favorite model provider. Flue is built on Pi, and supports [all Pi providers](https://pi.dev/docs/latest/providers) out of the box.
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Prerequisites
Flue’s [Cloudflare runtime](https://flueframework.com/docs/guide/getting-started/docs/guide/targets/cloudflare/) provides a built-in `cloudflare/*` AI gateway, no API keys required.

...

title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Manual Installation
> _The AI-guided prompt above is strongly recommended for most users. Follow the steps below if you prefer to set things up yourself._
In a new directory, install the runtime and the CLI:
```bash
npm install @flue/runtime @flue/cli
````

Then, create a basic `flue.config.ts` file:
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Manual Installation

```ts
import { defineConfig } from "@flue/runtime/config";

export default defineConfig({
  target: "node", // or 'cloudflare'
});
```

And finally, create your first `src/agents/assistant.ts`:
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Manual Installation

```ts
// The `'use agent'` directive marks the Assistant() function below as a Flue agent.
"use agent";
import { useModel } from "@flue/runtime";

// This is your first agent: `Assistant`.
// It's return value is your agent's instructions, which become the agent's "system" instructions.
```

...

title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Manual Installation
You can use any [Model/Provider](https://flueframework.com/docs/guide/models/) that Pi supports. In the example above, we use Claude Haiku. Whichever you choose, just be sure to provide the required API keys to the agent runtime. Its recommended to use a `.env` file to manage your API keys:

...

title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Run your agent locally
You can now spin up new agents from your terminal, running on your local machine:

```bash
npx flue run src/agents/assistant.ts --message "Say hello in five words or fewer."
```

...

title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Run your agent locally
Congratulations! You just ran your first Flue agent. You can use `flue run` to run agents on your local machine, or in CI environments like [GitHub Actions](https://flueframework.com/docs/ecosystem/deploy/github-actions/) and [GitLab CI/CD](https://flueframework.com/docs/ecosystem/deploy/gitlab-ci/).
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy your agent
To host your agent remotely, you’ll need to deploy it. Flue uses [Hono](http://hono.dev/) and [Vite](https://vite.dev/) to power its server framework and build pipeline, respectively. Follow the following steps to build your agent for deployment.
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy your agent > 1. Install dependencies

```bash
npm install @flue/vite hono vite
```

title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy your agent > 2. Configure the project
Create two small config files at the project root:

```ts
import { flue } from "@flue/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [flue()],
});
```

title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy your agent > 2. Configure the project
If you are deploying to Cloudflare, then you should also install `@cloudflare/vite-plugin` and add `cloudflare()` after `flue()` in the Vite plugins array. see the [Cloudflare runtime](https://flueframework.com/docs/guide/cloudflare-target/) guide for more.
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy your agent > 3. Build your app router
`src/app.ts` is the special file where your Flue app router always lives. Create your [Hono](https://hono.dev/) application instance, mount your agent, and export it so that it gets picked up by your build.
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy your agent > 3. Build your app router

```ts
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";
import { Assistant } from "./agents/assistant.ts";

// 1. Create your Hono application instance.
const app = new Hono();
// 2. Define your agent routes.
app.route("/agents/assistant", createAgentRouter(Assistant));
```

...

title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy your agent > 4. Start the dev server
As mentioned, Flue leverages Vite to power its dev and build pipeline. To spin up your dev server, run `vite dev`:

```bash
npx vite dev
```

title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy your agent > 4. Start the dev server
Vite spins up your `app.ts` (by default at `http://localhost:5173`) application and servers your agents at the routes that you defined. Test your setup by sending your agent a message — one `POST` per message, `202` on admission:

...

title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy your agent > 4. Start the dev server
`vite build` will produce a runnable `dist/server.mjs` build output for the `"node"` runtime target, or a deployable Cloudflare Worker when configured with the `"cloudflare"` runtime target.

...

title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg > Next steps

- [Agent SDK](https://flueframework.com/docs/sdk/overview/) and [React](https://flueframework.com/docs/guide/react/) — build product experiences on top of a deployed agent.

```

**Tool Result:** `TU-0346wWoQZ3eDynKmTkye3i`

```

> Documentation IndexFetch the complete documentation index at: https://trytilde.ai/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Start building with Tilde

> Build and operate TypeScript AI agents with secure tools, MCP servers, ChatKit, memory, skills, browser sessions, and portable Tilde configuration.
> Tilde breaks down what makes Claude Code, Codex, and OpenClaw effective and makes those capabilities available as an integrated product suite.
> Our mission is to open the hood on these products and give you the same building blocks. Tilde helps developers build purposeful AI agents quickly.

...

- **Tools:** Connect to hundreds of providers with off-the-shelf integrations, add custom tools, and group them in secure MCP servers.
- **Memory:** Create a persistent brain and personal notebook for one agent, or share it across several agents.
- **Skills:** Deploy skill registries that group instructions and make them available to agents.
- **ChatKit:** Integrate with third-party chat providers, trigger agent runs from external webhook events, or schedule recurring prompts.
  These features are available through cloud APIs that hide the underlying complexity.
  Use our client-side library, `@trytilde/harness-sdk`, with first-class support for Vercel and Next.js to build and deploy your own cloud agents.

...

## Explore the product suite

<Columns cols={2}>
<Card title="Tools" href="/docs/tools">
Connect providers, add custom tools, and expose them through secure MCP servers.
</Card>
<Card title="ChatKit" href="/docs/chatkit">
Connect conversations, webhooks, and scheduled agent runs.
</Card>
```

**Tool Result:** `TU-0346wWoR3JFbMoPUcP2maH`

```
Implemented: a local Flue/Vite demo with one Gherkin agent, Anthropic model, Hono route, React chat, and SQLite conversation persistence; core capture-store semantics are tested, but sweep/archive/plugin packs and production deployment remain planned. No deployment/IaC configuration found.

- **Production entry / E2E:** [apps/dev/src/app.ts#L17-L43](file:///Users/lunelson/Code/hashintel/brunch-lite/apps/dev/src/app.ts#L17-L43) → [agent definition#L27-L58](file:///Users/lunelson/Code/hashintel/brunch-lite/apps/dev/src/agents/gherkin-elicitor.ts#L27-L58) → [Flue binding ask/suspend flow#L39-L92](file:///Users/lunelson/Code/hashintel/brunch-lite/packages/binding-flue/src/index.ts#L39-L92) → [browser client bootstrap/replies#L46-L92](file:///Users/lunelson/Code/hashintel/brunch-lite/apps/dev/src/ui/chat.tsx#L46-L92).
- **Architecture/dependencies:** core is substrate-free; plugin depends only on core; Flue binding owns dialect. [core exports#L1-L49](file:///Users/lunelson/Code/hashintel/brunch-lite/packages/core/src/index.ts#L1-L49), [plugin scaffold#L3-L30](file:///Users/lunelson/Code/hashintel/brunch-lite/packages/core/src/plugin.ts#L3-L30), [Gherkin tracer#L1-L19](file:///Users/lunelson/Code/hashintel/brunch-lite/packages/plugin-gherkin/src/index.ts#L1-L19), [Flue capabilities#L30-L93](file:///Users/lunelson/Code/hashintel/brunch-lite/packages/binding-flue/src/capabilities.ts#L30-L93).
- **State/persistence:** implemented capture snapshot (captures/issues/events) and atomic JSON tmp+rename local store; live Flue conversations use SQLite at `BRUNCH_DEV_DB_PATH` or app-local `.data-wipe-me`. [capture model#L44-L166](file:///Users/lunelson/Code/hashintel/brunch-lite/packages/core/src/capture-store.ts#L44-L166), [local store#L14-L76](file:///Users/lunelson/Code/hashintel/brunch-lite/packages/binding-flue/src/local-capture-store.ts#L14-L76), [conversation DB#L1-L24](file:///Users/lunelson/Code/hashintel/brunch-lite/apps/dev/src/db-path.ts#L1-L24).
- **Integrations/assumptions:** Anthropic `claude-haiku-4-5`; Flue runtime/SDK/React, Hono, Vite, Valibot. Node target; server and client require separate Vite builds and app-served assets. [agent model#L22-L30](file:///Users/lunelson/Code/hashintel/brunch-lite/apps/dev/src/agents/gherkin-elicitor.ts#L22-L30), [runtime config#L1-L5](file:///Users/lunelson/Code/hashintel/brunch-lite/apps/dev/flue.config.ts#L1-L5), [build/package commands#L7-L23](file:///Users/lunelson/Code/hashintel/brunch-lite/package.json#L7-L23), [dev build#L7-L28](file:///Users/lunelson/Code/hashintel/brunch-lite/apps/dev/package.json#L7-L28).
- **Tests/evaluation/observability:** hermetic faux-provider walking skeleton verifies route/tool/reply binding; capture-store and persistence unit tests; CI runs lint/fmt/typecheck/test, where artifact tests build both bundles. [integration flow#L43-L120](file:///Users/lunelson/Code/hashintel/brunch-lite/apps/dev/test/walking-skeleton.integration.ts#L43-L120), [artifact gate#L34-L132](file:///Users/lunelson/Code/hashintel/brunch-lite/test/build-artifact.test.ts#L34-L132), [CI#L30-L54](file:///Users/lunelson/Code/hashintel/brunch-lite/.github/workflows/ci.yml#L30-L54), [open verification gaps#L63-L108](file:///Users/lunelson/Code/hashintel/brunch-lite/test/known-gaps.ts#L63-L108).
- **Planned vs implemented:** CONTEXT/spec defines target-document session archives, sweeps, packs/projections, re-entry and multi-target architecture, but current binding implements only question transport; the plugin is identity-only. [CONTEXT state contract#L35-L47](file:///Users/lunelson/Code/hashintel/brunch-lite/CONTEXT.md#L35-L47), [planned storage/archive#L448-L471](file:///Users/lunelson/Code/hashintel/brunch-lite/docs/planning/elicitation-kernel/spec.md#L448-L471), [local-only/deploy deferred#L642-L657](file:///Users/lunelson/Code/hashintel/brunch-lite/docs/planning/elicitation-kernel/spec.md#L642-L657).
- **ADR distinction:** ADR-0001 supersedes the draft spec’s provisional `bl_*` naming: implemented `brunch_*` and durable `brunch-gherkin-elicitor`; future assurance agent remains planned. [ADR decision/consequences#L32-L74](file:///Users/lunelson/Code/hashintel/brunch-lite/docs/adr/0001-brunch-is-the-product-name.md#L32-L74).
```

## Assistant

**Tool Use:** `read_web_page`

```json
{
  "url": "https://trytilde.ai/docs/llms.txt",
  "fullContent": true,
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/llms.txt",
  "fullContent": true,
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/guide/",
  "objective": "Find Flue's authoritative conceptual model and documentation links for agents, hooks, state, tools, routing, testing/evals, observability, persistence, and deployment targets.",
  "forceRefetch": true
}
```

## User

**Tool Result:** `TU-0346wXjaMFyTAK0i9dPbqK`

````
# Tilde

> A platform for building and adding features to AI agents through a cloud API

Tilde lets developers and agents configure off the shelf third-party tools, deploy custom tool endpoints, integrate agent's with third-party chat platforms and webhooks (Chatkit), manage agent skills and provide agents with integrated memory.

## Key features:

- Tools: Off the shelf integration with hundreds of providers, add your own custom tools & spin up secure MCP servers that house them
- Memory: Create a peristent brain and personal notepad for your agent or share it across multiple agents
- Skills: Deploy Skills registries to group skills together and make them available to agents
- ChatKit: Integrate with third party chat providers, have external webhook events trigger agent runs or plan repeat prompts to run on schedule

These features are all exposed through cloud API’s that hide away the detail.

## Client libraries to help integrate with

- Tilde Global MCP: https://api.trytilde.ai/mcp . This MCP server is the defacto way for agents to use and build Tilde. Use this MCP server to configure all runtime resources in Tilde, however this MCP server is not the same as agent MCP server (referenced in Tools product) which are used when wanting to invoke tools that you've configured
- Tilde Rest API: If you are running in a sandbox that can make HTTP requests, and the Tilde Global MCP server can't perform the function that you would like, read the [canonical OpenAPI spec](https://trytilde.ai/openapi.json) and invoke the API at `https://api.trytilde.ai`. Use Oauth Authorization: Bearer xxx headers or x-api-key if provided by the user, or ask the user.
- Harness SDK: When implementing a custom agent for a specific purpose, always use Vercel's AI SDK as the base framework and layer in Tilde's harness SDK, [@trytilde/harness-sdk](https://www.npmjs.com/package/@trytilde/harness-sdk) and [git repo here](https://github.com/trytilde/harness-sdk) to create agent endpoints. Read more about this in the ChatKit  page.
- Any MCP client: Once you've configured an MCP server via Tilde's Tool product, you can connect any MCP client or agent that supports MCP clients to that deployed MCP server to invoke the configured tools. Read the docs pages about connecting your client on this website to find out how to connect popular existing agents via this route to Tilde's Global MCP server. connecting agent MCP server's are slightly different.

## Organization, Team, Auth

- Organisation: The top-level domain object for grouping resources. Use orgs for ownership and billing.
- Teams / workspaces: Teams are sometimes called workspaces. Use teams for runtime isolation: agents, MCP servers, ChatKit providers, signals, API keys, and tool credentials should be team scoped. If you don't want an agent or human to access a specific tool, put it in a seperate team and don't provide that agent with an API key scoped to the new team.
- Human users: Humans who sign in and user the paltform
- Machine users: Often agents. When API keys are generated that are not tied to a human user, a machine user is provisioned, added to the relevant team and the API key associated to them.

## Use Tilde without a human account

If no human has created a Tilde account yet, create a temporary account through the unauthenticated REST endpoint. Do not block setup on human sign-in.

```bash
curl --request POST https://api.trytilde.ai/api/v1/identity/temporary-accounts \
  --header "content-type: application/json" \
  --data '{
    "label": "code review agent",
    "human_email": "owner@example.com"
  }'
````

Both request fields are optional. The response creates a temporary organization and team and returns `org_id`, `team_id`, `api_key`, `claim_url`, `claim_pin`, `claim_token_expires_at`, and `expires_at`.

1. Store the API key, claim URL, and six-digit PIN securely. Never commit or log them.
2. Connect to `https://api.trytilde.ai/mcp` with the temporary key in the `x-api-key` header.
3. Call `tilde_whoami`, then use the returned `team_id` with team-scoped Global MCP functions.
4. Configure agents, tools, ChatKit, memory, skills, and other resources normally.
5. Give the human the `claim_url` and `claim_pin` before the temporary account expires.

The temporary account lasts 24 hours. Its claim URL lasts one hour. If the link expires while the account is still active, generate a fresh link with the temporary API key. The PIN does not change.
Production claim links open under `https://trytilde.ai/app/temporary-accounts/claim/`; the claim API itself remains on `https://api.trytilde.ai`.

```bash
curl --request POST https://api.trytilde.ai/api/v1/identity/temporary-accounts/claim-url \
  --header "x-api-key: $TILDE_API_KEY"
```

### Claim the temporary account

When the human is ready:

1. Sign in to Tilde and select the organization that should own the temporary account.
2. Open the claim URL and enter the six-digit PIN.
3. Wait for the claim page to confirm completion.
4. Reconnect to Global MCP with human OAuth or a new team-scoped API key, then call `tilde_whoami` to find the transferred team.
5. Update any stored MCP server, agent, or Tilde URLs. Claiming can change their organization-qualified URLs.

Claiming transfers every team and supported resource from the temporary organization into the human's current organization. The temporary API key is revoked, so do not continue using it after the claim succeeds. Five incorrect PIN attempts expire the current claim link; use the temporary API key to generate a fresh link.

## Authentication and scope in Global MCP

1. Call `tilde_whoami` first.
2. Select the target team from the returned identity. Teams are also called workspaces.
3. Pass `team_id` to every team-scoped function on the global MCP server. The organization is inferred from the authenticated OAuth token or API key.
4. Prefer OAuth when acting for a human. Use a team-scoped machine API key for a deployed agent.

If a function returns `approval_url`, show it to the user. Then immediately call the returned `next_tool_name` with `next_tool_arguments` and wait for approval before continuing.

## Rules to follow then integrating

- For all org scoped API endpoints, you must provide the org ID. Preferrably in the domain path, e.g. https://$orgId.api.trytilde.ai/ . In case of any issues, you can provide org ID as a header as "x-tilde-org-id"
- For all team scoped API endpoints, the route path always contains /team/{team_id}
- All organisation and team scoped endpoints are available in Global MCP and take these params in the input schema
- Global MCP and all runtime MCP servers support both [Oauth](https://modelcontextprotocol.io/specification/draft/basic/authorization) and API key headers via "x-api-key"
- Prefer Oauth over API key where possible and always in cases where you are acting on behalf of a user. Most seperately deployed harness SDK agents will always use machine generated API keys, which are provided when user invokes create agent endpoints
- For agent, tool endpoints and anywhere else mentioned, always secure the endpoints via the Harness SDK and provide webhook signing secrets which are generated on remote tool server and agent creation to validate inputs
- When building, use dev tunnels if you need to test and publicaly expose agents and tools from your local environment to the public internet for Tilde to be able to test integration with. This will often require updating the agent or tool configurations to dev tunnel mode
- Always export state of the Tilde team / workspace you're working in at tilde.state.yaml if you're commiting source code to a repo. This is infrastructure as code file that represents the configuration along with the agent source code that is required to deploy to a new environment.

## Getting started

### Common use cases

#### Build a custom deployed agent

Start from working code. Use the [Hello World agent](https://github.com/trytilde/examples/tree/main/hello-world-agent) for the smallest signed ChatKit endpoint. Use the [code review bot](https://github.com/trytilde/examples/tree/main/code-review-bot) for a production-shaped agent with tools, signals, typed provider context, reverse proxies, and portable state. Browse the full [Tilde examples repository](https://github.com/trytilde/examples) before inventing an integration pattern.

Use the Vercel AI SDK with [`@trytilde/harness-sdk`](https://www.npmjs.com/package/@trytilde/harness-sdk). Keep `chatKitEndpoint`, webhook verification, ChatKit history conversion, and all secrets server-side.

#### Leverage Tilde's tool control plane for an existing agent

Read [Tools over Global MCP](https://trytilde.ai/docs/llms/tools.md), enable tool integrations with third party providers or others. Add them all to an agent MCP and connect it to an existing agent like Openclaw, Hermes, etc. [Follow connect your agent](https://trytilde.ai/docs/connect-your-agent) to see common guides on connecting to existing agents.

## Agent configuration guides

Use Tilde's global MCP server at `https://api.trytilde.ai/mcp` to configure runtime resources. Read the guide for the product you need:

- [Tools over Global MCP](https://trytilde.ai/docs/llms/tools.md)
- [ChatKit and Signals over Global MCP](https://trytilde.ai/docs/llms/chatkit.md)
- [Memory banks and wikis over Global MCP](https://trytilde.ai/docs/llms/memory.md)
- [Skills and registries over Global MCP](https://trytilde.ai/docs/llms/skills.md)
- [Local development with Dev Tunnels](https://trytilde.ai/docs/llms/dev-tunnels.md)
- [State export and import over Global MCP](https://trytilde.ai/docs/llms/state.md)

These files are optimized for AI agents. The [human documentation](https://trytilde.ai/docs) explains the same products through the dashboard and SDK.

## Pricing

We are currently in early testing stages. Tilde is currently free, it will move to a SaaS billing model. Because memory banks are hosted, each Memory bank is billed at $20 p/ month, subject to change. These are opt-in only if you deploy and create a Memory bank.

## Links

- Homepage: https://trytilde.ai
- Docs: https://trytilde.ai/docs
- Global MCP: https://api.trytilde.ai/mcp
- API & dashboard base URL: https://api.trytilde.ai
- Blog: https://trytilde.ai/blog
- npm (one CLI & Harness SDK): https://www.npmjs.com/package/@trytilde/harness-sdk

````

**Tool Error:** `TU-0346wXjctHi8IuhlaWZWgO`

**Error:** {"message":"Could not read the page: http_error, HTTP 404"}

**Tool Error:** `TU-0346wXjhHIsa3eJobCmBGt`

**Error:** {"message":"Could not read the page: http_error, HTTP 404"}

## Assistant

**Tool Use:** `web_search`

```json
{
  "objective": "Locate Flue Framework's authoritative documentation pages covering its agent execution model, hooks/tools, local development, conversation or agent state/persistence, client SDK, testing/observability, and Node/Cloudflare/CI deployment. Prefer flueframework.com official docs and the official GitHub repository.",
  "max_results": 10,
  "search_queries": [
    "site:flueframework.com/docs Flue runtime targets persistence deployment",
    "site:flueframework.com/docs Flue tools hooks agent lifecycle",
    "site:flueframework.com/docs Flue testing observability SDK"
  ]
}
````

## User

**Tool Result:** `TU-0346wXseijXSjBXzPBGqyo`

````
[
  {
    "url": "https://flueframework.com/docs/guide/observability",
    "title": "Observability - Flue",
    "excerpts": [
      "---\ndescription: Observe agent activity through the runtime event stream — model turns, tool calls, logs, and token usage — and export it to your observability stack.\ntitle: Observability | Flue\nimage: https://flueframework.com/docs/og4.jpg\n---\n\n[Skip to content](#main-content)\n\nFlue emits everything its agents do — model turns, tool calls, structured logs, compactions, and settlements — as typed **runtime events** your application can observe in process. This surface is separate from the per-conversation message stream a chat UI reads, which belongs to [Routing](https://flueframework.com/docs/guide/routing/) and the [Flue Agent SDK](https://flueframework.com/docs/sdk/overview/).\nThis guide covers the two surfaces and when to use each, subscribing with `observe()`, what the event stream contains, token usage and provider diagnostics on model turns, tool activity and logs, exporting telemetry to Sentry, Braintrust, and OpenTelemetry, and how agent activity surfaces in Cloudflare’s platform observability.\n\n## Two event surfaces\n\nFlue exposes agent activity on two distinct surfaces:\n\n* The **conversation stream** is the product surface: one conversation’s durable, render-ready messages, data parts, and settlements, consumed over HTTP with [createFlueClient(...)](https://flueframework.com/docs/sdk/create-flue-client/) `observe()` / `history()`. [Routing](https://flueframework.com/docs/guide/routing/#reading-the-conversation) covers it.\n* The **runtime event stream** is the operational surface: live activity across every agent in the process — model requests, tool executions, logs, token counts, failures — consumed in process with [observe()](https://flueframework.com/docs/reference/events/#observe) from `@flue/runtime`. That stream is this guide’s subject.\n\nThe two APIs share a name but not a shape: the SDK client’s `observe()` maintains one conversation’s materialized message state, while the runtime’s `observe()` delivers raw activity events. Telemetry, metering, and error reporting belong on the runtime stream. The surfaces share correlation identifiers — a conversation message’s `submissionId` matches the runtime events its submission produced.\n\n## Subscribing with `observe()`\n\n`observe()` from `@flue/runtime` registers a global subscriber for all agent activity in the current process. Register it once at startup, at module top level in `app.ts` (or a module `app.ts` imports):\n\n```ts\n\n...\n\n* **Failures are contained.** A throwing subscriber is logged and skipped — it never halts the agent or other subscribers. Returned promises are observed for rejection but not awaited.\n\nThe subscription is **isolate-scoped and live-only**: it sees activity emitted in the current process from the moment it registers, with no durable replay and no cross-process aggregation. On Node.js one process hosts all agents, so one registration sees everything. On [Cloudflare](https://flueframework.com/docs/guide/cloudflare-target/), each agent conversation runs in its own Durable Object isolate — a subscriber registered from `app.ts` runs in each isolate and sees that isolate’s activity only. One placement caveat, shared with `setProvider()`: [flue run](https://flueframework.com/docs/cli/run/) loads only the agent module, never `app.ts` — register in the agent module when a subscriber must also run under the CLI.\n\n## What the stream contains\n\n...\n\n* `gatewayLogId` — the response’s own Cloudflare AI Gateway log id (`cf-aig-log-id`), for correlating a specific turn with its entry in the gateway dashboard.\n\nBoth are telemetry only — they never affect execution or replay — and are present only when the provider records them. The [Workers AI provider](https://flueframework.com/docs/guide/models/#cloudflare-workers-ai-cloudflare-only) attaches both today. A diagnostic observer for failed turns reads them directly from the event:\n\n```ts\nimport { observe } from '@flue/runtime';\n\nobserve((event) => {\n  if (event.type !== 'turn' || !event.isError) return;\n  console.error('model turn failed', {\n    provider: event.request.providerName,\n    model: event.request.requestedModel,\n    finishReason: event.response.finishReason,\n    providerFinishReason: event.response.providerFinishReason,\n    gatewayLogId: event.response.gatewayLogId,\n    error: event.response.error?.message,\n  });\n});\n```\n\n`request.\n\n...\n\nlog.info('sync started', { records: data.ids.length });\n  const failed = await crm.sync(data.ids);\n  if (failed.length > 0) log.error('sync incomplete', { failed: failed.length });\n  return { synced: data.ids.length - failed.length };\n}\n```\n\n```ts\nimport { observe } from '@flue/runtime';\nimport { logger } from './shared/logger.ts';\n\nobserve((event) => {\n  if (event.type !== 'log') return;\n  logger.log(event.level, event.message, {\n    ...event.attributes,\n    conversation: event.conversationId,\n  });\n});\n```\n\nLog lines are runtime events, not conversation content: they never appear in the messages a client renders, and they reach only in-process subscribers — forward them to your logging backend from an observer, or through one of the integrations below.\n\n## Choose an observability provider\n\nFor production telemetry, Flue ships integrations with three ecosystems rather than a bundled dashboard:\n\n* [Sentry](https://flueframework.\ncom/docs/ecosystem/tooling/sentry/) — terminal failures as issues, every log in Sentry Logs, and optional AI traces with content off by default. Add with `flue add tooling sentry`.\n* [Braintrust](https://flueframework.com/docs/ecosystem/tooling/braintrust/) — LLM tracing: operations as traces with model, tool, task, and compaction spans plus usage. Add with `flue add tooling braintrust`.\n* [OpenTelemetry](https://flueframework.com/docs/ecosystem/tooling/opentelemetry/) — standards-based GenAI spans, metrics, and logs for any OTel-compatible backend. Add `@flue/opentelemetry` to your OTel SDK setup.\n\nThe Sentry and Braintrust [blueprints](https://flueframework.com/docs/cli/add/) generate a source-root module that `app.ts` imports — an event bridge like the ones above, plus provider initialization. Span-producing integrations register through `instrument(...)`, which pairs an observer with an execution interceptor so spans wrap live agent, model, tool, and task execution:\n\n```ts\nimport { createOpenTelemetryInstrumentation } from '@flue/opentelemetry';\nimport { instrument } from '@flue/runtime';\n\ninstrument(createOpenTelemetryInstrumentation());\n```\n\nChoose Sentry when you want failures, logs, and traces in an existing application monitor, Braintrust when you want content-bearing LLM traces for inspection and evaluation, and OpenTelemetry when your organization standardizes on an OTel backend. They compose — an error reporter and a tracer can subscribe side by side. On Cloudflare, each integration exports per isolate and final flushes are best-effort; each tooling page documents its target-specific behavior.\n\n## Cloudflare\n\nOn the [Cloudflare target](https://flueframework.com/docs/guide/cloudflare-target/), agent work is also visible to the platform’s own observability products, with no Flue-side wiring.\nEach agent response runs as one unit of platform work — admission answers immediately, then the response executes start-to-settlement as a single invocation the platform can see and measure. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) attribute tool and hook logs to the response that wrote them, and [Workers Traces](https://developers.cloudflare.com/workers/observability/traces/) capture one trace per response — model calls and other subrequests appear as spans inside it. Both are enabled in `wrangler.jsonc`; see [Deploy on Cloudflare](https://flueframework.com/docs/ecosystem/deploy/cloudflare/#observability) for configuration and the [Cloudflare target guide](https://flueframework.com/docs/guide/cloudflare-target/#durable-agent-execution) for the execution model behind the attribution.\n\nAgent-shaped spans are built in — with traces enabled, every response’s trace carries them, no wiring needed.\nTo customize the adapter (content policy, redaction), install it yourself once at `app.ts` module scope, which replaces the default:\n\n```ts\nimport { instrument } from '@flue/runtime';\nimport { createCloudflareTracing } from '@flue/runtime/cloudflare';\n\ninstrument(createCloudflareTracing({ content: false }));\n```\n\nSet [tracing: false](https://flueframework.com/docs/reference/configuration/#tracing) in `flue.config.ts` to drop agent tracing from the build.\n\nEach response’s trace carries an `invoke_agent` span wrapping the run, a `chat` span per model turn with token usage, and an `execute_tool` span per tool call, using the same OpenTelemetry GenAI naming Cloudflare’s own agent tracing emits — Flue agents read natively in the Traces dashboard. The spans carry the conversation by default: input and output messages, system instructions, and tool definitions, arguments, and results, so you can read what the agent actually said and did straight from the trace.\n\n...\n\ncom/docs/sdk/overview/) — the conversation stream your UI consumes.\n* [Agent Hooks](https://flueframework.com/docs/guide/agent-hooks/#event-hooks) — read usage and stamp response metadata from inside the agent.\n* [Sentry](https://flueframework.com/docs/ecosystem/tooling/sentry/), [Braintrust](https://flueframework.com/docs/ecosystem/tooling/braintrust/), and [OpenTelemetry](https://flueframework.com/docs/ecosystem/tooling/opentelemetry/) — per-integration setup and content policies.\n* [Evals](https://flueframework.com/docs/guide/evals/) — turn observed behavior into scored regression checks.\n\n## Docs Navigation\n\nCurrent page: [Observability](https://flueframework.com/docs/guide/observability/)\n\n### Sections\n\n* [Guide](https://flueframework.com/docs/guide/getting-started/)\n* [Reference](https://flueframework.com/docs/reference/agent-api/)\n* [CLI](https://flueframework.com/docs/cli/overview/)\n* [Agent SDK](https://flueframework.com/docs"
    ]
  },
  {
    "url": "https://flueframework.com/docs/guide/agent-hooks/",
    "title": "Agent Hooks - Flue",
    "excerpts": [
      "---\ndescription: Compose an agent's capabilities — model, tools, skills, state, and lifecycle — with Flue's hook primitives.\ntitle: Agent Hooks | Flue\nimage: https://flueframework.com/docs/og4.jpg\n---\n\n[Skip to content](#main-content)\n\nAn agent function can return instructions, but instructions aren’t much on their own. A real agent needs tools, skills, subagents, a sandbox, and persistent data to work with. All agent functionality and resources come from Flue’s second core primitive — **agent hooks**.\n\nThis guide covers what hooks are, the built-in hooks Flue ships with, and how to compose them into hooks of your own. (New to Flue? Be sure to read the [Agents guide](https://flueframework.com/docs/guide/building-agents/) first.)\n\n## What is an agent hook?\n\nA hook is a plain function that you call inside your agent function’s body to give your agent one new capability. You can spot hooks by their names — they all start with `use`.\nEach built-in hook lets your agent hook into a different feature of the Flue runtime:\n\n* [Model](https://flueframework.com/docs/guide/models/) (`useModel`) selects the LLM that powers the agent.\n* [Sandbox](https://flueframework.com/docs/guide/sandboxes/) (`useSandbox`) provides its filesystem and command-execution environment.\n* [Tools](https://flueframework.com/docs/guide/tools/) (`useTool`) let it call application code and affect external systems.\n* [MCP servers](https://flueframework.com/docs/guide/mcp/) (`useMcpConnection`) mount tools from the open MCP ecosystem.\n* [Skills](https://flueframework.com/docs/guide/skills/) (`useSkill`) provide expertise it can load when needed.\n* [Subagents](https://flueframework.com/docs/guide/subagents/) (`useSubagent`) let it delegate focused work to other agents.\n* [Persisted State](#persisted-state) (`usePersistentState`) preserves custom data across the agent lifetime.\n* [Event Hooks](#event-hooks) (`useAgentStart`, `useAgentFinish`, and others) trigger logic on different lifecycle events.\n* [Data Writers](#streaming-data-to-the-client) (`useDataWriter`) stream structured data to your client UI.\n* [Custom Hooks](#custom-hooks) let you compose new hooks out of the built-ins.\n\n```ts\n'use agent';\nimport { useModel, useSandbox, useSkill, useTool } from '@flue/runtime';\nimport { local } from '@flue/runtime/node';\nimport { searchIssues } from '../tools/search-issues.ts';\nimport reviewChecklist from '../skills/review-checklist/SKILL.md';\n\nexport function TriageAgent() {\n  useModel('anthropic/claude-sonnet-4-6');\n  useSandbox(local());\n  useTool(searchIssues);\n  useSkill(reviewChecklist);\n  return 'Investigate the reported issue and recommend the next action.';\n}\n```\n\nSimilar to React, the agent function _re-renders_ on every model call and re-runs its hooks. Unlike React, resource hooks can be added and removed conditionally.\nThis allows Flue to manage your declared agent capabilities for you automatically, adding and removing resources (tools, skills, subagents, etc.) as your conversation with the agent evolves:\n\n```ts\n'use agent';\nimport { useModel, usePersistentState, useTool } from '@flue/runtime';\nimport refundTool from '../tools/refund.ts';\n\nexport function SupportAgent() {\n  useModel('anthropic/claude-haiku-4-5');\n  const [escalated, setEscalated] = usePersistentState('escalated', false);\n  // Tools can modify persisted state.\n  useTool({\n    name: 'escalate',\n    description: 'Escalate this conversation when the customer needs a refund.',\n    async run() {\n      setEscalated(true);\n      return 'Escalated. The refund tool is now available.';\n    },\n  });\n  // If the agent has determined that the conversation needs escalation,\n  // the \"refund\" tool is unlocked and made available to the agent.\n  if (escalated) {\n    useTool(refundTool);\n  }\nreturn 'Answer customer support questions clearly and accurately.';\n}\n```\n\nFlue handles this complexity for you, announcing each change to the model so the transcript stays coherent. Changing the tool set can invalidate the provider’s prompt cache (see [the conditional-tools note](https://flueframework.com/docs/guide/tools/#conditional-tools)).\n\nEvery built-in hook is documented in the [Agent API](https://flueframework.com/docs/reference/agent-api/) reference.\n\n## Persisted state\n\nAn agent conversation can live for days or months, and along the way the agent learns things worth keeping: which phase of a workflow it’s in, what it has already checked, decisions it has made. `usePersistentState` gives that knowledge a durable home:\n\n```ts\n'use agent';\nimport { useModel, usePersistentState, useTool } from '@flue/runtime';\n\nexport function CaseAssistant() {\n  useModel('anthropic/claude-haiku-4-5');\n  const [phase, setPhase] = usePersistentState('phase', 'gathering');\n\n...\n\ncom/docs/guide/sandboxes/) — configure what an agent can do and where it works.\n* [Subagents](https://flueframework.com/docs/guide/subagents/) — delegate focused work to a specialist agent function.\n* [Durability](https://flueframework.com/docs/guide/durability/) — how persistent state, retries, and recovery work.\n\n## Docs Navigation\n\nCurrent page: [Agent Hooks](https://flueframework.com/docs/guide/agent-hooks/)\n\n### Sections\n\n* [Guide](https://flueframework.com/docs/guide/getting-started/)\n* [Reference](https://flueframework.com/docs/reference/agent-api/)\n* [CLI](https://flueframework.com/docs/cli/overview/)\n* [Agent SDK](https://flueframework.com/docs/sdk/overview/)\n* [Ecosystem](https://flueframework.com/docs/ecosystem/)"
    ]
  },
  {
    "url": "https://blog.cloudflare.com/agents-platform-flue-sdk",
    "title": "Bringing more agent harnesses and frameworks to Cloudflare ...",
    "excerpts": [
      "Bringing more agent harnesses and frameworks to Cloudflare ...\nFlue agents can run completely headlessly for background tasks, but @flue/react provides native frontend hooks that stream an agent's state,"
    ]
  },
  {
    "url": "https://github.com/withastro/flue",
    "title": "withastro/flue: The sandbox agent framework. - GitHub",
    "excerpts": [
      "withastro/flue: The sandbox agent framework. - GitHub\n2 days ago · Observability — Monitor your agents and export telemetry with OpenTelemetry, Braintrust, Sentry, or your own observer. Channels — Receive"
    ]
  },
  {
    "url": "https://github.com/withastro/flue/blob/main/AGENTS.md",
    "title": "flue/AGENTS.md at main · withastro/flue · GitHub",
    "excerpts": [
      "# withastro/flue — AGENTS.md\n\n- Page: GitHub code file\n- URL: https://github.com/withastro/flue/blob/main/AGENTS.md\n- Repository: withastro/flue\n- Path: AGENTS.md\n- Ref: main\n- Lines: 53\n\n---\n\n# Flue\n\nFlue is a TypeScript framework for building autonomous AI agents and running them anywhere. An agent is a plain exported function: hooks in its body compose its capabilities — model (`useModel`), tools, skills, sandboxes, state — and its return value is its instruction. Agents live in durable conversations: accepted input survives crashes, restarts, and redeploys, and interrupted work recovers to a deterministic state. Applications build with Vite (the `flue()` plugin plus an explicit `app.ts` route map) and deploy to Node.js or Cloudflare Workers from the same source, with persistence adapters (SQLite, Postgres, MySQL, MongoDB, Redis, and more), channels that turn provider webhooks (Slack, GitHub, Telegram, ...\n) into agent conversations, and clients — the Flue Agent SDK (`@flue/sdk`), `@flue/react`, and the `flue` CLI — for driving conversations over HTTP or from code. The model layer is [Pi](https://pi.dev)'s provider protocol, used directly.\n\n## Contributing\n\nSee `CONTRIBUTING.md` for the full picture. In short:\n\n- **Bug reports** → https://github.com/withastro/flue/issues\n- **Feature requests** → https://github.com/withastro/flue/discussions\n- **Pull requests** are not accepted; they are automatically closed and converted into one of the two contribution types above.\n\n## Terminology\n\n```\nAgent                         — a capitalized, exported plain function; Flue Hooks in its body attach\n                                tools, instructions, and state, and its returned string is its\n                                instruction; the function name (or its `agentName` string-literal\n                                static) is the agent's durable identity\n\n...\n\nts` is the application's route map, mounting each HTTP-reachable agent (`app.route('/agents/<name>', createAgentRouter(AgentFn))`) and channel (`app.route('/channels/<x>', channel.route())`). Registration comes from the `'use agent'` scan, not from mounting.\n\nA blueprint is a Markdown implementation guide returned by `flue add`; its kind is `sandbox`, `database`, `channel`, or `tooling`.\n\n## Project Structure\n\n- `packages/runtime/` — Runtime library (`@flue/runtime`): sessions, agent harnesses, tools, sandbox plumbing, and the `/config` loader for `flue.config.ts`.\n- `packages/vite/` — The `flue()` Vite plugin (`@flue/vite`): `'use agent'` scan/transform, generated bootstraps, Node dev/build, and the Cloudflare target adapter.\n- `packages/cli/` — CLI (`@flue/cli`): `flue run` transport-free local execution, `init`, blueprint `add`/`update`, and offline `docs`.\n- `examples/` — Integration examples for channels, databases, sandboxes, and deployment targets.\n- `demo/` — Standalone Vite+React chat SPA that connects to any running Flue example server.\n- `apps/docs/` — The documentation site; its content is the source of truth for user-facing docs.\n\nNo tests exist in the repo.\n\n## Development\n\n```\npnpm install\npnpm build          # turbo build across the workspace\npnpm check:types    # typecheck (excludes apps-www)\npnpm format         # format your work\n```"
    ]
  },
  {
    "url": "https://code.claude.com/docs/en/agent-sdk/hooks",
    "title": "Intercept and control agent behavior with hooks",
    "excerpts": [
      "With hooks, you can: This guide covers how hooks work, how to configure them, and provides examples for common patterns like blocking tools, modifying inputs, and forwarding notifications."
    ]
  },
  {
    "url": "https://www.npmjs.com/package/%40flue/sdk",
    "title": "@flue/sdk - npm",
    "excerpts": [
      "The first agents were built with raw LLM API calls. This worked for simple chatbots and scripted tasks, but not much else.\n\nAgents like Claude Code and Codex broke the mold. These were _real agents._ Autonomous. You give them a task — not a pre-defined series of steps — and trust them to complete it using the context and tools that you provide.\n\n**Flue unlocks this new architecture for agents.** Its built-in TypeScript harness gives any model the context and environment it needs for truly autonomous work: sessions, tools, skills, instructions, filesystem access, and a secure sandbox to run in. Run your agents locally via CLI or deploy them to your hosted runtime of choice.\n\n## Features\n\nBuild agents that can safely take action, maintain continuity, and connect to the systems where work already happens.\n\n* **[Agents](https://flueframework.com/docs/guide/building-agents/)** — Build agents that can keep context across conversations and events as they autonomously work toward a goal.\n\n...\n\ncom/docs/guide/tools/)** — Connect agents to authenticated tools and services through the open Model Context Protocol ecosystem.\n* **[Observability](https://flueframework.com/docs/guide/observability/)** — Monitor your agents and export telemetry with [OpenTelemetry](https://flueframework.com/docs/ecosystem/tooling/opentelemetry/) , [Braintrust](https://flueframework.com/docs/ecosystem/tooling/braintrust/) , [Sentry](https://flueframework.com/docs/ecosystem/tooling/sentry/) , or your own observer.\n* **[Channels](https://flueframework.com/docs/guide/channels/)** — Receive verified events from Slack, Teams, Discord, GitHub, and more.\n\n## Deploy Anywhere\n\n* **[Node.js](https://flueframework.com/docs/ecosystem/deploy/node/)**\n* **[Cloudflare Workers](https://flueframework.com/docs/ecosystem/deploy/cloudflare/)**\n* **[GitHub Actions](https://flueframework.com/docs/ecosystem/deploy/github-actions/)**\n* **[GitLab CI/CD](https://flueframework.com/docs/ecosystem/deploy/gitlab-ci/)**\n* **[Daytona](https://flueframework.com/docs/ecosystem/sandboxes/daytona/)**\n* **[Render](https://flueframework.com/docs/ecosystem/deploy/render/)**\n\n## Packages\n\n|Package |Description |\n| --- | --- |\n|[`@flue/runtime`](https://github.com/withastro/flue/blob/HEAD/packages/sdk/packages/runtime) |Runtime: harness, sessions, tools, sandbox |\n|[`@flue/vite`](https://github.com/withastro/flue/blob/HEAD/packages/sdk/packages/vite) |Vite plugin: `vite dev` / `vite build` for Node and Cloudflare |\n|[`@flue/cli`](https://github.com/withastro/flue/blob/HEAD/packages/sdk/packages/cli) |CLI ( `flue` binary): local runs, blueprints, offline docs |\n|[`@flue/sdk`](https://github.com/withastro/flue/blob/HEAD/packages/sdk/packages/sdk) |Client SDK for consuming deployed agent conversations |\n|[`@flue/opentelemetry`](https://github.com/withastro/flue/blob/HEAD/packages/sdk/packages/opentelemetry) |OpenTelemetry tracing adapter |\n|[`@flue/postgres`](https://github.\ncom/withastro/flue/blob/HEAD/packages/sdk/packages/postgres) |Postgres persistence adapter |\n\n## Readme\n\n### Keywords\n\nnone\n\n## Package Sidebar\n\n### Install\n\n`npm i @flue/sdk`\n\n### Repository\n\n[github.com/withastro/flue](https://github.com/withastro/flue)\n\n### Homepage\n\n[flueframework.com/](https://flueframework.com/)\n\n### Weekly Downloads\n\n96,434\n\n### Version\n\n2\\.0.3\n\n### License\n\nApache-2.0\n\n### Last publish\n\n2 days ago\n\n### Collaborators\n\n* fredkschott\n  \n  fredkschott\n\n[**Analyze security** with Socket](https://socket.dev/npm/package/%40flue%2Fsdk) [**Check bundle size**](https://bundlephobia.com/package/%40flue%2Fsdk) [**View package health**](https://snyk.io/advisor/npm-package/%40flue%2Fsdk) [**Explore dependencies**](https://npmgraph.js.org/?q=%40flue%2Fsdk)\n\n[**Report** malware](https://www.npmjs.com/support?inquire=security&security-inquire=malware&package=%40flue%2Fsdk&version=2.0.3)\n\n## Footer\n\n[](https://github.com/npm)\n\n[](https://github.com)\n\n### Support"
    ]
  },
  {
    "url": "https://betterstack.com/community/guides/ai/flue-framework",
    "title": "Flue: Headless, Programmable AI Agent Framework from the Astro Team | Better Stack Community",
    "excerpts": [
      "Back to AI guides\n\n# Flue: Headless, Programmable AI Agent Framework from the Astro Team\n\nStanley Ulili\n\nUpdated on June 8, 2026\n\n###### Contents\n\n* The harness concept\n* Installation and setup\n* Creating an agent\n* Building a workflow with a skill\n* Sandboxes\n* Exposing a workflow as an HTTP endpoint\n* Final thoughts\n\n[Flue](https://github.com/withastro/flue) is an **open-source TypeScript framework for building AI agents** , developed by the Astro team. It was originally built to automate AI workflows inside Astro's own GitHub repositories. Its design is headless and programmable: **agents can run without a human present** , triggered by API calls, webhooks, or cron jobs, and deployable to Node.js or Cloudflare Workers.\n\n## The harness concept\n\nFlue's documentation defines an AI agent as an LLM running inside a harness.\nThe LLM provides reasoning capability; the harness provides the tools, context, memory, and environment the LLM needs to interact with external systems and complete tasks.\n\nWithout a harness, an LLM responds to individual API calls with no persistent state and no tool access. Flue is the programmable harness layer: it provides session management, tool and skill execution, sandbox environments, and a structured output format.\n\nDocumentation page for \"What is an agent?\" illustrating the concept of an LLM running inside a harness\n\n## Installation and setup\n\nCopied!\n\n```\nmkdir flue-tutorial && cd flue-tutorial\n```\n\nCopied!\n\n```\nnpm install @flue/runtime\n```\n\nCopied!\n\n```\nnpm install --save-dev @flue/cli\n```\n\nCreate a `.env` file with your LLM provider API key:\n\n.env\n\nCopied!\n\n```\nANTHROPIC_API_KEY=\"your-anthropic-api-key-here\"\n```\n\nInitialize the project configuration:\n\nCopied!\n\n```\nnpx flue init --target node\n```\n\nThis creates `flue.config.ts` :\n\nflue.config.ts\n\nCopied!\n\n```\nimport { defineConfig } from '@flue/cli/config';\n\nexport default defineConfig({\n  target: 'node',\n});\n```\n\n`target` can be `'node'` (Node.js server using Hono) or `'cloudflare'` (Cloudflare Worker with Durable Objects for persistence).\n\nFlue documentation showing the installation and initialization commands\n\n## Creating an agent\n\nFlue looks for agent definitions in an `agents/` directory. The filename becomes the agent's ID.\n\nCopied!\n\n```\nmkdir agents\n```\n\nagents/hello-world.ts\n\nCopied!\n\n```\nimport { createAgent } from '@flue/runtime';\n\nexport default createAgent(() => ({\n  model: 'anthropic/claude-3.5-sonnet',\n  instructions: 'Tell a funny \"hello world\" engineering joke.',\n}));\n```\n\nConnect to the agent interactively:\n\nCopied!\n\n```\nnpx flue connect hello-world local-session\n```\n\n`local-session` is the instance ID. It identifies this conversation and enables session persistence across interactions.\n\nAfter the agent responds, Flue prints a JSON summary:"
    ]
  },
  {
    "url": "https://code.claude.com/docs/en/hooks",
    "title": "Hooks reference - Claude Code Docs",
    "excerpts": [
      "Hooks reference - Claude Code Docs\nIn addition to command, HTTP, and MCP tool hooks, Claude Code supports prompt-based hooks (type: \"prompt\") that use an LLM to evaluate whether to allow or block an action, and agent hooks (type: \"agent\") that spawn an agentic verifier with tool access."
    ]
  },
  {
    "url": "https://www.daytona.io/docs/en/guides/flue/flue-autonomous-bug-fix-agent",
    "title": "Build an Autonomous Bug-Fix Agent with Flue and Daytona",
    "excerpts": [
      "# Build an Autonomous Bug-Fix Agent with Flue and Daytona\n\nCopy for LLM [View as Markdown](https://www.daytona.io/docs/en/guides/flue/flue-autonomous-bug-fix-agent.md) Open\n\nThis guide builds an autonomous bug-fix agent using [Flue](https://flueframework.com/) and [Daytona](https://www.daytona.io/) sandboxes. Given a GitHub issue, the agent reproduces the bug with a failing test, implements the minimal fix, runs the full test suite, and opens a real pull request.\n\nA sandbox is essential for this workflow. The agent clones unknown code, installs unknown dependencies, and executes the project’s test suite — operations that need strict isolation from your host. Daytona provisions a fresh isolated environment for every run and tears it down on completion, so an untrusted repository can never affect your host.\n\n* * *\n\n### 1\\. Workflow Overview\n\nSection titled “1. Workflow Overview”\n\nYou point the agent at an open issue on any GitHub repository.\n\n...\n\n```\n\nFlue boots a webhook server on port `3583` and discovers the `bug-fix` agent automatically:\n\n```\n[flue] Starting dev server (target: node) [flue] Target: node [flue] Found 1 role(s): test-driven-developer [flue] Found 1 agent(s): bug-fix [flue] Webhook agents: bug-fix [flue] Built: dist/server.mjs [flue] Server: http://localhost:3583 [flue] Try: curl -X POST http://localhost:3583/agents/bug-fix/test-1 \\ -H 'Content-Type: application/json' -d '{}' [flue] Press Ctrl+C to stop\n```\n\n#### Trigger the Agent\n\nSection titled “Trigger the Agent”\n\nThere are three equivalent ways to trigger the agent. Pick whichever fits your workflow.\n\n**Option A: drive everything from `.env`** (default sync mode). With `DEMO_REPO=your-username/your-fork` and `DEMO_ISSUE=<number>` set in `.env` , fire an empty payload:\n\nTerminal window\n\n```\ncurl -X POST http://localhost:3583/agents/bug-fix/run-1 \\ -H \" Content-Type: application/json \" \\ -d ' {} '\n```\n\n**Option B: pass the target per call** (default sync mode).\n\n...\n\nThe role is referenced in the skill call ( `role: 'test-driven-developer'` ) and shapes how the agent makes tradeoffs (minimal change, match host code style, never disable existing tests).\n\n#### How `bug-fix.ts` is actually invoked\n\nSection titled “How bug-fix.ts is actually invoked”\n\nNothing in our code calls our agent’s default export directly; Flue’s CLI does. Here’s the full chain from `npm run dev` to `handler(ctx)` :\n\n**Build time ( `flue dev` startup):**\n\n1. `flue dev --target node` calls `dev()` from `@flue/sdk` , which runs `build()` .\n2. `build()` does `fs.readdirSync('.flue/agents')` and keeps any entry matching `/\\.(ts|js|mts|mjs)$/` . Our `bug-fix.ts` matches → agent name is `bug-fix` (filename without extension).\n3. For each agent file, Flue uses the TypeScript AST to find the static `export const triggers = {...}` declaration, validating that `webhook` is `true` or `false` . Our `triggers = { webhook: true }` registers the agent for HTTP access.\n4.\n\n...\n\n[flue] Agent started I'll work through this systematically following the test-driven approach. [flue] tool:start  read  /home/daytona/project/package.json [flue] tool:done   read  (1477 chars) [flue] tool:start  glob  **/*.test.* [flue] tool:done   glob [flue] tool:start  read  /home/daytona/project/src/index.ts [flue] tool:start  read  /home/daytona/project/src/parse.test.ts [flue] tool:done   read  (5864 chars) [flue] tool:done   read  (5082 chars) Now I have a clear picture. Let me verify what `format(Number.MAX_VALUE)` actually produces, then set up the branch and write the failing test: [flue] tool:start  bash  $ node -e \"const out = ms(Number.MAX_VALUE); ...\" [flue] tool:done   bash  (218 chars) I've confirmed the bug: format(Number.MAX_VALUE) produces \"5.696545792019405e+297y\" which the regex in parse() cannot match."
    ]
  }
]
````

## Assistant

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/guide/building-agents/",
  "objective": "Extract Flue's agent programming model, runtime lifecycle, identity, local authoring loop, and constraints relevant to an existing TypeScript agent application.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/guide/durability/",
  "objective": "Extract Flue's guarantees and limitations for durable conversations, persistence, retries, crash/redeploy recovery, idempotency, and Node versus Cloudflare behavior.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/guide/routing/",
  "objective": "Extract Flue's server/API routing contract, admission and async execution model, conversation endpoints, auth/security boundaries, and app integration requirements.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/guide/evals/",
  "objective": "Extract Flue's development-time testing and evaluation workflow, local commands, fixture/model behavior, assertions, and CI story.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/ecosystem/deploy/node/",
  "objective": "Extract the complete operational deployment story for Flue on Node: build artifact, runtime, database/persistence, process model, scaling, required environment, and platform examples.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/ecosystem/deploy/cloudflare/",
  "objective": "Extract the complete Flue Cloudflare deployment story: build/deploy steps, Durable Object binding/state, execution limits, secrets, migrations, scaling, observability, and platform coupling.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://trytilde.ai/docs/llms/chatkit.md",
  "objective": "Extract Tilde's custom agent development and operation model: Harness SDK, Vercel AI SDK, endpoints, triggers/signals/history, security, local development, and deployment requirements.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://trytilde.ai/docs/llms/dev-tunnels.md",
  "objective": "Extract Tilde's local development and remote integration testing story, including tunnel setup, configuration changes, security, and failure modes.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://trytilde.ai/docs/llms/state.md",
  "objective": "Extract Tilde's infrastructure-as-code/export/import and environment promotion story, including what state captures, secret handling, portability, drift, and deployment workflow.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://trytilde.ai/docs/connect-your-agent",
  "objective": "Extract how Tilde integrates into existing agents via MCP, what remains hosted by Tilde versus the application, supported clients, auth requirements, and operational boundaries.",
  "forceRefetch": true
}
```

## User

**Tool Result:** `TU-0346wYZNq29Fo2EvdVthHG`

````
# description: Create an agent, configure its capabilities, and send it messages over time.
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Agent Functions
An agent function represents an agent in Flue. In Flue, an agent is a JavaScript function that returns the agent’s `system` prompt instructions. Those instructions are rendered, and then passed to the LLM along with the user and assistant messages that make up some agent conversation or workflow.
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Agent Functions
```ts
// Example: A simple agent, written in Flue.
function TriageAgent() {
  return "Investigate the user's issue and recommend the next action.";
}
````

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Agent Functions
An agent is always initialized with an ID. You can provide one via the `--id` flag to `flue run` (optional) or the `POST /:id` route of a hosted agent (required). It’s up to you what the ID means — a user ID, a support ticket, a GitHub issue number, or just a random string.

...

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Agent Functions

```ts
function TriageAgent({ id }) {
  return `Investigate GitHub issue #${id} and recommend the next action.`;
}
```

There are other ways to pass (structured) data to your agent — see [Passing data to the agent](https://flueframework.com/docs/guide/agent-hooks/) in the Agent Hooks guide.
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Agent Functions
The agent function _re-renders_ on every turn. That is, every time the model is about to be called, Flue runs your function again and rebuilds its instructions from scratch. The string you return always reflects the agent’s current state at that moment:

...

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Agent Functions
If it helps, you can think of an agent function as similar to a React component render function. This is not accidental, as you’ll soon see below: Flue agent functions were intentionally modeled after React to help unlock more expressive, more powerful agent functionality.
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Agent Hooks
An agent function isn’t much on its own. It returns instructions, but a working agent needs more than words — a model, tools, a workspace, memory. To unlock all of that, you’ll reach for Flue’s second core primitive: **agent hooks**.

...

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Agent Hooks

- [Model](https://flueframework.com/docs/guide/models/) (`useModel`) selects the LLM that powers the agent.
- [Sandbox](https://flueframework.com/docs/guide/sandboxes/) (`useSandbox`) provides its filesystem and command-execution environment.

...

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Agent Hooks

- [Persisted State](https://flueframework.com/docs/guide/agent-hooks/) (`usePersistentState`) preserves custom data across the agent lifetime.
- [Event Hooks](https://flueframework.com/docs/guide/agent-hooks/) (`useAgentStart`, `useAgentFinish`, and others) trigger logic on different lifecycle events.
  title: Agents | Flue
  image: https://flueframework.com/docs/og4.jpg > Agent Hooks

````ts
import { useModel, useSandbox, useSkill, useTool } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { searchIssues } from '../tools/search-issues.ts';
import reviewChecklist from '../skills/review-checklist/SKILL.md';

function Triage() {
  useModel('anthropic/claude-sonnet-4-6');
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Agent Hooks
```ts
  useSandbox(local());
  useTool(searchIssues);
  useSkill(reviewChecklist);
  return 'Investigate the reported issue and recommend the next action.';
}
````

...

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > “use agent” Directive

```ts
"use agent";
import { useModel } from "@flue/runtime";

export function TriageAgent() {
  useModel("anthropic/claude-sonnet-4-6");
  return "Investigate the reported issue and recommend the next action.";
}
```

...

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > “use agent” Directive
Registration is what makes an agent addressable by the rest of your application: `dispatch(...)` can send it messages, and `createAgentRouter(...)` can serve it over HTTP. The exported function’s name also becomes the agent’s durable identity, which keys its conversation storage in the persistent database.
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > “use agent” Directive
To rename the function without a database migration, pin the identity with the [agentName static](https://flueframework.com/docs/reference/agent-api/). Setting an explicit agent name is considered a best-practice by some Flue developers.
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > “use agent” Directive

```ts
"use agent";
import { useModel } from "@flue/runtime";

export function TriageAgent() {
  useModel("anthropic/claude-sonnet-4-6");
  return "Investigate the reported issue and recommend the next action.";
}

TriageAgent.agentName = "triage-agent";
```

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent
There are several ways to interact with an agent. All of them run the same agent and durability APIs — they differ only in how the runtime starts and whether an HTTP server exists.
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > CLI
The easiest way to interact with your agent is locally, with the `flue run` CLI command:

```bash
flue run src/agents/triage-agent.ts --message "Triage issue 17307"
```

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > CLI
This runs one agent module directly — no server, no application build. Pass `--id` to name the conversation so you can continue it across invocations; without it, each run starts a fresh conversation and prints its generated id:
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > CLI

```bash
flue run src/agents/triage-agent.ts --id issue-17307 --message "Look at issue 17307"
flue run src/agents/triage-agent.ts --id issue-17307 --message "Any update?"
```

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > CLI
Conversations persist between runs — in your project’s configured database, or a local cache file without one. See the [flue run reference](https://flueframework.com/docs/cli/run/) for agent selection, structured output, and the full flag list.
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > HTTP
Agents mounted in your application are served over HTTP (mounting is covered in [Routing](https://flueframework.com/docs/guide/routing/)). Each conversation has its own URL, ending in the conversation id. `POST` a message to it:

...

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > HTTP
Prompts are fire-and-forget: the server responds `202` immediately, and the agent’s reply is read from the conversation — `GET` the same URL to follow its events, or use the [Flue Agent SDK](https://flueframework.com/docs/sdk/overview/), which wraps the whole surface (`send()`, `wait()`, `observe()`, `history()`) around one

...

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > `dispatch()`
Your application chooses the agent conversation before dispatching the event. `dispatch(...)` accepts it for asynchronous processing rather than waiting for an agent response. Because registration comes from the `'use agent'` scan, an agent used only through `dispatch(...)` needs no mount at all.

...

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > Standalone scripts
Finally, you can run agents outside of a Flue application entirely — no server, no `app.ts` — with the more advanced `start()` API. It boots the Flue runtime inside your own Node.js process, which is useful for cron jobs, one-off scripts, and tests:
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > Standalone scripts

```ts
import { init } from "@flue/runtime";
import { sqlite, start } from "@flue/runtime/node";
import { Reporter } from "../src/agents/reporter.ts";

await using flue = await start({
  agents: [Reporter],
  db: sqlite("./nightly.db"),
});

const reporter = init(Reporter, { id: "nightly-2026-07-16" });
```

...

title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > Standalone scripts
Provider credentials come from the process environment, and the `db` option decides whether conversations outlive the script: omit it for in-memory state, or pass an adapter like `sqlite()` so a later run can continue the same conversation.
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Interacting with your agent > Standalone scripts
Inside an already-running Flue application there is no `start()` — call `init()` or `dispatch()` directly. The [Workflows](https://flueframework.com/docs/guide/workflows/) guide covers this scripting surface in depth, from CI pipelines to durable orchestration.
title: Agents | Flue
image: https://flueframework.com/docs/og4.jpg > Next steps

- [Agent Hooks](https://flueframework.com/docs/guide/agent-hooks/) — compose your agent’s capabilities: tools, skills, state, and event hooks.
- [Agent API](https://flueframework.com/docs/reference/agent-api/) — look up session operations and their results.

```

**Tool Result:** `TU-0346wYZOELetURr1MvNudi`

```

# description: The accepted-work contract — what survives crashes, restarts, and redeploys, and how interrupted agent work recovers.

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Submissions and the accepted-work contract

> Every accepted submission reaches exactly one durable terminal outcome — `completed`, `failed`, or `aborted` — no matter how many crashes happen in between.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Submissions and the accepted-work contract
response runs as its own submission. Processing happens in **attempts**: a coordinator claims the submission, runs it, and settles it. An interruption consumes the attempt; recovery claims a new one, up to the retry budget.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
A crash leaves no record of itself — the dead process stops writing. Recovery runs when a replacement owner wakes (how that happens is per-target) and works exclusively from durable evidence: the canonical conversation records, the submission’s admission row, and its attempt bookkeeping.
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
Recovery proceeds in two phases. First it **converges** the stream: any partially streamed assistant output the dead attempt persisted is closed out as an aborted entry — unconditionally and idempotently, so no crash shape can leave the conversation looking mid-stream.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
| Durable evidence after the input | What recovery does |
| The input was never persisted | Requeues the submission for a clean first attempt. |
| A partial response with text or reasoning | Tells the model its stream was interrupted and continues from the durable partial. |title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
| Durable evidence after the input | What recovery does |
| The input was never persisted | Requeues the submission for a clean first attempt. |
| A tool turn with unresolved calls | Repairs the tool batch (below), then continues the turn loop. |title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
| Durable evidence after the input | What recovery does |
| The input was never persisted | Requeues the submission for a clean first attempt. |
| A transient provider error (rate limit, outage) | Retries the turn after a backoff, under a bounded error budget. |title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
| Durable evidence after the input | What recovery does |
| The input was never persisted | Requeues the submission for a clean first attempt. |
| A context-overflow response | Compacts the conversation and retries the turn. |
| A durable abort intent | Settles aborted. |
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
Tool-batch repair is deliberately conservative. Results that were recorded before the crash are preserved exactly — those calls never run again.
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
An unresolved ordinary call is _not_ re-executed, because the runtime cannot know which of its side effects already happened; instead it settles with an explicit unknown-outcome error that the model sees and can react to.
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
Two kinds of calls resolve real outcomes instead of markers: durable: true tools re-execute with their completed steps replaying from records, and in-flight delegated tasks resume from their own transcripts.
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
The overall discipline is **at-least-once execution over exactly-once recording**. Work that committed durably — recorded responses, recorded tool results, committed state writes — never re-runs.
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery after an interruption
Work that was interrupted before committing re-runs on the next attempt, which includes your [event hook](https://flueframework.com/docs/guide/agent-hooks/) callbacks: their durable effects commit atomically and never duplicate, but an external side effect inside one (an email, a page) may rarely happen

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Retry budget and timeout

```ts
"use agent";
import { useModel } from "@flue/runtime";

export function IssueTriage() {
  useModel("anthropic/claude-opus-4-6");
  return "Triage the bound issue end-to-end.";
}

IssueTriage.durability = { maxAttempts: 5, timeoutMs: 7_200_000 };
```

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Durable tools and `step.do`
For work that must complete — a payment, a provisioning job, a multi-step sync — declare the tool `durable: true`: its `run` receives `step`, every side effect goes through `step.do(name, fn)`, and recovery re-executes the call instead of marking it interrupted:

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Durable tools and `step.do`
Each completed `step.do` durably records its returned value before resolving. On recovery the whole call re-runs, completed steps return their recorded values without executing, and execution continues from the first step that never finished.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Durable tools and `step.do`

- **Steps are exactly-once-recorded, at-least-once-executed.** A crash in the window between a step’s function finishing and its record landing re-runs that one step, so steps around external effects should be individually idempotent.
  title: Durability | Flue
  image: https://flueframework.com/docs/og4.jpg > Durable tools and `step.do`
- **A redeploy can withdraw the contract.** If recovery finds the current render no longer declares the tool — or no longer marks it `durable` — the call falls back to the ordinary interrupted-marker path rather than guessing.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Delegated tasks
When recovery repairs a tool batch containing an unresolved `task` call, it does not settle the call with a marker — it reattaches to the child’s durable transcript, resumes the child to completion under the same recovery rules described above, and commits the child’s real final result as the parent’s tool outcome.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Delegated tasks

- **A delegate removed by a redeploy.** If the subagent is no longer declared when recovery runs, that one call settles with an error outcome and the parent continues; a renamed or removed delegate cannot be resumed under any retry.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Persisted state
Every [usePersistentState](https://flueframework.com/docs/guide/agent-hooks/) write is a record in the conversation’s canonical stream, which is why state survives restarts for the life of the conversation.
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Persisted state
Its recovery behavior follows from _when_ writes commit: a write becomes durable atomically with the unit of work that made it. A write from a tool commits with that turn’s tool batch; a write from an event hook commits with the hook seam’s checkpoint.
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Persisted state
If recovery settles the batch as interrupted, the write never happened — the re-attempt renders from the last committed state, exactly matching the work the model actually sees as done.
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Persisted state
That atomicity is what makes persistent state the correct guard for at-least-once callbacks: a `sent` flag set by the same unit of work that sent the email cannot end up `true` while the work it guarded rolled back.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery by target > Node.js recovery
On Node, a coordinator inside your server process owns submission processing. Ownership is lease-based: each running submission carries a short lease that the owning process heartbeats while working. Recovery has two triggers:
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery by target > Node.js recovery

- **Startup reconciliation.** A replacement process scans for interrupted work when it boots and requeues it, then begins serving immediately while that work settles in the background.
  title: Durability | Flue
  image: https://flueframework.com/docs/og4.jpg > Recovery by target > Node.js recovery
  Ordering is preserved per conversation — recovered work runs ahead of newly delivered work, so a restart never reorders a conversation’s timeline.
  title: Durability | Flue
  image: https://flueframework.com/docs/og4.jpg > Recovery by target > Node.js recovery
- **Periodic lease scans.** While running, the coordinator scans for expired leases, so work stranded by a fast restart — where the new process boots before the old lease expires — is reclaimed within seconds rather than waiting for another restart.
  title: Durability | Flue
  image: https://flueframework.com/docs/og4.jpg > Recovery by target > Node.js recovery
  Graceful shutdown aborts active submissions at the turn boundary and waits for them to settle; work that does not settle in time is left running with its lease intact, and the next startup reclaims it after expiry.
  Two consequences for deployment:
  title: Durability | Flue
  image: https://flueframework.com/docs/og4.jpg > Recovery by target > Node.js recovery
- **Recovery is only as durable as the database.** With the in-memory default, accepted work survives interruptions within the process lifetime but a restart loses everything; cross-restart recovery requires a durable adapter in [db.ts](https://flueframework.com/docs/guide/database/).
  title: Durability | Flue
  image: https://flueframework.com/docs/og4.jpg > Recovery by target > Node.js recovery
- **One live owner per conversation.** A shared database lets a _replacement_ process recover accepted work, but it does not make two concurrent owners of the same conversation safe. Multi-replica deployments must route each conversation to one owner and avoid overlapping owners during replacement.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery by target > Cloudflare recovery
On Cloudflare, every agent conversation is a Durable Object with its own SQLite storage, so ownership is structural — the platform guarantees one live instance per conversation, and there is no lease protocol to operate. Recovery is wake-driven:
title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Recovery by target > Cloudflare recovery

- **Wake on start.** Whenever the Durable Object starts — after an eviction, a code deploy, or a platform reset — Flue immediately flags any attempt that was running when the previous instance died and reconciles it before serving new work. The platform’s fiber-recovery callback triggers the same reconciliation path.
  title: Durability | Flue
  image: https://flueframework.com/docs/og4.jpg > Recovery by target > Cloudflare recovery
- **A durable wake schedule.** While unsettled work exists, the object keeps a short self-renewing wake scheduled, so an interrupted submission recovers promptly even if no external request ever arrives to wake the object.
  title: Durability | Flue
  image: https://flueframework.com/docs/og4.jpg > Recovery by target > Cloudflare recovery
  Each wake runs a bounded supervision pass — reconcile, enforce deadlines, start work — and re-arms its successor before doing anything that can fail, so a hung attempt or a failed pass can delay supervision by at most one wake, never break it. Attempt execution runs detached from the wake that started it.
  title: Durability | Flue
  image: https://flueframework.com/docs/og4.jpg > Recovery by target > Cloudflare recovery
  Abort intents, attempt bookkeeping, and settlement records all live in the object’s own storage, so an abort requested while the object was evicted is honored on the next wake. See the [Cloudflare target guide](https://flueframework.com/docs/guide/cloudflare-target/) for the target’s execution model.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > What is deliberately not durable > Keep workspace state separate
Workspace persistence is a separate, independent choice from conversation persistence: a durable workspace comes from a [sandbox adapter](https://flueframework.com/docs/guide/sandboxes/) that keys the provider workspace on the agent instance id, so every submission — including a recovery attempt — resolves

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > What is deliberately not durable > Code outside the agent
Flue does not checkpoint arbitrary TypeScript execution and resume a function from its last completed line. The checkpoint boundary is the agent itself: _inside_ it, a durable tool gives application-controlled work resumable `step.do` checkpoints backed by the conversation’s own durability.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > What is deliberately not durable > External side effects
Recovery never blindly repeats uncertain effectful work, but at-least-once execution means an effect at the boundary can repeat; design external effects to be idempotent, key them on stable ids like `toolCallId` or `step.do` names, and guard one-shot actions with persistent state.

...

title: Durability | Flue
image: https://flueframework.com/docs/og4.jpg > Next steps

- [Node.js](https://flueframework.com/docs/guide/node-target/) and [Cloudflare](https://flueframework.com/docs/guide/cloudflare-target/) — target-specific runtime behavior.
- [Observability](https://flueframework.com/docs/guide/observability/) — watch submissions, settlements, and recovery as they happen.

```

**Tool Result:** `TU-0346wYZP0ejKqJSz9SNtbr`

```

# description: Mount agents, channels, and custom routes explicitly in app.ts.

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg
This guide covers that route map — `app.ts` — mounting agents with `createAgentRouter(...)`, the URL surface each conversation gets, and how to protect it.
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > `app.ts` is the route map
Every Flue application has one HTTP entrypoint: `src/app.ts`. Its default export is the server — every agent, channel, and custom route your application serves is mounted there explicitly. Flue does not generate routes from filenames or directory conventions: if a route exists, `app.ts` put it there.

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > `app.ts` is the route map
Flue uses [Hono](https://hono.dev/) by convention, but nothing here is Hono-specific: the default export just needs a fetch-compatible shape, and the routers Flue gives you expose `.fetch` themselves, so they mount in any fetch-based framework.

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > `app.ts` is the route map

```ts
import type { Fetchable } from "@flue/runtime/routing";

const app: Fetchable = {
  fetch(request, env, ctx) {
    return new Response("Not found", { status: 404 });
  },
};

export default app;
```

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > `app.ts` is the route map
A Hono application already satisfies this interface. On Cloudflare, `env` contains bindings and `ctx` is the execution context. On Node.js, `env` contains the Hono Node adapter bindings and `ctx` is `undefined`.
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > `app.ts` is the route map
Because it’s a plain router, `app.ts` is also where the rest of your application’s HTTP lives: health checks, webhook receivers that [dispatch(...)](https://flueframework.com/docs/guide/building-agents/) into agents, static assets for a chat UI, and channel mounts all compose alongside your agent routes.

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Mounting an agent

````ts
import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { Support } from './agents/support.ts';
import { Triage } from './agents/triage.ts';

const app = new Hono();

app.route('/agents/support', createAgentRouter(Support));
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Mounting an agent
```ts
app.route('/api/assistants/triage', createAgentRouter(Triage));

export default app;
````

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Mounting an agent

- **The URL is yours.** `/agents/<name>` is a convention, not a requirement — mount under `/api`, behind a versioned prefix, anywhere. The mount path is pure routing, and clients address whatever URL you choose.
  title: Routing | Flue
  image: https://flueframework.com/docs/og4.jpg > Mounting an agent
- **The mount path is not the agent’s identity.** Conversations are keyed by the agent’s durable identity — its function name, or an `agentName` static override — never by the URL. You can move a mount without a data migration, and mounting the same agent at two paths serves the same conversations from both.
  title: Routing | Flue
  image: https://flueframework.com/docs/og4.jpg > Mounting an agent
- **It’s a pure factory.** `createAgentRouter(...)` has no side effects and no options; call it any number of times, or never. Everything else about the agent — model, durability, initial-data schema — is declared on the agent module itself, not at the mount.
  title: Routing | Flue
  image: https://flueframework.com/docs/og4.jpg > Mounting an agent
- **Mounting is the exposure decision, not registration.** The ['use agent' scan](https://flueframework.com/docs/guide/building-agents/) is what makes an agent exist; the router only builds an HTTP surface over an already-registered agent.

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > The conversation URL
The id is the same caller-chosen identifier described in the [Agents guide](https://flueframework.com/docs/guide/building-agents/) — a user id, a ticket number, any string — and the conversation is created on the first message it receives. Relative to the mount, the router serves:
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > The conversation URL
| Route | Purpose |
| POST /:id | Deliver one message (202 admission). |
| GET /:id | Read the conversation (snapshot, updates, or live stream). |
| HEAD /:id | Read conversation stream metadata. |
| GET /:id/attachments/:attachmentId | Download one attachment’s bytes. |
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > The conversation URL > Sending a message
`POST` the message to the conversation URL. The body is the same `DeliveredMessage` shape a server-side `dispatch(...)` admits — a `user` chat turn or a structured `signal` — optionally alongside `initialData` for instance creation:

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > The conversation URL > Sending a message
Sends are **fire-and-forget**: the server responds `202` as soon as the message is durably admitted, before the agent runs. The response carries the coordinates for following the outcome — the conversation’s stream URL, an opaque resume offset, and a submission id:
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > The conversation URL > Sending a message

```json
{
  "streamUrl": "https://example.com/agents/support/ticket-8472",
  "offset": "-1",
  "submissionId": "sub_01HZX..."
}
```

There is no “wait for the reply” mode on this route. The agent’s reply lands in the conversation, and you read it from there.
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > The conversation URL > Reading the conversation
`GET` the same URL to read the conversation. A plain `GET` returns one materialized snapshot — every message reduced to complete, render-ready parts. Query parameters select live modes: `?view=updates&offset=...` reads changes after an offset, with long-polling or server-sent events for continuous streaming.

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > The conversation URL > The SDK wraps this surface
A [createFlueClient(...)](https://flueframework.com/docs/sdk/create-flue-client/) client addresses exactly one conversation URL and packages the whole surface — `send()`, `wait()`, `observe()`, `history()`, `abort()`, and `attachmentUrl()` — over the routes above:
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > The conversation URL > The SDK wraps this surface

````ts
import { createFlueClient } from '@flue/sdk';

const conversation = createFlueClient({
  url: 'https://example.com/agents/support/ticket-8472',
  token: userToken,
});

const admission = await conversation.send({
  message: { kind: 'user', body: 'Can you summarize the open issues in my case?' },
});
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > The conversation URL > The SDK wraps this surface
```ts
await conversation.wait(admission);
const { messages } = await conversation.history();
````

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > The conversation URL > The SDK wraps this surface
The client takes no agent name or deployment address — the URL is the whole contract, so the mount layout never leaks into client configuration. For chat UIs, [useFlueAgent({ url })](https://flueframework.com/docs/guide/react/) from `@flue/react` wraps the same client with maintained conversation state.

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Protecting your agents
A mounted agent has no built-in authentication: **anyone who can reach a conversation URL can talk to that conversation** — send it messages, read its full history, abort its work. There is no per-agent middleware export either.
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Protecting your agents
Treat a mount like any other sensitive endpoint and protect it with your application’s normal middleware, layered in `app.ts` before the mount it applies to.
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Protecting your agents
There are two checks, and production applications need both:

1. **Authentication** — who is the caller?
2. **Authorization** — is this caller allowed to access _this conversation id_?
   title: Routing | Flue
   image: https://flueframework.com/docs/og4.jpg > Protecting your agents
   Conversation ids are caller-chosen path segments: without an ownership check, any authenticated user can read another user’s conversation by guessing its id.
   title: Routing | Flue
   image: https://flueframework.com/docs/og4.jpg > Protecting your agents

````ts
import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { Support } from './agents/support.ts';
import { canAccessTicket, verifySession } from './shared/auth.ts';

const app = new Hono();

app.use('/agents/support/*', async (c, next) => {
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Protecting your agents
```ts
  const user = await verifySession(c.req.raw); // your application's auth
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  // The conversation id is the first path segment after the mount.
  const [conversationId] = c.req.path.slice('/agents/support/'.length).split('/');
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Protecting your agents
```ts
  if (!(await canAccessTicket(user, conversationId))) {
    return c.json({ error: 'forbidden' }, 403);
  }
  return next();
});
app.route('/agents/support', createAgentRouter(Support));

export default app;
````

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Protecting your agents
This is ordinary Hono composition, so anything your framework supports works here: shared middleware over a broader prefix (`app.use('/agents/*', requireUser)`), bearer tokens, session cookies, signature verification, per-route rate limits.

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Protecting your agents

- **Server-issued ids.** Instead of trusting caller-chosen ids, derive them from the authenticated principal (`user-${user.id}`) or issue them from your own database. The ownership check then becomes a simple equality test.

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Mounting a channel
Channel objects expose their own `.route()` factory — a separate API from the agent router, but the same kind of pure, mountable sub-router. It serves the provider’s declared routes relative to the mount point:
title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Mounting a channel

```ts
import { channel as slack } from "./channels/slack.ts";

app.route("/channels/slack", slack.route());
// Slack's Events API endpoint is now POST /channels/slack/events
```

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Mounting a directory of agents

```ts
  for (const [exportName, agent] of Object.entries(mod)) {
    if (typeof agent !== 'function' || !/^[A-Z]/.test(exportName)) continue; // agents are the capitalized exports
    app.route(`/agents/${agent.agentName ?? exportName}`, createAgentRouter(agent));
  }
}

export default app;
```

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Dispatch-only agents
Registration comes from the `'use agent'` scan, so any registered agent can receive messages through server-side [dispatch(...)](https://flueframework.com/docs/guide/building-agents/) — from a webhook route in `app.ts`, a [channel](https://flueframework.com/docs/guide/channels/), or a

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Dispatch-only agents

```ts
// registered, but only this verified webhook can reach it.
app.post('/webhooks/billing', async (c) => {
  const event = await verifyBillingWebhook(c.req.raw);
  const receipt = await dispatch(InvoiceAuditor, {
    id: event.invoiceId,
    message: {
      kind: 'signal',
```

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Next steps

- [Agents](https://flueframework.com/docs/guide/building-agents/) — every way to interact with an agent: CLI, HTTP, `dispatch()`, and standalone scripts.
- [Agent SDK](https://flueframework.com/docs/sdk/overview/) — the client that wraps a conversation URL.

...

title: Routing | Flue
image: https://flueframework.com/docs/og4.jpg > Next steps

- [Streaming Protocol](https://flueframework.com/docs/reference/streaming-protocol/) — the wire protocol behind conversation reads.
- [Deploy](https://flueframework.com/docs/guide/deploy/) — build `app.ts` and your agents into a deployable server.

```

**Tool Result:** `TU-0346wYZPUtjuXYXtMW0Qlr`

```

# description: Test agent behavior by running an agent against a live model and asserting on what it does.

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > What an eval is

- **Evals are nondeterministic.** The same input can produce different wording, a different tool order, occasionally a different outcome. Assert on the behavioral contract — required tool calls, key facts in the reply, the shape of structured data — rather than exact output strings.
  title: Evals | Flue
  image: https://flueframework.com/docs/og4.jpg > What an eval is
- **Evals spend real tokens and real time.** Every case runs one or more live model turns. Evals therefore live in their own suite, with their own configuration, credentials, timeouts, and run cadence, separate from unit tests.
  title: Evals | Flue
  image: https://flueframework.com/docs/og4.jpg > What an eval is
  Flue has no dedicated eval framework. An eval is a [Vitest](https://vitest.dev) test that drives an agent through the same public surfaces every other caller uses — the in-process [init() handle](https://flueframework.com/docs/reference/agent-api/) or the HTTP conversation surface — and asserts on the result.
  title: Evals | Flue
  image: https://flueframework.com/docs/og4.jpg > What an eval is
  The [vitest-evals](https://flueframework.com/docs/ecosystem/tooling/vitest-evals/) integration layers eval harnesses, judges, and CI reporting on top; see below.

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Set up an eval suite

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/evals/**/*.eval.ts"],
    testTimeout: 60_000,
  },
});
```

The `60_000` timeout replaces Vitest’s 5-second default, which a single live model turn can exceed. Add a script so the suite runs with one command:
title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Set up an eval suite

```json
{
  "scripts": {
    "evals": "vitest run --config vitest.evals.config.ts"
  }
}
```

Eval files live under `src/evals/` and are named for the capability or scenario they evaluate — `service-health.eval.ts`, `refund-policy.eval.ts` — not one file per agent.

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Write an eval in-process

```ts
  const reply = await agent.read(receipt, {
    onEvent: (chunk) => {
      if (chunk.type === 'tool-input') toolsCalled.push(chunk.toolName);
    },
  });

  expect(reply.text).toContain('operational');
  expect(toolsCalled).toContain('get_service_status');
});
```

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Write an eval in-process

- **Fresh conversation per case.** `init(agent)` without an `id` addresses a new, uniquely named conversation, so cases stay independent — saved conversation history cannot affect other cases. A case that evaluates conversation memory reuses one handle and sends several `dispatch(...)`/`read(...)` pairs through it.
  title: Evals | Flue
  image: https://flueframework.com/docs/og4.jpg > Write an eval in-process
- **The reply is the assertion target.** `reply.text` is the final assistant text, and `reply.data` carries named [useDataWriter](https://flueframework.com/docs/guide/agent-hooks/) parts — the place to assert on structured results. A failed or aborted run rejects `read()` with `AgentRunError`, which fails the test.

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Write an eval in-process
And the eval imports the agent module directly, so the module must load under plain Vitest: an agent that depends on build-resolved imports, such as a [SKILL.md import](https://flueframework.com/docs/guide/skills/), needs the Flue build and should be evaluated over HTTP instead.
title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Evaluate over HTTP
An agent [mounted in app.ts](https://flueframework.com/docs/guide/routing/) can be evaluated through its HTTP surface with the [Flue Agent SDK](https://flueframework.com/docs/sdk/overview/) — the same boundary a deployed application serves, including your route middleware.

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Evaluate over HTTP

````ts
import { createFlueClient } from '@flue/sdk';
import { expect, it } from 'vitest';

// The agent's mount URL from app.ts; point FLUE_AGENT_URL at a deployment.
const mountUrl = process.env.FLUE_AGENT_URL ?? 'http://127.0.0.1:5173/agents/service-status';

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Evaluate over HTTP
```ts
it('checks live service status before answering', async () => {
  const conversation = createFlueClient({
    url: `${mountUrl}/eval-${crypto.randomUUID()}`,
  });

  const admission = await conversation.send({
    message: { kind: 'user', body: 'Is the checkout service currently operational?' },
  });
````

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Evaluate over HTTP

```ts
  expect(text).toContain('operational');
});
```

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Evaluate over HTTP
Prompts are fire-and-forget over HTTP: `send()` admits the message, `wait()` awaits its completion, and `history()` returns the finished conversation — including the assistant reply and its tool-call parts.

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Evaluate over HTTP

- **In-process (`start()`)** exercises the agent itself — instructions, model, hooks, tools — and needs provider credentials in the test environment.
- **HTTP (`@flue/sdk`)** exercises the agent plus `app.ts` routing and middleware, and needs a running dev server or deployment.

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > vitest-evals
[vitest-evals](https://vitest-evals.sentry.dev/docs) extends Vitest with eval harnesses, LLM judges, normalized reports, and CI reporting. Add Flue’s integration with a [blueprint](https://flueframework.com/docs/cli/add/):

```sh
flue add tooling vitest-evals
```

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > vitest-evals
The blueprint creates the eval configuration and scripts from above and generates `src/evals/harness.ts` — a harness that drives one conversation per case through `@flue/sdk` and converts the reply, tool calls, and usage into the normalized `vitest-evals` result.
title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > vitest-evals
Setup, generated files, and report commands are documented on the [vitest-evals ecosystem page](https://flueframework.com/docs/ecosystem/tooling/vitest-evals/); a complete runnable project is available in [examples/vitest-evals](https://github.com/withastro/flue/tree/main/examples/vitest-evals).

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > vitest-evals

```ts
describeEval('service status agent', { harness }, (it) => {
  it('checks live service status before answering', async ({ run }) => {
    const result = await run('Is the checkout service currently operational?');

    expect(result.output).toContain('operational');
```

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > vitest-evals > Judges
Deterministic assertions cover exact contracts: required tools, prohibited tools, structured output, stable content. For semantic behavior — factual consistency, tone, policy adherence — `vitest-evals` provides **judges**, scorers that grade a result and fail the case below a threshold.

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > vitest-evals > Judges

```ts
    const result = await run('Is the checkout service currently operational?');

    await expect(result).toSatisfyJudge(FactualityJudge(), {
      expected: 'The checkout service is currently operational.',
      threshold: 0.6,
    });
  });
});
```

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > vitest-evals > Judges
`createJudge(...)` defines custom judges, deterministic or LLM-backed; the built-in `FactualityJudge`, `ToolCallJudge`, and `StructuredOutputJudge` cover the common rubrics. Judge construction and judge-harness adapters are documented in the [vitest-evals docs](https://vitest-evals.sentry.dev/docs).

...

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Run evals locally and in CI
Locally, in-process suites run with one command once provider credentials are in the environment:

```sh
pnpm run evals
```

HTTP suites additionally need a reachable target: start the application in another terminal first, or set the suite’s URL variable to a deployed environment:
title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Run evals locally and in CI

```sh
FLUE_AGENT_URL=https://preview.example.com/agents/service-status pnpm run evals
```

title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Run evals locally and in CI
In CI, an eval suite is an ordinary Vitest run — it exits non-zero when a case fails, so it gates a pipeline like any other test job.
title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Run evals locally and in CI
Keep it as a separate job from unit tests: live-model runs are slower, spend tokens, and can fail without a code change, so they warrant their own cadence — on merge, on a schedule, or on demand.
title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Run evals locally and in CI
Provider credentials come from CI secrets; for HTTP suites, either build and start the application inside the job or target a preview [deployment](https://flueframework.com/docs/guide/deploy/).
title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Run evals locally and in CI
For reporting, the vitest-evals blueprint adds an `evals:json` script that writes a `vitest-results.json` artifact. Inspect it locally with `vitest-evals serve vitest-results.json`, or publish it from CI with the `getsentry/vitest-evals` GitHub Action.
title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Run evals locally and in CI
Reports can contain prompts, outputs, tool arguments and results, and errors — review retention and access requirements before uploading them.
title: Evals | Flue
image: https://flueframework.com/docs/og4.jpg > Next steps

- [Vitest Evals](https://flueframework.com/docs/ecosystem/tooling/vitest-evals/) — the blueprint, generated harness, and report commands.
- [Agents](https://flueframework.com/docs/guide/building-agents/) — `start()` and standalone scripts, the same surface evals build on.

```

**Tool Result:** `TU-0346wYZQ53ihGsfj5pXjSM`

```

# description: Build and deploy Flue agents as a Node.js server with Vite.

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg
This guide walks you through creating your first agent, running it locally, and deploying it anywhere you can run Node.js — a VPS, Docker, Railway, Fly.io, or any cloud platform.

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg
Flue is a Vite plugin: `vite dev` serves the application locally and `vite build` produces the deployable server artifact.

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 1. Set up your project

```bash
mkdir my-flue-server && cd my-flue-server
npm init -y
npm install @flue/runtime hono valibot
npm install -D @flue/vite @flue/cli vite
```

Add the Vite plugin:

```ts
import { flue } from "@flue/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [flue()],
});
```

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 1. Set up your project
And the scripts:

```jsonc
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
  },
}
```

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 2. Create your first agent
The directive is how an agent joins the application — the build scans your source root for marked modules, every exported function with a capitalized name is an agent, and the function’s name becomes the agent’s durable identity (an optional `Translator.agentName = '...'` string-literal static overrides it).
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 2. Create your first agent

```typescript
"use agent";
import { useModel } from "@flue/runtime";

export function Translator() {
  useModel("openai/gpt-5.5");
  return "Translate the user message into the requested language. Reply with the translation only.";
}
```

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 2. Create your first agent
Agents that need a filesystem can attach an in-memory [virtual sandbox](https://flueframework.com/docs/guide/sandboxes/) powered by [just-bash](https://github.com/vercel-labs/just-bash) — no container needed.
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 3. Create app.ts — the route map
`app.ts` is the only required file. Its default export owns the request pipeline, and every route is mounted explicitly — `app.ts` IS the routing table:
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 3. Create app.ts — the route map

```typescript
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";
import { Translator } from "./agents/translator.ts";

const app = new Hono();

app.route("/agents/translator", createAgentRouter(Translator));
app.get("/api/ping", (c) => c.text("pong"));
```

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 6. Build for production

```bash
npx vite build
set -a; source .env; set +a
node dist/server.mjs
```

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 6. Build for production
`vite build` compiles your project into `./dist/server.mjs` without packaging `.env` credentials into the server; the built server reads only the environment supplied when you start it. It uses [Hono](https://hono.dev/) under the hood and listens on port 3000 by default (configurable via `PORT`).
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 6. Build for production
Your project’s `node_modules` are still needed at runtime — the build externalizes your dependencies rather than bundling them.
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 6. Build for production
To verify the artifact before deploying, `vite preview` serves the built application (it imports `dist/app.mjs` directly, with production behavior), or run it for real with `node dist/server.mjs`.
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Deterministic tool calls
For structured, schema-validated work inside the conversation, give the agent a harness-connected tool with `useTool({ harness: true })`: `run` receives the agent’s runtime (sandbox and model access) and can call back into the model for sub-tasks.
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Deterministic tool calls

```typescript
'use agent';
import { useModel, useTool } from '@flue/runtime';
import * as v from 'valibot';

export function Reporter() {
  useModel('openai/gpt-5.5');
  useTool({
    name: 'compile-report',
    description: 'Compile the weekly metrics report.',
    input: v.object({ period: v.string() }),
```

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Subagents

```typescript
'use agent';
import { useModel, useSubagent } from '@flue/runtime';

function Analyst() {
  return 'Focus on quantitative insights, trends, and actionable takeaways.';
}

export function Reporter() {
  useSubagent({
    name: 'analyst',
```

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Sandbox context
The agent reads `AGENTS.md` and skills from its sandbox at runtime. With `local()`, that’s your real project root, so any files there are visible. With the virtual sandbox the filesystem starts empty — you’d set up context via `harness.sandbox`. Agents without a sandbox skip workspace discovery entirely.

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Using the local sandbox
`local()` is where Node really shines compared to other targets. The agent runs directly against the host filesystem and shell — `cwd` is `process.cwd()`, shell commands go through `child_process`, and `AGENTS.md` and skills are discovered from the project root.

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Using the local sandbox
Env exposure is opt-in. By default only shell essentials (`PATH`, `HOME`, locale, etc.) are inherited from `process.env`; anything else — API keys, tokens, deploy credentials — has to be passed explicitly via `local({ env: { ... } })`. That keeps the model’s `bash` tool from seeing host secrets by accident.
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Using the local sandbox

```typescript
"use agent";
import { useModel, useSandbox } from "@flue/runtime";
import { local } from "@flue/runtime/node";

export function Reviewer() {
  useModel("anthropic/claude-sonnet-4-6");
  useSandbox(local());
  return "Review the codebase and identify potential issues in the area the user names.";
}
```

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Using the local sandbox
The agent reads, searches, and modifies files via its built-in tools — read, write, edit, grep, glob, bash. Anything on `$PATH` (`git`, `npm`, `gh`, `docker`) is reachable from the bash tool. Env vars are opt-in via `local({ env: { ... } })` — pass `process.env.GH_TOKEN`, `process.env.NPM_TOKEN`, etc.

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Using the local sandbox > When to use it

- **Self-hosted coding agents** — review PRs, fix bugs, refactor against the actual repo.
- **File processing** — read documents, transform data, generate reports from local files.
- **Dev tooling** — analyze project structure, run linters, generate boilerplate.

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Using the local sandbox > When to use it
No container startup, real project context, fast iteration. If you need a tighter boundary on a specific operation — agent can call it, never sees the underlying secret — wrap it as a custom tool via `useTool(...)` in the agent function. The tool reads `process.env`; the agent only sees the tool’s params and result.
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Connecting a remote sandbox
The examples above use either the virtual sandbox or the local sandbox. When you need full isolation per session — each user gets their own Linux environment with git, Node.js, Python, etc. — you want a remote sandbox.

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Connecting a remote sandbox > When to use a remote sandbox
A **remote sandbox** takes seconds to start (cached images are faster) and gives each session its own fully isolated environment, which multi-tenant and SaaS deployments need.

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Conversation persistence
On Node.js, canonical agent conversations, attachments, and accepted submissions use in-memory SQLite by default in the built server, so they persist for the lifetime of one process but are lost on restart.
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Conversation persistence
(`vite dev` points the same default at a local disk file so history survives reloads within a dev session.) Add `db.ts` when that state must survive restart or support replacement recovery. A shared database does not remove the requirement for one live Node owner per agent instance.
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Conversation persistence
See [Database](https://flueframework.com/docs/guide/database/) for `db.ts`, SQLite, Postgres, and custom adapter setup. See [Data Persistence API](https://flueframework.com/docs/reference/data-persistence-api/) for the adapter contract.
title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Building and deploying
Flue compiles your project into a Node.js server:

```bash
# Build
npx vite build

# Run locally
node dist/server.mjs

# Run on a custom port
PORT=8080 node dist/server.mjs
```

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Building and deploying
The built server never runs in local dev mode: developer-only error guidance and the dev SQLite file are wired only through `vite dev`, not through environment variables.
The deployed server exposes exactly the routes `app.ts` mounts. For each mounted agent, relative to its mount:

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Building and deploying
Flue does not add a health endpoint or inspection routes by default. Define a host-required health route in `app.ts` and compose any operator endpoints behind your own authorization. See [Routing](https://flueframework.com/docs/guide/routing/).

...

title: Deploy Agents on Node.js | Flue
image: https://flueframework.com/docs/og4.jpg > Building and deploying > Choosing a sandbox strategy

1. **Empty virtual sandbox** — an agent function with just `useModel(...)`. Fast, cheap, stateless. Good for prompt-and-response agents.
2. **Virtual sandbox with shell setup** — Use `harness.sandbox` to write files and configure the workspace.
   title: Deploy Agents on Node.js | Flue
   image: https://flueframework.com/docs/og4.jpg > Building and deploying > Choosing a sandbox strategy
   Still fast and cheap, good for agents that need small amounts of static context.
3. **Local sandbox** — `useSandbox(local())` in the agent function. Direct host filesystem and shell access. Ideal for self-hosted agents, CI tasks, and dev tooling — anywhere the host environment already provides isolation.
   title: Deploy Agents on Node.js | Flue
   image: https://flueframework.com/docs/og4.jpg > Building and deploying > Choosing a sandbox strategy
   Import `local` from `@flue/runtime/node` and pass `env: { ... }` to expose specific host env vars to the agent’s shell.
4. **Remote sandbox** — Full isolated Linux environment via a sandbox adapter. For multi-tenant agents, coding sandboxes, and anything that needs per-session isolation.

```

**Tool Result:** `TU-0346wYZQTIInQmCs4NbXLK`

```

# description: Build and deploy Flue agents on Cloudflare Workers with Vite.

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg
`flue()` scans your `'use agent'` modules, generates the Worker entry (one Durable Object class per agent), and merges its contributions into your Wrangler config; the Cloudflare

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 3. Create app.ts — the route map
`app.ts` is the only required file. Its default export owns the request pipeline; each mounted agent route resolves the generated binding and forwards to that agent’s Durable Object, and everything else is just a Hono app running in the Worker isolate:

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 4. Configure Durable Object migrations
Cloudflare requires an explicit migration whenever a Worker adds a Durable Object class. Flue generates the classes and bindings for scanned agents, but your project owns the ordered migration history in `wrangler.jsonc`:
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 4. Configure Durable Object migrations

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-flue-worker",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "migrations": [
    { "tag": "flue-class-FlueTranslatorAgent", "new_sqlite_classes": ["FlueTranslatorAgent"] },
  ],
```

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 4. Configure Durable Object migrations
Class names derive from agent identities (the exported function’s name, or its `agentName` static override), with camel boundaries split for the binding: the `Translator` agent produces the class `FlueTranslatorAgent` and the binding `FLUE_TRANSLATOR_AGENT`, and an `IssueTriage` agent would produce
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 4. Configure Durable Object migrations
`FlueIssueTriageAgent` and `FLUE_ISSUE_TRIAGE_AGENT`. Flue requires `nodejs_compat` and a `compatibility_date` of `2026-04-01` or newer, and validates both at build time.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 4. Configure Durable Object migrations
**Adding an agent is a triple**: the `'use agent'` file, the `app.route(...)` mount, and a uniquely tagged migration for its new class. Keep deployed migration entries in order and append, never rewrite.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 4. Configure Durable Object migrations
Generated Flue agent classes require Durable Object SQLite: introduce them through `new_sqlite_classes`, not legacy `new_classes`.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 4. Configure Durable Object migrations
Renaming an agent **function** is a storage-identity change — the class name follows the identity, which follows the function name unless an `agentName` static pins it.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 4. Configure Durable Object migrations
Express an identity change with wrangler-native `renamed_classes` (`{ "from": "FlueOldNameAgent", "to": "FlueNewNameAgent" }`) to keep the deployed Durable Objects.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 4. Configure Durable Object migrations
Renaming the file alone changes nothing, and re-mounting an agent at a different URL is not an identity change — neither needs a migration.

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 5. Add your API key
Use the variable name your provider expects — `ANTHROPIC_API_KEY` for Anthropic, `OPENAI_API_KEY` for OpenAI, and so on. Do not commit local secret files.

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 5. Add your API key
Alternatively, route model traffic through the [Workers AI binding](https://flueframework.com/docs/guide/models/) (`cloudflare/...` model specifiers) and skip API keys entirely.
For a deployed Worker, add secrets through Wrangler rather than treating a local-development file as production configuration:
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 5. Add your API key

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

For CI or a managed deployment pipeline, `wrangler deploy --secrets-file <path>` is also available when your pipeline provides a protected secrets file.

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 7. Build and deploy
Flue never rewrites your authored `wrangler.jsonc`. It reads it, layers its contributions (the generated `main`, one Durable Object binding per scanned agent) into a generated, gitignored Vite input config (`.flue-vite.wrangler.jsonc`), and hands that to the Cloudflare plugin.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > 7. Build and deploy
Migration history passes through from your file unchanged. Durable-object bindings whose names collide with Flue’s generated `FLUE_*_AGENT` names are a build error.

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > Extending generated Cloudflare Durable Objects
Flue normally owns each generated agent Durable Object class. When an agent needs native Cloudflare Agents SDK capabilities such as `onStart()`, `schedule()`, `scheduleEvery()`, or `queue()`, export a `cloudflare` extension descriptor from its module:

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > Extending generated Cloudflare Durable Objects
This is an advanced Cloudflare-only extension point. Flue applies `base` first, then defines its own Durable Object subclass with the generated binding and class identity.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > Extending generated Cloudflare Durable Objects
For the `Heartbeat` agent, authored Worker code can access the namespace as `env.FLUE_HEARTBEAT_AGENT`, and Wrangler binds that name to `FlueHeartbeatAgent`. Use `base` for native SDK lifecycle hooks and additional named methods.

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > Extending generated Cloudflare Durable Objects

```ts
import * as Sentry from "@sentry/cloudflare";

export const cloudflare = extend({
  wrap: (Final) =>
    Sentry.instrumentDurableObjectWithSentry(
      (env: Env) => ({ dsn: env.SENTRY_DSN }),
      Final,
    ),
});
```

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > Extending generated Cloudflare Durable Objects
Both `base` and `wrap` are optional. This module-local export is distinct from the optional source-root `cloudflare.ts` deployment module below. Native SDK callbacks run as Durable Object activity: they do not receive a Flue harness or session automatically.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > Extending the Worker
Add an optional `src/cloudflare.ts` module (path configurable via the `cloudflare` field in `flue.config.ts`) when your deployment needs native Cloudflare capabilities outside Flue’s generated classes. Named exports become top-level Worker exports, which lets the same Worker define application-owned Durable Objects:

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > Extending the Worker

```jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "SALESFORCE_AUTH_CACHE", "class_name": "SalesforceAuthCache" },
    ],
  },
  "migrations": [
    { "tag": "v2", "new_sqlite_classes": ["SalesforceAuthCache"] },
  ],
}
```

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Hello World > Extending the Worker
Your agents receive the namespace through `env.SALESFORCE_AUTH_CACHE`. Keep bindings, containers, and ordered migration history in Wrangler configuration; `cloudflare.ts` provides the Worker code exports but does not infer deployment topology.
An optional default export adds non-HTTP Worker handlers:

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Connecting a remote sandbox > Setup

1. Install `@cloudflare/sandbox`: `npm install @cloudflare/sandbox`.
2. Export the Sandbox class from `src/cloudflare.ts`.
3. Declare the Durable Object binding, migration, and container image in your `wrangler.jsonc` at the project root.
4. Commit a `Dockerfile` at the path your `containers[].image` points to.

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Connecting a remote sandbox > Example

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-agent",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [{ "class_name": "Sandbox", "name": "Sandbox" }],
  },
  "migrations": [
```

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Connecting a remote sandbox > Multiple sandboxes

```jsonc
{
  "durable_objects": {
    "bindings": [
      { "class_name": "PyBoxSandbox", "name": "PyBox" },
      { "class_name": "NodeSandbox", "name": "NodeBox" },
    ],
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["FlueAssistantAgent"] },
```

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Connecting a remote sandbox > Secure egress with outbound Workers
When your agent runs in a container, it may need to call external APIs — GitHub, npm registries, internal services. The traditional approach is to inject API tokens as environment variables, but that means the agent (and the LLM) has direct access to those secrets.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Connecting a remote sandbox > Secure egress with outbound Workers
Cloudflare Sandboxes solve this with [outbound Workers](https://blog.cloudflare.com/sandbox-auth/) — a programmable egress proxy that intercepts outgoing HTTP/HTTPS requests from the container. Secrets are injected at the proxy layer, so the container never sees them.

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Conversation persistence
`db.ts` is a Node-only convention — on Cloudflare, Durable Object SQLite is the persistence layer.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Conversation persistence
Filesystem durability remains a separate decision. The default lightweight sandbox uses an in-memory filesystem and must not be treated as durable merely because conversation state is stored in a Durable Object.

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Interruption and recovery semantics
A deployment or code update can reset a Durable Object while an operation is running. Flue handles interrupted Cloudflare operations conservatively:

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Interruption and recovery semantics
| Dispatched agent input | Durable delivery and internal deduplication are keyed by submissionId and persisted submission state. Direct and dispatched inputs to one agent instance share one accepted order. Reconciliation uses the same conservative replay rules. |
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Interruption and recovery semantics
Cloudflare direct prompts and dispatched inputs enter one SQLite-backed submission queue owned by the target agent Durable Object. The attached transport observes accepted backend work but does not own it: losing an HTTP response does not cancel the accepted submission.

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Interruption and recovery semantics
For jobs that require durable step-level continuation, implement those steps with [Cloudflare Workflows](https://developers.cloudflare.com/workflows/).
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Interruption and recovery semantics > Persisted-format boundary
Flue stamps every Durable Object database with its persisted format version in a one-row `flue_meta` table the first time it opens it, and refuses to open a database stamped by an unknown or newer format version (for example, after rolling back a deploy).
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Interruption and recovery semantics > Persisted-format boundary
There is no in-place format migration: state stamped by a different format version must be cleared, or its class retired.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Interruption and recovery semantics > Persisted-format boundary
KV-backed Durable Object classes remain outside this boundary because Cloudflare cannot convert them to SQLite in place — generated Flue agent classes must be introduced with `new_sqlite_classes`.

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Building and deploying

```bash
# Local development (reads local variables from .dev.vars or .env)
npx vite dev

# Build the deployable Worker output
npx vite build

# Configure a deployed secret interactively, then deploy the built output
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

...

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Observability
Enable Cloudflare’s observability products for the deployed Worker in `wrangler.jsonc`:

```jsonc
{
  "observability": {
    "enabled": true,
    "traces": { "enabled": true },
  },
}
```

title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Observability
With logs enabled, tool and hook logs from agent work appear in the [Workers Observability](https://developers.cloudflare.com/workers/observability/) dashboard, attributed to the work that wrote them.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Observability
With traces enabled (open beta), each agent response produces one trace — the Durable Object invocation that ran the response end to end, with Workers AI calls and other subrequests as spans inside it.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Observability
With traces enabled, each trace also carries agent-level spans — `invoke_agent`, `chat` per model turn, `execute_tool` per tool call — with conversation content included; [createCloudflareTracing()](https://flueframework.com/docs/guide/cloudflare-target/) covers customizing content capture, and [tracing:
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Observability
false](https://flueframework.com/docs/reference/configuration/) opts out. See Cloudflare’s [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) and [Traces](https://developers.cloudflare.com/workers/observability/traces/) documentation for sampling, retention, and pricing.
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Observability
For the runtime-level view — token usage, tool payloads, settlements, and exporters like Sentry and OpenTelemetry — see [Observability](https://flueframework.com/docs/guide/observability/).
title: Deploy to Cloudflare | Flue
image: https://flueframework.com/docs/og4.jpg > Observability
For how agent execution maps onto platform invocations, see the [Cloudflare target guide](https://flueframework.com/docs/guide/cloudflare-target/).

```

**Tool Result:** `TU-0346wYZR3WbutJzB37vQgg`

```

# Configure ChatKit over Tilde Global MCP

## Build the endpoint first

Start from the [Hello World agent](https://github.com/trytilde/examples/tree/main/hello-world-agent). For a provider-rich implementation, use the [code review bot](https://github.com/trytilde/examples/tree/main/code-review-bot).

...

Use Vercel AI SDK and Harness SDK `chatKitEndpoint`. Preserve webhook signature verification, `context.session.history()`, `convertToAiSdkMessages`, streaming, and server-side secrets.

## Register an agent

Call `tilde_register_chatkit_agent` with:

- `team_id`
- `display_name`
- `endpoint_url`: an HTTPS URL in production, or an endpoint path such as `api/agent` for local development
- `local_running_endpoint: true` for a Dev Tunnel endpoint
- optional `concurrency_policy`: `queue`, `interrupt`, or `queue_and_batch` (defaults to `queue`)
- optional `memory_bank_ids` to ingest this agent's conversations continuously
  The create response returns the plaintext Tilde API key and webhook signing key once, plus `message_tool_provider_id`. Give both secrets to the human for secure storage in the agent's server environment. Never print them into source, state, logs, or chat history.

...

## Enable agent-to-agent messaging

1. Take `message_tool_provider_id` from the child agent's registration response, or find its `chatkit_agent_message` provider with `tilde_search_enabled_capabilities`.
2.

...

Pass `session_id` only to continue an existing child conversation. 4. Immediately call the exposed `wait_for_response` tool with the returned `ticket_id`. 5. Keep the MCP request open. Consume `message_streaming` and `agent_turn_status` progress notifications.
Clients that omit an MCP progress token receive the same structured payload through `tilde.agent_response` logging notifications. 6. Use the final `response` as the canonical persisted ChatKit message.
Terminal `status` is `completed`, `failed`, or `cancelled`; queue notifications report `pending` or `running`, the applied concurrency policy, trigger count, and whether the turn was batched.
Bound tenant, target-agent, and ingress-channel fields are supplied by Tilde and cannot be overridden by the caller. Do not configure the removed pairwise internal-agent ChatKit channel.

...

## Configure a ChatKit provider

Use the Vercel AI Endpoint provider when the user wants to test the agent in [Mission Control](https://api.trytilde.ai/mission-control).

## Trigger work with Signals

Signals turn provider events into ChatKit messages.

1. Call `tilde_list_signal_providers` and inspect the selected provider's signal schemas and authentication requirements.
2. Call `tilde_create_signal_provider` with the provider-specific `body`.
3. Call `tilde_create_signal_rule` with a `body` that selects the event type, target agent, action, and stable session-key mapping.
4. Use one stable session key when related events should continue the same body of work, such as all updates to one Sentry issue or GitHub pull request.
5. Call `tilde_trigger_fake_signal` to test routing where the provider supports it.
6. Inspect execution with `tilde_list_signal_deliveries`. Use `tilde_retry_signal_delivery` only for a failed delivery that is safe to repeat.
   Use `tilde_list_signal_provider_instances` and `tilde_list_signal_rules` before updating or deleting resources. Their mutation functions are `tilde_update_signal_provider`, `tilde_delete_signal_provider`, `tilde_update_signal_rule`, and `tilde_delete_signal_rule`.
   In application code, handle typed GitHub, Slack, Sentry, and Firecrawl metadata as shown in the [human ChatKit guide](https://trytilde.ai/docs/chatkit). `onUnprocessed` runs once per unprocessed message; later conversions reuse its cached result.

```

**Tool Result:** `TU-0346wYZRXluUcvOZb9lFSY`

```

# Configure local agents with Tilde Dev Tunnels

## Global MCP step

Call `tilde_register_chatkit_agent` with:

- the target `team_id`
- `display_name`
- `endpoint_url` set to the local route path, for example `api/hello-world`
- `local_running_endpoint: true`
  Give the returned API key and webhook signing key to the human for secure server-side storage.

## Local CLI steps

Ask the user or local coding agent to run:

```bash theme={"system"}
pnpm add -D @trytilde/cli
pnpm exec tilde auth login
pnpm exec tilde tunnel -- pnpm dev
```

Replace `pnpm dev` with the application's normal development command. If the selected workspace is wrong, run `pnpm exec tilde auth set-team`.
The CLI starts a managed Cloudflare tunnel and passes the chosen local port to the process as `PORT` and `TUNNEL_PORT`. Keep the process running while Tilde delivers ChatKit messages, webhooks, and tool invocations.
Signed Harness SDK wrappers such as `chatKitEndpoint` reject ChatKit requests without a valid Tilde signature. That protects the wrapped agent endpoint; it does not secure unrelated routes.
**Warning:** the tunnel exposes every page and API route served by the development process to the public internet. Disable unneeded routes or protect them with authentication.
Test the registered agent in [Mission Control](https://api.trytilde.ai/mission-control). Select the same workspace before starting a session. See the [human Dev Tunnels guide](https://trytilde.ai/docs/dev-tunnels).

```

**Tool Result:** `TU-0346wYZS207ke06T65YaKP`

```

# Export and import Tilde state over Global MCP

Tilde resource state is portable even though Tilde does not require Terraform. Keep `tilde.state.yaml` beside a custom agent so another workspace can reproduce its agents, ChatKit providers, tools, MCP servers, skills, wikis, memory bindings, reverse proxies, and relationships.

...

Curated hosted MCP connections export their stable catalog provider identity and declarative endpoint/authentication configuration. Dynamic OAuth client IDs, token endpoints discovered for that registration, access tokens, and refresh tokens are environment-specific and are not exported.
On import, Tilde repeats discovery and dynamic client registration, then returns a one-time authorization URL. Manual OAuth configuration remains portable, while its user credential is reconnected through the normal pending-credential flow.

...

## Export

1. Call `tilde_export_state` with `format: "yaml"`.
2. Write the returned `state` string unchanged to `tilde.state.yaml`.
3. Review and commit the file with the agent source.
   For custom deployed agents, compare the state file and implementation with the [Hello World agent](https://github.com/trytilde/examples/tree/main/hello-world-agent), the [code review bot](https://github.com/trytilde/examples/tree/main/code-review-bot), and the rest of the [examples repository](https://github.com/trytilde/examples).

## Import

1. Read the complete state file as text.
2. Call `tilde_validate_state` with `state`, `format: "yaml"`, and any declared string `variables`. Stop if `valid` is false.
3. Call `tilde_plan_state_import` with the identical state, format, and variables.
4. Show the plan to the user.
   Do not apply conflicts, destructive changes, or unexpected replacements without approval.
5. Call `tilde_import_state` only after the plan is approved.
6. Poll `tilde_get_state_import` with the returned `import_id` until the status is `applied`, `failed`, or `rolled_back`.
7. Capture generated outputs the first time an applied result returns them. Applied outputs are one-time secrets and are cleared from later summary reads.
8. Save any one-time OAuth authorization URL returned in the import outputs and send it to the user immediately.
9.

...

Never call import as a substitute for plan. Use the same exact state and variables for validation, planning, and application.
See the [human portable state guide](https://trytilde.ai/docs/terraform) for dashboard, CLI, multi-environment, and Deploy with Tilde workflows.

```

**Tool Result:** `TU-0346wYZSQ9aYfuj7fuQbqG`

```

# Connect your coding agent

> Connect a supported coding agent or MCP client to Tilde.
> Connect the client where your agent runs to the global Tilde MCP server.

...

## Choose your coding agent

### OpenClaw

<Columns cols={3}>
<Card title="OpenClaw" icon="https://mintcdn.com/tilde/DzxL_3E1qjA-qfvk/icons/openclaw.svg?fit=max&auto=format&n=DzxL_3E1qjA-qfvk&q=85&s=9e4122bb72065f544c0e74954832b3ad" href="/docs/connect-your-agent/openclaw" horizontal width="120" height="120" data-path="icons/openclaw.svg" />
</Columns>

...

### Codex + ChatGPT

<Columns cols={3}>
<Card title="Codex" icon="https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/openai.svg" href="/docs/connect-your-agent/codex" horizontal />
<Card title="ChatGPT" icon="https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/openai.svg" href="/docs/connect-your-agent/chatgpt" horizontal />
</Columns>

### MCP

<Columns cols={3}>
<Card title="Notion" icon="https://cdn.jsdelivr.net/npm/simple-icons@16.28.0/icons/notion.svg" href="/docs/connect-your-agent/notion" horizontal />
<Card title="Cursor" icon="https://cdn.jsdelivr.net/npm/simple-icons@16.28.0/icons/cursor.svg" href="/docs/connect-your-agent/cursor" horizontal />
<Card title="VS Code" icon="https://cdn.jsdelivr.net/npm/simple-icons@12.4.0/icons/visualstudiocode.svg" href="/docs/connect-your-agent/vscode" horizontal />
<Card title="Windsurf" icon="https://cdn.jsdelivr.net/npm/simple-icons@16.28.0/icons/windsurf.svg" href="/docs/connect-your-agent/windsurf" horizontal />
<Card title="Cline" icon="https://cdn.jsdelivr.net/npm/simple-icons@16.28.0/icons/cline.svg" href="/docs/connect-your-agent/cline" horizontal />
<Card title="Agent Builder" icon="https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/openai.svg" href="/docs/connect-your-agent/openai-agent-builder" horizontal />
<Card title="n8n" icon="https://cdn.jsdelivr.net/npm/simple-icons@16.28.0/icons/n8n.svg" href="/docs/connect-your-agent/n8n" horizontal />
<Card title="MCP URL" icon="network-wired" href="/docs/connect-your-agent/mcp-url" horizontal />
</Columns>
<Info>
The global endpoint infers your organization from your Tilde login. Tools that act on a team require a `team_id`.
</Info>
```

## Assistant

**Tool Use:** `librarian`

```json
{
  "query": "In the current withastro/flue repository, explain the development and deployment architecture that matters to an existing TypeScript application adopting Flue: package/runtime boundaries, Vite build transformations, Node and Cloudflare target outputs, persistence and concurrency requirements, testing/eval/observability support, release maturity signals, license, and operational lock-in. Cite authoritative repository files and distinguish implemented behavior from docs/roadmap claims. Focus on current main and current package metadata."
}
```

**Tool Use:** `librarian`

```json
{
  "query": "Across trytilde/harness-sdk and trytilde/examples, explain Tilde's current custom-agent development and deployment architecture: what the open-source Harness SDK implements versus what the hosted Tilde control plane provides, Vercel AI SDK integration, endpoint/signature/history contracts, local tunnel workflow, deployment/platform assumptions, state portability, test/eval/observability support, package/release maturity, license, and operational lock-in. Cite exact authoritative repository files and concrete examples; distinguish implemented SDK behavior from hosted-service documentation claims."
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://trytilde.ai/docs/chatkit",
  "objective": "Extract the complete human-facing Tilde custom-agent development story, especially code structure with Vercel AI SDK and Harness SDK, endpoint lifecycle/history, local run/test loop, security, concurrency, signals, and production deployment.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://trytilde.ai/docs/terraform",
  "objective": "Extract Tilde's practical environment/deployment promotion story, portable state workflow, source control integration, secret outputs, review/apply process, and limitations.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://github.com/trytilde/harness-sdk",
  "objective": "Establish the Harness SDK's stated scope, installation, runtime requirements, public API, supported hosts, license, release/version status, and relationship to hosted Tilde.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://github.com/trytilde/examples/tree/main/hello-world-agent",
  "objective": "Extract the actual minimal Tilde agent repository structure, development commands, endpoint code, required secrets, tests, and deployment setup.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://github.com/trytilde/examples/tree/main/code-review-bot",
  "objective": "Extract the production-shaped Tilde agent architecture, development workflow, integrations, testing, portable state, reverse proxy, deployment setup, and operational requirements.",
  "forceRefetch": true
}
```

## User

**Tool Result:** `TU-0346wZD6foCHaJ0kjMsPrs`

````
## Adoption architecture

### Package and runtime boundaries

Flue is an ESM package family rather than one monolithic SDK:

- `@flue/runtime`: agent hooks, sessions, routing, durability, tools, and target-specific subpaths.
- `@flue/vite`: compile/build integration.
- `@flue/cli`: local execution, scaffolding, blueprints, and offline docs—not the build system.
- `@flue/sdk` / `@flue/react`: clients for deployed conversations.
- Optional persistence, channel, and OpenTelemetry packages.

These boundaries are reflected in the [repository package table](https://github.com/withastro/flue/blob/main/README.md#L65-L75) and actual [`@flue/runtime` exports](https://github.com/withastro/flue/blob/main/packages/runtime/package.json#L12-L68), including distinct `./node`, `./cloudflare`, `./routing`, `./adapter`, and internal build-only entrypoints.

Practical constraints:

- ESM only.
- Runtime/Vite/CLI packages are currently **2.0.3**.
- Node consumers require **Node ≥22.19**; `@flue/vite` peers on **Vite 8** ([runtime metadata](https://github.com/withastro/flue/blob/main/packages/runtime/package.json#L70-L103), [Vite metadata](https://github.com/withastro/flue/blob/main/packages/vite/package.json#L22-L55)).
- The runtime directly adopts Hono, Pi’s model/provider protocol, Valibot, and MCP client machinery ([dependencies](https://github.com/withastro/flue/blob/main/packages/runtime/package.json#L86-L95)).

An existing application therefore keeps ordinary TypeScript modules and an explicit `app.ts` router, but Flue must own the agent compilation/runtime path.

## Vite transformations

This is implemented build behavior, not merely a documented convention:

1. Vite scans modules carrying a real directive-prologue `'use agent'`.
2. Capitalized exported functions become agent definitions.
3. The transform appends runtime identity bindings without rewriting the authored function. Durable identity is injected as a build-time string, so minification does not change storage identity ([transform implementation](https://github.com/withastro/flue/blob/main/packages/vite/src/use-agent-transform.ts#L1-L15), [injected imports and bindings](https://github.com/withastro/flue/blob/main/packages/vite/src/use-agent-transform.ts#L39-L77)).
4. Generated virtual modules join the scanned agents, providers, runtime configuration, `app.ts`, and target bootstrap.

Flue 2.0 explicitly removed `flue dev/build` and file-based route creation: Vite owns dev/build, while `app.ts` owns every HTTP mount. This is recorded as a shipped breaking change, not roadmap material ([changelog](https://github.com/withastro/flue/blob/main/CHANGELOG.md#L28-L35)).

Build-resolved facilities such as `SKILL.md` imports require this Vite graph; they will not necessarily load under plain Vitest or `ts-node`-style execution ([eval limitation](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/evals.md#L77-L85)).

## Target outputs

### Node

`vite build` emits:

- `dist/server.mjs`: self-starting HTTP server, defaulting to `PORT=3000`, with graceful signal handling.
- `dist/app.mjs`: non-listening application artifact used by preview or embeddable hosts.

The production entry is concrete source code ([Node entry](https://github.com/withastro/flue/blob/main/packages/vite/src/bootstrap/node-entry.ts#L1-L30)); artifact-based `vite preview` is listed as shipped in 2.0.0 ([changelog](https://github.com/withastro/flue/blob/main/CHANGELOG.md#L74-L75)).

### Cloudflare

Configuration is:

```ts
plugins: [flue(), cloudflare({ config: flueWorkerConfig() })]
````

Flue must come first. The official Cloudflare Vite plugin owns workerd, Wrangler configuration resolution, build output, preview, and deployment. Flue contributes:

- `virtual:flue/worker`;
- one Durable Object binding/class per scanned agent;
- `nodejs_compat`;
- a minimum compatibility-date validation.

The user continues to own migrations, R2/container bindings, and other Wrangler configuration ([customizer contract](https://github.com/withastro/flue/blob/main/packages/vite/src/cloudflare-worker-config.ts#L1-L40), [applied fields](https://github.com/withastro/flue/blob/main/packages/vite/src/cloudflare-worker-config.ts#L163-L191)). Flue currently requires a compatibility date of at least `2026-04-01` ([validation](https://github.com/withastro/flue/blob/main/packages/vite/src/cloudflare-worker-config.ts#L194-L218)).

The generated Worker imports the application and all scanned agents, registers them, exports one Agents-SDK-derived Durable Object class per agent, and optionally registers Workers AI and native tracing ([generator](https://github.com/withastro/flue/blob/main/packages/vite/src/cloudflare-entry.ts#L1-L18), [class generation](https://github.com/withastro/flue/blob/main/packages/vite/src/cloudflare-entry.ts#L53-L96), [generated imports/registration](https://github.com/withastro/flue/blob/main/packages/vite/src/cloudflare-entry.ts#L104-L175)).

## Persistence and concurrency

### Node

The production default is process-local, in-memory SQLite. It provides ordered operation inside one process but loses state on restart. Durable restart recovery requires a Node-only `db.ts` adapter such as SQLite, Postgres, MySQL, MongoDB, libSQL, or Redis.

A shared database does **not** make active-active replicas safe. Flue requires one live owner per conversation; deployments must use sticky/partitioned routing and avoid overlapping replacement owners ([documented operational contract](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/durability.md#L119-L133)).

### Cloudflare

Each agent conversation maps to a Durable Object with SQLite. Required Wrangler migrations must use `new_sqlite_classes`; legacy KV-backed classes cannot be converted in place. This is enforced at runtime, not just documented ([SQLite check](https://github.com/withastro/flue/blob/main/packages/runtime/src/cloudflare/agent-execution-store.ts#L53-L73)).

Cloudflare supplies structural single ownership. Flue persists conversation, attachment, queue, attempt, abort, and settlement state in DO SQLite and maintains wake-driven supervision ([recovery behavior](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/durability.md#L135-L142)).

Across targets, processing is exactly-once-recorded but at-least-once-executed; external effects must be idempotent. Runtime source explicitly warns that Cloudflare processing may retry ([dispatch contract](https://github.com/withastro/flue/blob/main/packages/runtime/src/runtime/flue-app.ts#L51-L69)). “Durable tools” checkpoint `step.do` results but still cannot guarantee an external effect occurred only once ([durability semantics](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/durability.md#L65-L94)).

Sandbox files are independent of conversation persistence; an ephemeral sandbox is rebuilt during recovery unless the application provisions a durable workspace ([boundary](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/durability.md#L144-L150)).

## Tests, evals, and observability

Implemented support includes:

- Vitest unit suites throughout published packages and Cloudflare integration tests in `@flue/vite` ([package scripts](https://github.com/withastro/flue/blob/main/packages/vite/package.json#L30-L35)).
- Public runtime store-contract test utilities for third-party persistence adapters ([runtime exports](https://github.com/withastro/flue/blob/main/packages/runtime/package.json#L53-L64)).
- In-process testing/evals through `start()` + `init()`.
- End-to-end HTTP evals through `@flue/sdk`.
- A `vitest-evals` blueprint/example.

Flue explicitly says it has **no dedicated eval framework**; Vitest and `vitest-evals` are integration patterns, not a built-in managed evaluator ([eval guide](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/evals.md#L7-L18), [supported boundaries](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/evals.md#L47-L85), [HTTP evaluation](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/evals.md#L86-L126)).

Observability has two distinct implemented surfaces:

- Durable, client-facing conversation streams.
- Live, process/isolate-local runtime events via `observe()`.

Runtime events include model turns, tools, logs, usage/cost, compaction, recovery, and settlement identifiers. They are synchronous, live-only, not replayed, and not aggregated across processes or Durable Objects ([event semantics](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/observability.md#L9-L43), [event inventory](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/observability.md#L45-L68)).

Export options are OpenTelemetry, Sentry and Braintrust integrations—not a Flue-hosted dashboard ([integrations](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/observability.md#L158-L175)). Cloudflare builds additionally install native tracing by default, becoming effective when Workers Traces is enabled ([generated tracing block](https://github.com/withastro/flue/blob/main/packages/vite/src/cloudflare-entry.ts#L150-L160)).

## Maturity signals

Current metadata and changelog indicate a newly stabilized but rapidly changing project:

- Current packages are **2.0.3**, released 2026-08-04 ([changelog](https://github.com/withastro/flue/blob/main/CHANGELOG.md#L1-L9)).
- 2.0.0 landed only days earlier and replaced major beta architecture: build commands, routing, workflows, agent definitions, tools, persistence format, SDK addressing, and client semantics ([breaking-change section](https://github.com/withastro/flue/blob/main/CHANGELOG.md#L28-L45)).
- 2.0.1–2.0.3 immediately fixed durability hangs, Cloudflare dependency resolution, tracing, and provider behavior ([2.0.1 fixes](https://github.com/withastro/flue/blob/main/CHANGELOG.md#L19-L26), [2.0.3 fix](https://github.com/withastro/flue/blob/main/CHANGELOG.md#L3-L7)).
- Persisted beta stores are rejected and have no migration path ([format change](https://github.com/withastro/flue/blob/main/CHANGELOG.md#L61-L61)).

Thus “2.0” is released implementation, but compatibility history shows substantial recent churn. Documentation claims around future UI/dev experiences should not be treated as shipped; for example, the changelog calls the browser demo merely the basis for a **future** `flue dev` experience ([changelog](https://github.com/withastro/flue/blob/main/CHANGELOG.md#L44-L44)).

## License and operational lock-in

The repository and package metadata use **Apache-2.0** ([root metadata](https://github.com/withastro/flue/blob/main/package.json#L1-L9), [license text](https://github.com/withastro/flue/blob/main/LICENSE#L1-L12)).

Lock-in differs by target:

- **Framework/build lock-in:** agent directives, generated identities, virtual Vite modules, persisted record formats, and `app.ts` registration tie the application to Flue’s compiler/runtime.
- **Node:** comparatively portable hosting and interchangeable persistence adapters, but the one-owner-per-conversation rule complicates horizontal scaling.
- **Cloudflare:** strong operational coupling to Workers, Agents SDK, Durable Objects, DO SQLite, Wrangler migrations, compatibility dates, alarms/wakes, Workers AI, and optionally native tracing. Moving these conversations elsewhere requires application-level export/migration; Cloudflare persistence adapters are not substitutable with `db.ts`.
- **Provider/sandbox lock-in:** reduced but not eliminated. Pi provider objects and thin sandbox adapters allow alternate vendors, while Cloudflare-native AI/sandbox/workspace choices deepen platform dependence.
- **Workflow lock-in:** Flue deliberately removed its own workflow engine and expects external systems such as Temporal, Inngest, or Cloudflare Workflows, reducing framework lock-in but transferring durability concerns to that chosen platform ([documented boundary](https://github.com/withastro/flue/blob/main/apps/docs/src/content/docs/guide/durability.md#L152-L162)).

```

**Tool Result:** `TU-0346wZD8QZxwqYoDlTH2N7`

```

## Architecture boundary

Tilde’s model is **bring-your-own agent runtime, hosted control plane**:

- Your application owns the model call, prompts, AI loop, and HTTP route. The examples implement these as Next.js handlers using Vercel AI SDK `streamText`—for example, the minimal agent loads hosted history, converts messages, calls OpenAI, and streams a UI response ([route.ts, L21-L57](https://github.com/trytilde/examples/blob/main/hello-world-agent/app/api/hello-world/route.ts#L21-L57)).
- The hosted Tilde service owns or brokers agent registration, channels, sessions/history, Signals ingress/routing, MCP configuration, credentials, reverse proxies, and invocation of the configured endpoint. That division is documented by the code-review flow ([README.md, L25-L51](https://github.com/trytilde/examples/blob/main/code-review-bot/README.md#L25-L51)) and represented declaratively in state files ([sentry state, L138-L173](https://github.com/trytilde/examples/blob/main/sentry-remediation-bot/tilde.state.yaml#L138-L173)).

The hosted capabilities above are **documentation/state-schema claims**, not implementations present in these repositories. The SDK is a client and endpoint-adapter layer over Tilde APIs; it does not contain the control-plane server.

## What the Harness SDK actually implements

The published SDK surface comprises a core API client, React bindings, Vercel-AI server/client adapters, and CLI ([README.md, L5-L17](https://github.com/trytilde/harness-sdk/blob/main/README.md#L5-L17)). Concrete implemented behavior includes:

- Authenticated HTTP clients for ChatKit, message/event history, MCP, and skills ([client.ts, L7-L25](https://github.com/trytilde/harness-sdk/blob/main/packages/core/src/client.ts#L7-L25)).
- Config normalization, Tilde API defaults, organization subdomains, bearer/API-key authentication, and injectable `fetch` ([config.ts, L20-L75](https://github.com/trytilde/harness-sdk/blob/main/packages/core/src/config.ts#L20-L75)).
- Paginated session messages and event history against hosted `/api/v1/team/...` APIs ([messages.ts, L6-L69](https://github.com/trytilde/harness-sdk/blob/main/packages/core/src/chatkit/messages.ts#L6-L69)).
- Signed ChatKit endpoint handling, request validation, typed provider context, timeout/abort propagation, history access, and structured console logging ([handler.ts, L96-L159](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/handler.ts#L96-L159), [L161-L211](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/handler.ts#L161-L211), [L315-L370](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/handler.ts#L315-L370)).
- MCP URL/client helpers, process-local tools, and signed remote-tool discovery/invocation handlers ([README.md, L50-L105](https://github.com/trytilde/harness-sdk/blob/main/README.md#L50-L105), [L167-L193](https://github.com/trytilde/harness-sdk/blob/main/README.md#L167-L193)).

It does **not** implement model hosting, a scheduler, durable storage, Signals infrastructure, credential vaulting, hosted MCP providers, sandbox execution, or deployment infrastructure.

## Vercel AI SDK integration

The integration is an adapter rather than a proprietary agent framework:

1. `chatKitEndpoint` verifies and validates Tilde’s request.
2. `context.session.history()` retrieves hosted history.
3. `convertToAiSdkMessages` maps Tilde messages/signals to AI SDK `UIMessage`s.
4. Application code calls normal AI SDK APIs such as `convertToModelMessages`, `streamText`, `stepCountIs`, and `toUIMessageStreamResponse`.
5. `createMCPClient` exposes Tilde’s remote MCP tools as AI SDK tools.

The production code-review loop demonstrates all of these pieces ([route.ts, L24-L45](https://github.com/trytilde/examples/blob/main/code-review-bot/app/api/code-review/route.ts#L24-L45), [L61-L106](https://github.com/trytilde/examples/blob/main/code-review-bot/app/api/code-review/route.ts#L61-L106)). Typed conversion supports text, reasoning, files, dynamic tools, approvals, sources, and arbitrary data parts ([chatkit-request.ts, L3-L93](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/chatkit-request.ts#L3-L93)); it also has provider-specific handlers for Sentry, GitHub, and Firecrawl signals ([chatkit-message.ts, L343-L386](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/chatkit-message.ts#L343-L386), [L671-L697](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/chatkit-message.ts#L671-L697)).

## Endpoint, signature, and history contracts

### Signature

Inbound requests require:

- `x-tilde-webhook-id`
- `x-tilde-timestamp`
- `x-tilde-signature`

The signature is:

```text
hmac-sha256=hex(HMAC-SHA256(key, timestamp + "." + rawBody))
```

The SDK defaults to a five-minute timestamp tolerance and uses constant-time comparison ([webhook.ts, L4-L19](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/webhook.ts#L4-L19), [L49-L88](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/webhook.ts#L49-L88), [L110-L132](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/webhook.ts#L110-L132)). Tests cover valid, missing, stale, and invalid signatures ([webhook.test.ts, L62-L97](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/test/webhook.test.ts#L62-L97)).

### Invocation context

The endpoint additionally requires organization, team, and session headers; user/external-user headers are optional ([handler.ts, L33-L38](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/handler.ts#L33-L38), [L161-L205](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/handler.ts#L161-L205)). The body is `{ chatId?, messages }`, with strict validation of message roles and parts ([chatkit-request.ts, L83-L125](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/chatkit-request.ts#L83-L125)).

### History

History is not sent as the entire request transcript. The handler exposes a session client backed by Tilde’s hosted history API. With no paging options it loads all 100-item pages, sorts by creation time, and removes messages duplicated in the current request ([handler.ts, L215-L265](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/handler.ts#L215-L265), [L440-L464](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/handler.ts#L440-L464)). Converted AI-SDK representations may also be cached back into ChatKit ([chatkit-message.ts, L567-L586](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/chatkit-message.ts#L567-L586), [L700-L731](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/chatkit-message.ts#L700-L731)).

## Local tunnel workflow

The current first-party workflow is:

```bash
tilde tunnel -- next dev --webpack -p '$TUNNEL_PORT'
```

The CLI authenticates with Tilde, obtains a hosted Cloudflare connector token, starts `cloudflared`, selects a local port, proxies the managed ingress port to it, and injects tunnel/port environment variables ([tunnel.ts, L49-L89](https://github.com/trytilde/harness-sdk/blob/main/packages/cli/src/tunnel.ts#L49-L89), [L92-L154](https://github.com/trytilde/harness-sdk/blob/main/packages/cli/src/tunnel.ts#L92-L154)). The SDK’s own Next.js example documents this exact command ([README.md, L47-L61](https://github.com/trytilde/harness-sdk/blob/main/examples/nextjs-agent/README.md#L47-L61)).

The public examples’ prose sometimes says only “public HTTPS tunnel” or “Tilde development tunnel” ([hello-world README, L82-L84](https://github.com/trytilde/examples/blob/main/hello-world-agent/README.md#L82-L84), [code-review README, L124-L135](https://github.com/trytilde/examples/blob/main/code-review-bot/README.md#L124-L135)). Therefore ordinary tunnels can satisfy reachability, but the managed tunnel command depends on Tilde authentication and Tilde-issued Cloudflare configuration.

## Deployment and platform assumptions

The wire-level handler uses standard Fetch `Request`/`Response`, so it is not intrinsically Vercel-only. Nevertheless, the supported examples assume:

- Next.js route handlers;
- Node 22 for examples;
- Vercel deployment and environment variables;
- AI SDK-compatible streaming;
- provider-specific function-duration limits.

The minimal guide requires a Vercel account and deploys with `vercel deploy --prod` ([README.md, L10-L16](https://github.com/trytilde/examples/blob/main/hello-world-agent/README.md#L10-L16), [L68-L76](https://github.com/trytilde/examples/blob/main/hello-world-agent/README.md#L68-L76)). The larger examples export `maxDuration = 300` and warn that the Vercel plan must support it ([code-review README, L151-L165](https://github.com/trytilde/examples/blob/main/code-review-bot/README.md#L151-L165)). State explicitly identifies the provider as `chatkit.http-vercel-ai-sdk` ([hello-world state, L9-L17](https://github.com/trytilde/examples/blob/main/hello-world-agent/tilde.state.yaml#L9-L17)).

Thus portability to another Node/Fetch host looks technically plausible, but these repositories provide no authoritative deployment recipe or support commitment for another platform.

## State portability

Tilde resources can be represented as YAML and imported/exported with the CLI ([SDK README, L20-L29](https://github.com/trytilde/harness-sdk/blob/main/README.md#L20-L29)). State can describe agents, channels, providers, Signal rules, MCP servers, credential setup placeholders, and reverse-proxy profiles. References use logical state addresses, allowing IDs to be remapped on import; runtime endpoint IDs and secrets are omitted ([sentry README, L36-L43](https://github.com/trytilde/examples/blob/main/sentry-remediation-bot/README.md#L36-L43)).

Portability is intentionally incomplete:

- Endpoint URLs remain deployment-specific variables ([hello-world state, L4-L17](https://github.com/trytilde/examples/blob/main/hello-world-agent/tilde.state.yaml#L4-L17)).
- Generated API keys/signing keys are one-time outputs.
- GitHub App IDs, installation IDs, private keys, webhook secrets, and generated proxy profile IDs cannot be committed in state ([code-review README, L81-L101](https://github.com/trytilde/examples/blob/main/code-review-bot/README.md#L81-L101)).
- Imported resources still target Tilde-specific provider IDs and APIs.

State therefore supports moving/reconstructing configuration **between Tilde environments**, not moving the whole control plane to another vendor.

## Testing, evals, and observability

### Implemented

The SDK has unit tests, package-wide Vitest scripts, and an MCP E2E suite ([package.json, L10-L22](https://github.com/trytilde/harness-sdk/blob/main/package.json#L10-L22)). Endpoint tests cover signing, validation, timeout/abort behavior, context, history, and typed metadata; the signature cases are concrete examples above.

Runtime observability consists primarily of:

- structured endpoint logs with request/session IDs, verification, history-page timings, status, and elapsed time ([handler.ts, L96-L118](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/handler.ts#L96-L118), [L379-L404](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/src/handler.ts#L379-L404));
- application-level AI SDK callbacks such as `onStepFinish`, `onFinish`, `onAbort`, and `onError` ([code-review route, L81-L100](https://github.com/trytilde/examples/blob/main/code-review-bot/app/api/code-review/route.ts#L81-L100));
- hosted message and event-history read APIs.

### Not demonstrated

There is no eval framework, benchmark suite, prompt regression system, tracing exporter, OpenTelemetry integration, dashboard implementation, or documented hosted eval product in these repositories. The examples repository has only a small Sentry session-key regression test script ([package.json, L13-L15](https://github.com/trytilde/examples/blob/main/sentry-remediation-bot/package.json#L13-L15)); the code-review example has no test script ([package.json, L24-L30](https://github.com/trytilde/examples/blob/main/code-review-bot/package.json#L24-L30)). Its production checklist says what operators should monitor, but that is guidance—not supplied observability infrastructure ([README.md, L184-L199](https://github.com/trytilde/examples/blob/main/code-review-bot/README.md#L184-L199)).

## Maturity and license

The packages are early-stage:

- core SDK `0.1.2`;
- Vercel AI Node package `0.2.0`;
- CLI `0.1.0`  
  ([core package.json, L1-L5](https://github.com/trytilde/harness-sdk/blob/main/packages/core/package.json#L1-L5), [Vercel package.json, L1-L5](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/package.json#L1-L5), [CLI package.json, L1-L5](https://github.com/trytilde/harness-sdk/blob/main/packages/cli/package.json#L1-L5)).

Publishing does have validation, smoke tests, ordered releases, retry-safe CI, and OIDC plans ([README.md, L235-L263](https://github.com/trytilde/harness-sdk/blob/main/README.md#L235-L263)). Still, the low versions, narrow example set, generated API surface, and explicit warning about Modal’s unstable pre-1.0 API indicate evolving contracts.

Crucially, “open-source” should not be equated with permissively licensed:

- `trytilde/examples` is explicitly MIT ([LICENSE, L1-L20](https://github.com/trytilde/examples/blob/main/LICENSE#L1-L20)).
- `trytilde/harness-sdk` has no repository LICENSE file, and published package manifests say `UNLICENSED` ([core package.json, L3-L9](https://github.com/trytilde/harness-sdk/blob/main/packages/core/package.json#L3-L9), [Vercel package.json, L3-L9](https://github.com/trytilde/harness-sdk/blob/main/packages/vercel-ai-node/package.json#L3-L9)). Its source is publicly visible, but the repositories do not grant an open-source license.

## Operational lock-in

**Low lock-in:** prompts, model choice, AI SDK loop, application code, and deployed endpoint remain yours. OpenAI is merely the examples’ provider, and the SDK example also supports a caller-selected OpenAI-compatible endpoint ([SDK example README, L3-L8](https://github.com/trytilde/harness-sdk/blob/main/examples/nextjs-agent/README.md#L3-L8)).

**Material Tilde lock-in:** sessions/history, channels, Signals ingestion and routing, provider normalization, hosted MCP catalogs, credential brokerage, reverse proxies, managed tunnel identities, and state resource types all call Tilde-specific APIs. The code-review agent depends operationally on Tilde to inject GitHub/Modal credentials and proxy network access ([README.md, L37-L51](https://github.com/trytilde/examples/blob/main/code-review-bot/README.md#L37-L51)); Sentry deliberately sends to Tilde’s durable ingress rather than the application ([sentry README, L36-L38](https://github.com/trytilde/examples/blob/main/sentry-remediation-bot/README.md#L36-L38)).

Replacing Tilde would not require rewriting the model loop, but would require rebuilding those control-plane services and translating the signature, session/history, Signals, MCP, credential, and proxy contracts. The strongest lock-in is therefore **operational control-plane state and brokered integrations**, not the agent’s inference code.

```

**Tool Result:** `TU-0346wZD96umkW8WaxAlAUD`

```

# ChatKit

> Connect conversations and external events to your agent.
> ChatKit connects an agent endpoint to the places where work begins. It stores sessions and messages, delivers each turn as a signed HTTPS request, and streams the agent's response back to the channel. There are three ways to trigger an agent run through ChatKit:

1. **Chat providers**: These are first-class integrations with third-party chat providers.
2. **Vercel AI SDK chat provider**: This managed provider exposes your agent through a Vercel AI SDK-compatible endpoint for custom clients.
3. **Signals**: These are events from third-party providers that Tilde delivers to your agent.

...

## Set up ChatKit

<Steps>
<Step title="Create the endpoint">
Wrap your route with `chatKitEndpoint`. It verifies Tilde's signature and gives the handler the current session, new messages, provider metadata, and ChatKit client.
```
```bash theme={"system"}
pnpm add @ai-sdk/openai ai @trytilde/harness-sdk @trytilde/harness-sdk-vercel-ai-node
```

```typescript app/api/agent/route.ts theme={"system"}
import { openai } from "@ai-sdk/openai";
import {
  chatKitEndpoint,
  convertToAiSdkMessages,
  createClient,
} from "@trytilde/harness-sdk-vercel-ai-node";
import { consumeStream, convertToModelMessages, streamText } from "ai";

export const POST = chatKitEndpoint({
  client: createClient({
    apiKey: process.env.TILDE_API_KEY!,
    orgId: process.env.TILDE_ORG_ID!,
    teamId: process.env.TILDE_TEAM_ID!,
  }),
  webhookSigningKey: process.env.TILDE_WEBHOOK_SIGNING_KEY!,
  async handler(request, context) {
    const history = await context.session.history();
    const messages = await convertToAiSdkMessages({
      messages: [...history.items, ...context.messages],
      chatkit: context.chatkit,
    });
    const result = streamText({
      abortSignal: request.signal,
      messages: await convertToModelMessages(messages),
      model: openai("gpt-5.5"),
    });

    return result.toUIMessageStreamResponse({
      consumeSseStream: consumeStream,
      originalMessages: messages,
    });
  },
});
```

```

...

</Step>
<Step title="Register the agent">
Open Tilde, select your workspace, and go to **ChatKit** → **Agents**. Register the endpoint and copy the one-time API key and webhook signing key into your app's environment.
```

For local development, enable **Local running endpoint** and run the app through a Dev Tunnel. For production, enter the deployed HTTPS endpoint.

Registration also creates a credentialless **Message agent** tool provider bound to this agent. Add its `message` and `wait_for_response` tools to any Tilde MCP server when another agent should invoke it.

```
</Step>
<Step title="Connect a channel and test">
Go to **ChatKit** → **Configure Chat Providers** and choose where people will talk to the agent. Link the provider to your registered agent, then open [Mission Control](https://api.trytilde.ai/mission-control) to start a test session.
</Step>
</Steps>

### Test your agent in Mission Control
Use [Mission Control](https://api.trytilde.ai/mission-control) to invoke your agent directly and test conversations. Select the correct workspace and agent, then start a session and send a message.
<Info>
Mission Control requires the **Vercel AI Endpoint** ChatKit provider to be enabled for your agent.
</Info>

### Provider-specific message metadata
Supported chat providers add validated metadata to the endpoint context. Use the provider-specific property inside your `chatKitEndpoint` handler.
<Tabs>
<Tab title="GitHub">
GitHub messages expose repository, issue, pull request, comment, and event metadata through `context.github`.
```

```typescript app/api/code-review/route.ts theme={"system"}
import {
  chatKitEndpoint,
  createClient,
} from "@trytilde/harness-sdk-vercel-ai-node";

export const POST = chatKitEndpoint({
  client: createClient({
    apiKey: process.env.TILDE_API_KEY!,
    orgId: process.env.TILDE_ORG_ID!,
    teamId: process.env.TILDE_TEAM_ID!,
  }),
  webhookSigningKey: process.env.TILDE_WEBHOOK_SIGNING_KEY!,
  async handler(_request, context) {
    console.log({
      event: context.github?.event,
      owner: context.github?.owner,
      repo: context.github?.repo,
      pullNumber: context.github?.pull_number,
      issueNumber: context.github?.issue_number,
    });

    // ...rest of your agent code.
  },
});
```

```

...

```

```typescript app/api/slack-agent/route.ts theme={"system"}
import {
  chatKitEndpoint,
  createClient,
} from "@trytilde/harness-sdk-vercel-ai-node";

export const POST = chatKitEndpoint({
  client: createClient({
    apiKey: process.env.TILDE_API_KEY!,
    orgId: process.env.TILDE_ORG_ID!,
    teamId: process.env.TILDE_TEAM_ID!,
  }),
  webhookSigningKey: process.env.TILDE_WEBHOOK_SIGNING_KEY!,
  async handler(_request, context) {
    console.log({
      teamId: context.slack?.team_id,
      channelId: context.slack?.channel_id,
      threadTimestamp: context.slack?.thread_ts,
      userId: context.slack?.user,
    });

    // ...rest of your agent code.
  },
});
```

````

...

## Work with session context
`context.messages` contains the new input for the current turn. Load `context.session.history()` when the model needs the earlier conversation, then convert both collections together.
```typescript theme={"system"}
const history = await context.session.history();
const messages = await convertToAiSdkMessages({
  messages: [...history.items, ...context.messages],
  chatkit: context.chatkit,
});
````

The context also includes `sessionId`, team and organization IDs, the invoking user when known, and typed metadata for supported providers such as `context.slack` and `context.github`.

## Handle unprocessed content

`convertToAiSdkMessages` automatically converts standard text and reasoning parts. It also caches transformed message parts for later model requests, improving prompt caching and agent performance. Use `onUnprocessed` for content that needs application-specific handling before it can be sent to a model.

- `fileUpload` receives each unprocessed file part and its parent message.
- `firecrawl` maps page-monitoring and completed-check signals to typed message converters.
- `github` maps GitHub issue, pull request, and CI signal types to typed message converters.
- `sentry` maps a signal type, such as `sentry.issue.created`, to a typed message converter.
- Return an AI SDK message or part to include it. Return `null` to omit it.
- Handlers can be asynchronous. If a handler throws, message conversion fails.
  ChatKit invokes `onUnprocessed` once for each unprocessed message, then caches the result. Subsequent conversions reuse the cached value instead of invoking the handler again.
  <Tabs>
  <Tab title="File uploads">
  Use `createChatKitAttachmentFilePartHandler` to download ChatKit attachments with Tilde authentication and convert them into model-safe AI SDK file parts.

````
```typescript app/api/agent/route.ts theme={"system"}
import type { Client } from "@trytilde/harness-sdk";
import {
  type ChatKitEndpointContext,
  convertToAiSdkMessages,
  createChatKitAttachmentFilePartHandler,
} from "@trytilde/harness-sdk-vercel-ai-node";

async function convertTurn(
  client: Client,
  context: ChatKitEndpointContext,
) {
  const history = await context.session.history();

  return convertToAiSdkMessages({
    messages: [...history.items, ...context.messages],
    chatkit: context.chatkit,
    onUnprocessed: {
      fileUpload: createChatKitAttachmentFilePartHandler(client, context),
    },
  });
}
````

Supported media is downloaded and passed to the model as an inline file. Unsupported stored attachments become a text part containing the file name, media type, and download URL.

```

...

```

```typescript app/api/github-agent/route.ts theme={"system"}
import {
  type ChatKitEndpointContext,
  convertToAiSdkMessages,
  type GitHubSignalByType,
} from "@trytilde/harness-sdk-vercel-ai-node";
import type { UIMessage } from "ai";

type PullRequestOpened =
  GitHubSignalByType["github.pull_request.opened"];

function pullRequestOpenedMessage(
  signal: PullRequestOpened,
): UIMessage {
  const { repository, pull_request } = signal.data;

  return {
    id: signal.id,
    role: "user",
    parts: [{
      type: "text",
```

...

````
```typescript app/api/web-monitor/route.ts theme={"system"}
import {
  type ChatKitEndpointContext,
  convertToAiSdkMessages,
  type FirecrawlSignalByType,
} from "@trytilde/harness-sdk-vercel-ai-node";
import type { UIMessage } from "ai";

type PageChanged =
  FirecrawlSignalByType["firecrawl.monitor.page.changed"];

function pageChangedMessage(signal: PageChanged): UIMessage {
  const { monitor, page } = signal.data;

  return {
    id: signal.id,
    role: "user",
    parts: [{
      type: "text",
      text: `Review changes to ${page.url} from monitor ${monitor.id}.`,
    }],
  };
}

async function messagesForFirecrawlTurn(
  context: ChatKitEndpointContext,
) {
  const history = await context.session.history();

  return convertToAiSdkMessages({
    messages: [...history.items, ...context.messages],
    chatkit: context.chatkit,
    onUnprocessed: {
      firecrawl: {
        "firecrawl.monitor.page.changed": pageChangedMessage,
      },
    },
  });
}
````

Firecrawl also exposes `same`, `new`, `removed`, and `error` page events, plus `firecrawl.monitor.check.completed` for the completed check summary.

```

...

```

```typescript app/api/sentry-agent/route.ts theme={"system"}
import {
  type ChatKitEndpointContext,
  convertToAiSdkMessages,
  type SentrySignalByType,
} from "@trytilde/harness-sdk-vercel-ai-node";
import type { UIMessage } from "ai";

type IssueCreated =
  SentrySignalByType["sentry.issue.created"];

function issueCreatedMessage(signal: IssueCreated): UIMessage {
  const { issue } = signal.data.data;

  return {
    id: signal.id,
    role: "user",
    parts: [{
      type: "text",
      text: `Investigate ${issue.shortId ?? issue.id}: ${issue.title}`,
    }],
  };
}

async function messagesForSentryTurn(
  context: ChatKitEndpointContext,
) {
  const history = await context.session.history();

  return convertToAiSdkMessages({
    messages: [...history.items, ...context.messages],
    chatkit: context.chatkit,
    onUnprocessed: {
      sentry: {
```

...

## Let agents invoke other agents through MCP

- `message` accepts Vercel AI SDK-compatible UI message parts, persists the inbound ChatKit message, and immediately returns a ticket and session ID.

...

## Trigger work from events via Signals

```typescript app/api/sentry-remediation/route.ts theme={"system"}
import {
  chatKitEndpoint,
  convertToAiSdkMessages,
  createClient,
  type SentrySignalByType,
} from "@trytilde/harness-sdk-vercel-ai-node";
import type { UIMessage } from "ai";

type IssueCreatedSignal = SentrySignalByType["sentry.issue.created"];

function sentryIssueCreatedMessage(signal: IssueCreatedSignal): UIMessage {
  const { issue } = signal.data.data;

  return {
    id: signal.id,
    role: "user",
    parts: [
      {
        type: "text",
        text: `Investigate Sentry issue ${issue.shortId ?? issue.id}: ${issue.title}`,
      },
    ],
  };
}

export const POST = chatKitEndpoint({
  client: createClient({
    apiKey: process.env.TILDE_API_KEY!,
    orgId: process.env.TILDE_ORG_ID!,
    teamId: process.env.TILDE_TEAM_ID!,
  }),
  webhookSigningKey: process.env.TILDE_WEBHOOK_SIGNING_KEY!,
  async handler(_request, context) {
    const history = await context.session.history();
    const messages = await convertToAiSdkMessages({
      messages: [...history.items, ...context.messages],
      chatkit: context.chatkit,
      onUnprocessed: {
        sentry: {
          "sentry.issue.created": sentryIssueCreatedMessage,
        },
      },
    });

    // ...rest of your agent code.
  },
});
```

## ChatKit and memory

ChatKit preserves the messages inside a session. Memory stores selected knowledge that should be available across sessions, channels, or agents. Use both when an agent needs conversational continuity and longer-lived organizational context.

```

**Tool Result:** `TU-0346wZDAHTj3BzD9umt279`

```

# Terraform

> Export, share, and reproduce portable Tilde resource state.
> Well, not exactly. Tilde does not require a Terraform provider, but all Tilde resource state is portable. This makes it easy to share a setup and reproduce it across development, staging, and production workspaces.

## The `tilde.state.yaml` file

`tilde.state.yaml` describes the desired configuration for resources in a workspace. It can include ChatKit agents and providers, MCP servers, tool providers, skill registries, wikis, memory-bank bindings, reverse proxies, and their relationships.
State files can declare variables for values that change between environments, such as an agent endpoint URL. They do not contain API keys, signing keys, third-party credentials, conversation history, or other runtime content.

...

Hosted MCP provider connections preserve their catalog provider identity, endpoint configuration, authentication mode, tool provider, and MCP mappings. API keys, bearer tokens, OAuth client secrets, access tokens, and refresh tokens remain encrypted credential references rather than state values.
OAuth providers that use dynamic client registration must register a new client in the destination environment because the redirect URI and client registration belong to the source environment. Import recreates the provider and returns a one-time authorization URL.

...

Commit `tilde.state.yaml` with your application so reviewers can see which Tilde resources it expects.

## Export state from a workspace

<Tabs>
<Tab title="Tilde">
1. Select the workspace you want to export.
2. Go to **Settings** → **Team settings** → **State**.
3. Open the **Export** tab and click **Export**.
```
Tilde downloads the workspace configuration as `tilde.state.yaml`.
```
</Tab>
<Tab title="CLI">
`bash theme={"system"}     pnpm add -D @trytilde/cli     pnpm exec tilde auth login     pnpm exec tilde state export ./tilde.state.yaml     `
</Tab>
</Tabs>

## Import state manually

1. Select the destination workspace.
2. Go to **Settings** → **Team settings** → **State**.
3. Open the **Import** tab and upload `tilde.state.yaml`.
4. Provide any variables requested by the file.
5. Review the validation result and resource plan, then apply it.
6.

...

You can perform the same workflow from the CLI:

```bash theme={"system"}
pnpm exec tilde auth login
pnpm exec tilde state import ./tilde.state.yaml ./tilde-state-import-outputs.yaml
```

The CLI shows the plan before applying it. Add `--auto-apply` only in a trusted automated workflow where the state change has already been reviewed.

## Add a Deploy with Tilde button

Add the button to a project's `README.md` when its repository contains a `tilde.state.yaml` file.
[![Deploy with Tilde](https://api.trytilde.ai/deploy-button.svg)](https://api.trytilde.ai/deploy?repository-url=https%3A%2F%2Fgithub.com%2Ftrytilde%2Fexamples&state-path=hello-world-agent%2Ftilde.state.yaml)
Clicking the button opens Tilde, asks the user to select a workspace, reads the state file from GitHub, collects its variables, and shows the import plan before creating resources.
Use this Markdown and replace both query parameters with your repository and state-file path:

...

`repository-url` must point to a GitHub repository over HTTPS. `state-path` must be a relative path to a YAML file, so monorepos can use a value such as `agents/code-review/tilde.state.yaml`.

## Manage multiple environments

Keep one reviewed state file as the shared baseline. Use variables for environment-specific endpoints and reconnect credentials separately in each workspace. Import the same state into development, staging, and production, then review each plan before applying it.
<Warning>
State imports can update or replace existing configuration. Review conflicts, destructive changes, requested variables, and pending credentials before applying a plan.
</Warning>

```

**Tool Result:** `TU-0346wZDAfiU8OT6NjrEOz4`

```

# trytilde/harness-sdk

- Page: GitHub repository
- URL: https://github.com/trytilde/harness-sdk
- Stars: 0
- Forks: 0
- Default branch: main
- Created: 2026-06-08T14:46:39.000Z
- Commits: 60

## Top-level files

- .agents/skills/
- .github/workflows/
- .greptile/
- examples/nextjs-agent/
- packages/
- scripts/
- specs/
- test/e2e/
- .env.e2e.example
- .gitignore
- .sops.yaml
- AGENTS.md
- Makefile
- README.md
- biome.json
- openapi-ts.config.ts
- openapi.cloud.json
- package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- secrets.example.yaml
- tsconfig.base.json
- vitest.config.ts
- vitest.e2e.config.ts

# Tilde Harness SDK

TypeScript SDK packages for Tilde Harness APIs.

## Packages

- `@trytilde/harness-sdk` : core client, MCP helpers, ChatKit helpers, and message history.
- `@trytilde/harness-sdk-react` : React provider and ChatKit hooks.
- `@trytilde/harness-sdk-vercel-ai-node` : ChatKit webhook verification and Vercel AI SDK route helpers.
- `@trytilde/harness-sdk-vercel-ai-react` : React helpers for Vercel AI SDK ChatKit UIs.
- `@trytilde/cli` : Tilde terminal CLI, published with `tilde` and `t` binaries.

## Install

```shell
pnpm add @trytilde/harness-sdk @trytilde/harness-sdk-react @trytilde/harness-sdk-vercel-ai-node @trytilde/harness-sdk-vercel-ai-react
pnpm add -D @trytilde/cli
```

## CLI

```shell
tilde auth login
tilde auth whoami
tilde auth set-team
tilde state import ./tilde-state.yaml ./tilde-import-output.json
tilde state import ./tilde-state.yaml ./tilde-import-output.json --auto-apply
tilde state export ./tilde-state.yaml
```

...

## Core Config

```ts
import { createClient, createConfig } from "@trytilde/harness-sdk";

const tilde = createClient(
  createConfig({
    orgId: "org-example",
    teamId: "team_123",
    apiKey: process.env.TILDE_API_KEY,
    // Optional. Starts cloudflared for local agents/tools using apiKey.
    tunnel: true,
    // Optional. Defaults to process.env.TILDE_BASE_API_URL or https://api.trytilde.com.
    baseApiUrl: "https://api.trytilde.com",
  }),
);
```

## MCP Server URL

```ts
const server = await tilde.mcp.createServer({
  id: "my-agent-tools",
  name: "My Agent Tools",
  isDynamicToolDiscovery: true
});

console.log(server.url);

await tilde.mcp.addFunction({
  serverId: server.id,
  toolSourceTypeId: "tool-source-type",
  toolGroupSourceTypeId: "tool-group-source-type",
```

...

`client.mcp.getServerUrl({ id })` returns the raw Streamable HTTP MCP URL for AI SDK clients and other MCP-capable runtimes.

## MCP Local Tools

Wrap an existing MCP client to add process-local tools. Local tools are exposed
alongside remote MCP tools, execute in-process, and are split out of `MULTI_EXECUTE_TOOL` calls automatically.

```ts
import { createMCPClient } from "@ai-sdk/mcp";
import { wrapMcpClientWithLocalTools } from "@trytilde/harness-sdk";

const mcp = await createMCPClient({
  transport: {
    type: "http",
    url: tilde.mcp.getServerUrl({ id: "my-agent-tools" })
  }
});

const wrappedMcp = wrapMcpClientWithLocalTools({
```

...

## Vercel AI MCP Client

Use the Vercel AI node package to create an `@ai-sdk/mcp` client with Tilde
MCP URL construction and `x-api-key` authentication. Tools passed in the map are
registered as local tools alongside the remote MCP server tools.

```ts
import { jsonSchema, tool } from "ai";
import { createClient } from "@trytilde/harness-sdk";
import { createMCPClient } from "@trytilde/harness-sdk-vercel-ai-node";

const client = createClient({
  orgId: process.env.TILDE_ORG_ID!,
  teamId: process.env.TILDE_TEAM_ID!,
  apiKey: process.env.TILDE_API_KEY!,
});
```

...

## Remote Custom Tool Endpoint

Expose Zod-validated remote tools with signed discovery and invocation
handlers. The invocation URL defaults to the incoming request URL, with
optional `baseUrl` and `endpointPath` overrides for proxies.

```ts
import { toolEndpoint } from "@trytilde/harness-sdk-vercel-ai-node";
import { z } from "zod";

export const { GET, POST } = toolEndpoint({
  webhookSigningKey: process.env.TILDE_CUSTOM_TOOL_SIGNING_KEY!,
  provider: { name: "Example tools", version: "1.0.0" },
  tools: [
    {
      id: "greet",
      name: "Greet",
      description: "Greet a person by name.",
      inputSchema: z.object({ name: z.string() }),
      outputSchema: z.object({ greeting: z.string() }),
      async fn({ name }) {
        return { greeting: `Hello, ${name}!` };
      },
    },
  ],
});
```

## React ChatKit Hooks

```tsx
import {
  TildeProvider,
  useChatKitSessionEvents,
} from "@trytilde/harness-sdk-react";

function Events({ sessionId }: { sessionId: string }) {
  const events = useChatKitSessionEvents({ sessionId, pollIntervalMs: 3000 });
  return <pre>{JSON.stringify(events.items, null, 2)}</pre>;
}

export function App() {
  return (
    <TildeProvider config={{ baseUrl, teamId, apiKey }}>
      <Events sessionId="00000000-0000-0000-0000-000000000000" />
    </TildeProvider>
  );
}
```

...

## Examples

- `examples/nextjs-agent` : Next.js agent using Tilde ChatKit signed webhooks, dynamic MCP, and the Vercel AI SDK.

## Development

```shell
pnpm install
pnpm sdk:refresh
pnpm lint
```

## Publishing

The public runtime packages are versioned together and published in dependency
order:

1. `@trytilde/api-client`
2. `@trytilde/harness-sdk`
3. `@trytilde/harness-sdk-vercel-ai-node`
   Validate the release tarballs without publishing:

```shell
pnpm build
pnpm release:validate
pnpm release:smoke
pnpm release:publish -- --dry-run
```

The `Publish npm packages` GitHub workflow runs the complete validation suite
and skips package versions that already exist, so a partially completed release
can be retried safely.
The first npm release requires an `NPM_TOKEN` secret because trusted publishing
can only be configured after each package exists. After the first release,
configure each package to trust `trytilde/harness-sdk` and `publish.yml` , then
remove the long-lived token. The workflow already grants the required OIDC
permission.
Package builds use Vite and tests use Vitest. The generated OpenAPI types are internal. Add public APIs through hand-authored wrappers.

```

**Tool Result:** `TU-0346wZDB3mr7DNz5HcIPeR`

```

# Hello World Agent

The smallest complete Tilde agent: one signed ChatKit endpoint and one Vercel
UI channel. It uses Next.js and the Vercel AI SDK to keep a conversation with
an OpenAI model.
This project is the source for the Tilde [quickstart](https://docs.trytilde.ai/quickstart) .

## Prerequisites

- Node.js 22 or newer and pnpm 10.
- A Tilde account and team.
- An OpenAI API key.
- A Vercel account.

...

## 2. Create a public endpoint

The route loads its secrets only when Tilde invokes it, so the first deployment
can build before you configure the environment.

```shell
vercel deploy
```

Your ChatKit endpoint is the deployment URL plus `/api/hello-world` .

## 3. Import Tilde state

Use the endpoint from the previous step when Tilde asks for `HELLO_WORLD_CHATKIT_ENDPOINT_URL` .
[Deploy with Tilde](https://api.trytilde.ai/deploy?repository-url=https%3A%2F%2Fgithub.com%2Ftrytilde%2Fexamples&state-path=hello-world-agent%2Ftilde.state.yaml)
The state creates:

- the **Hello World** HTTP agent;
- a **Hello World UI** ChatKit channel for testing.
  Save the one-time `api_key` and `webhook_signing_key` outputs from `chatkit/agent/hello-world` .

...

## 4. Configure the environment

| Variable | Value |
| `OPENAI_API_KEY` | Your OpenAI API key. |
| `OPENAI_MODEL` | Defaults to `gpt-5.4` . |
| `TILDE_API_KEY` | The agent's one-time `api_key` output. |
| `TILDE_BASE_URL` | Defaults to `https://api.trytilde.ai` . |
| `TILDE_ORG_ID` | Your Tilde organization ID. |
| `TILDE_TEAM_ID` | Your Tilde team ID. |

...

## 5. Deploy and test

```shell
vercel deploy --prod
```

If the production hostname differs from the first deployment, update `HELLO_WORLD_CHATKIT_ENDPOINT_URL` to the production endpoint and re-import the
state. Open **ChatKit** , select **Hello World UI** , and send:

```
Say hello in one sentence.
```

For local development, run `pnpm dev` and expose port 3000 through a public
HTTPS tunnel. Update the ChatKit agent endpoint to the tunnel URL plus `/api/hello-world` before testing.

```

**Tool Result:** `TU-0346wZDBY4SYyoJfdIRTGK`

```

# trytilde/examples — code-review-bot

## Contents

- app/api/code-review/
- lib/
- .env.example
- .gitignore
- README.md
- eslint.config.mjs
- next-env.d.ts
- next.config.ts
- package.json
- pnpm-lock.yaml
- tilde.state.yaml
- tsconfig.json

# Code Review Bot

A production-oriented GitHub code review agent built with Next.js, the Vercel
AI SDK, Tilde, and Modal.
Tag the installed GitHub App in a pull request. Tilde turns the GitHub event
into a signed ChatKit message, invokes the Vercel endpoint, exposes an
allowlisted set of GitHub MCP tools, and brokers short-lived access to GitHub
and Modal without giving their long-lived credentials to the model.

## What It Does

- Handles full reviews, incremental reviews, and follow-up questions.
- Reads PR metadata, patches, commits, earlier reviews, and repository guidance.
- Clones the PR through Tilde's Git HTTPS reverse proxy.
- Runs bounded repository-native checks in a request-scoped Modal sandbox.

...

## Architecture

```
sequenceDiagram
    participant Developer
    participant GitHub
    participant Tilde
    participant Vercel
    participant Modal

    Developer->>GitHub: Tag the bot on a PR
    GitHub->>Tilde: GitHub App webhook
    Tilde->>Vercel: Signed ChatKit request + typed GitHub metadata
    Vercel->>Tilde: Connect to allowlisted MCP server
    Vercel->>Tilde: Open Modal gRPC reverse proxy
    Tilde->>Modal: Inject Modal credentials
    Vercel->>Modal: Create isolated review sandbox
    Modal->>Tilde: Clone via Git HTTPS reverse proxy
    Tilde->>GitHub: Inject installation token
    Vercel->>Tilde: Post review through GitHub MCP tools
    Tilde->>GitHub: Inline comments + review summary
```

Loading
The model never receives a GitHub installation token or Modal API key. The
ephemeral sandbox configures Git once to rewrite GitHub URLs through Tilde and
adds the Tilde proxy headers to its global Git configuration. Sandbox egress is
restricted to Tilde, and the configuration disappears when the sandbox stops.

## Prerequisites

- Node.js 22 or newer and pnpm 10.
- A Tilde account and team.
- A Modal workspace API key.
- A GitHub organization where you can create and install a GitHub App.
- An OpenAI API key.
- A Vercel project for deployment.

## 1. Install

```shell
pnpm install
cp .env.example .env.local
```

## 2. Import Tilde State

Set `CODEX_REVIEW_CHATKIT_ENDPOINT_URL` when importing [`tilde.state.yaml`](https://github.com/trytilde/examples/blob/main/code-review-bot/tilde.state.yaml) to the complete endpoint you intend to use.
[Deploy with Tilde](https://api.trytilde.ai/deploy?repository-url=https%3A%2F%2Fgithub.com%2Ftrytilde%2Fexamples&state-path=code-review-bot%2Ftilde.state.yaml)
For local development, use the public URL from your Tilde development tunnel.
Use the deploy button above, or import the file from Mission Control and provide
the variable when prompted.
The state creates:

- the HTTP/Vercel ChatKit agent;
- pending GitHub and Modal credential setup items;
- GitHub and Modal tool providers;
- a static MCP server containing the GitHub review and Modal inspection
  operations used by this agent.
  State cannot contain a GitHub App ID, installation ID, private key, webhook
  secret, or generated reverse-proxy profile ID. Those are credential-setup
  outputs and must not be committed.

## 3. Complete Credentials

Open **Settings > Team > Pending credentials** in Tilde.

1. Complete GitHub setup. Tilde creates a GitHub App from a manifest, asks
   where to install it, stores its private key and webhook secret, and creates
   GitHub REST and Git HTTPS reverse-proxy profiles.
2. Complete Modal setup with the workspace ID, API key ID, and API key secret.
   Tilde creates the Modal gRPC reverse-proxy profile.
3. In the resulting GitHub ChatKit provider, set **Code Review** as the default
   agent and restrict the repository allowlist for production.
   The GitHub App should be installed only on repositories the bot is allowed to
   review. Tilde-generated permissions should be reviewed before installation.

...

## 4. Configure Environment

| Variable | Value |
| `TILDE_API_KEY` | API key output from `chatkit/agent/code-review` |
| `TILDE_WEBHOOK_SIGNING_KEY` | Webhook signing key from the same agent |
| `TILDE_GITHUB_GIT_PROXY_PROFILE_ID` | Profile using provider `github_git_https` |
| `TILDE_MODAL_PROXY_PROFILE_ID` | Profile using provider `modal_sandbox` |
| `TILDE_ORG_ID` | Organization ID from Team > General information |
| `TILDE_TEAM_ID` | Team ID from Team > General information |

...

## 5. Run Locally

```shell
pnpm dev
```

Expose port 3000 through the Tilde development tunnel, then set the ChatKit
agent endpoint to:

```
https://YOUR_TUNNEL/api/code-review
```

Tag the GitHub App in an existing pull request:

```
@your-app-name review this PR
```

For an explicit complete rerun:

```
@your-app-name full review
```

...

## 6. Deploy to Vercel

Add every value from `.env.example` to the Vercel project. Mark API keys and
signing keys sensitive; IDs, model names, and base URLs do not need to be
secret.

```shell
vercel deploy --prod
```

Update `chatkit/agent/code-review` to the production endpoint and re-import the
state, or edit the endpoint in Mission Control.
The route exports `maxDuration = 300` . Confirm that the selected Vercel plan
supports the required function duration.

...

## Production Checklist

- Limit GitHub App installation and the Tilde repository allowlist.
- Keep the MCP server static; do not enable GitHub mutation tools unrelated to
  reviews.
- Configure Git proxy authentication only inside the ephemeral sandbox.
- Use webhook signature verification and reject stale requests.
- Keep sandbox CPU, memory, execution time, output, and idle lifetime bounded.
- Restrict sandbox egress to the configured Tilde reverse-proxy host.
- Do not inject platform credentials into the sandbox.
- Keep request timeout below the hosting platform's hard function limit and
  await idempotent MCP and sandbox cleanup.
- Re-read GitHub state after every write.
- Monitor tool errors, model finish reasons, review duration, and sandbox
  termination failures.
- Pin dependency versions and review updates to Modal's pre-1.0 JavaScript SDK.

## Files

- [`app/api/code-review/route.ts`](https://github.com/trytilde/examples/blob/main/code-review-bot/app/api/code-review/route.ts) : ChatKit
  endpoint and Vercel AI SDK loop.
- [`lib/code-review/prompt.ts`](https://github.com/trytilde/examples/blob/main/code-review-bot/lib/code-review/prompt.ts) : review behavior and
  output contract.
- [`lib/code-review/sandbox.ts`](https://github.com/trytilde/examples/blob/main/code-review-bot/lib/code-review/sandbox.ts) : Modal lifecycle,
  Git proxy setup, and pull-request checkout.
- [`lib/tilde.ts`](https://github.com/trytilde/examples/blob/main/code-review-bot/lib/tilde.ts) : the single configured Harness SDK client.
- [Tilde Harness SDK](https://github.com/trytilde/harness-sdk) : ChatKit, MCP,
  reverse-proxy, and typed provider-context integration.
- [`tilde.state.yaml`](https://github.com/trytilde/examples/blob/main/code-review-bot/tilde.state.yaml) : portable Tilde resources.

...

## Limitations

Modal's JavaScript SDK currently marks its underlying gRPC API as unstable.
Pin the SDK and test upgrades before deployment.

````

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,220p' package.json && printf '\\n--- apps/dev/package.json ---\\n' && sed -n '1,220p' apps/dev/package.json && printf '\\n--- binding package ---\\n' && sed -n '1,180p' packages/binding-flue/package.json",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
````

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,180p' apps/dev/src/app.ts && printf '\\n--- agent ---\\n' && sed -n '1,180p' apps/dev/src/agents/gherkin-elicitor.ts && printf '\\n--- config ---\\n' && sed -n '1,120p' apps/dev/flue.config.ts && sed -n '1,160p' apps/dev/vite.config.ts",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,240p' packages/binding-flue/src/index.ts && printf '\\n--- capabilities ---\\n' && sed -n '1,220p' packages/binding-flue/src/capabilities.ts && printf '\\n--- local store ---\\n' && sed -n '1,200p' packages/binding-flue/src/local-capture-store.ts",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,220p' CONTEXT.md && printf '\\n--- spec deployment section ---\\n' && sed -n '620,675p' docs/planning/elicitation-kernel/spec.md && printf '\\n--- known gaps ---\\n' && sed -n '1,180p' test/known-gaps.ts",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,180p' apps/dev/test/walking-skeleton.integration.ts && printf '\\n--- build artifact test ---\\n' && sed -n '1,180p' test/build-artifact.test.ts && printf '\\n--- CI ---\\n' && sed -n '1,120p' .github/workflows/ci.yml",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "git status --short --branch && printf '\\n--- recent ADR titles ---\\n' && rg -n '^#|^Status:|^## (Decision|Context|Consequences)' docs/adr docs/planning/elicitation-kernel/spec.md | sed -n '1,160p'",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
```

## User

**Tool Result:** `TU-0346wblVbGwhMXTxu1qmbp`

```
{
  "output": "{\n  \"name\": \"brunch-lite\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"description\": \"Elicitation harness — agentic interviewing against pluggable elicitation targets\",\n  \"workspaces\": [\"packages/*\", \"apps/*\"],\n  \"scripts\": {\n    \"lint\": \"oxlint --fix --deny-warnings .\",\n    \"lint:check\": \"oxlint --deny-warnings .\",\n    \"fmt\": \"oxfmt .\",\n    \"fmt:check\": \"oxfmt --check .\",\n    \"typecheck\": \"tsc -p tsconfig.json\",\n    \"test\": \"bun test\",\n    \"build\": \"bun run --filter '@brunch/*' build\",\n    \"smoke\": \"bun run lint:check && bun run fmt:check && bun run typecheck && bun test\"\n  },\n  \"devDependencies\": {\n    \"@anthropic-ai/sdk\": \"^0.116.0\",\n    \"@types/bun\": \"^1.3.0\",\n    \"oxfmt\": \"^0.5.0\",\n    \"oxlint\": \"^1.42.0\",\n    \"typescript\": \"^5.9.0\",\n    \"vite\": \"^8\"\n  }\n}\n\n--- apps/dev/package.json ---\n{\n  \"name\": \"@brunch/dev\",\n  \"version\": \"0.0.0\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"description\": \"The dev/demo vehicle: local dev loop, target gallery, diagnostic probe surface. Not the product.\",\n  \"scripts\": {\n    \"dev\": \"vite dev\",\n    \"build\": \"vite build && vite build --config vite.client.config.ts\"\n  },\n  \"dependencies\": {\n    \"@brunch/binding-flue\": \"workspace:*\",\n    \"@brunch/core\": \"workspace:*\",\n    \"@brunch/plugin-gherkin\": \"workspace:*\",\n    \"@flue/react\": \"^2.0.3\",\n    \"@flue/runtime\": \"^2.0.3\",\n    \"@flue/sdk\": \"^2.0.3\",\n    \"hono\": \"^4.6.0\",\n    \"react\": \"^19.0.0\",\n    \"react-dom\": \"^19.0.0\",\n    \"valibot\": \"^1.4.2\"\n  },\n  \"devDependencies\": {\n    \"@earendil-works/pi-ai\": \"^0.83.0\",\n    \"@flue/vite\": \"^2.0.3\",\n    \"@types/react\": \"^19.0.0\",\n    \"@types/react-dom\": \"^19.0.0\",\n    \"vite\": \"^8\"\n  }\n}\n\n--- binding package ---\n{\n  \"name\": \"@brunch/binding-flue\",\n  \"version\": \"0.0.0\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"description\": \"The Flue binding: implements the substrate-capability list and owns the storage-port implementation.\",\n  \"exports\": {\n    \".\": \"./src/index.ts\"\n  },\n  \"dependencies\": {\n    \"@brunch/core\": \"workspace:*\",\n    \"@flue/runtime\": \"^2.0.3\",\n    \"valibot\": \"^1.4.2\"\n  }\n}\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-0346wblYKVSlMujnM0HrOX`

```
{
  "output": "/**\n * The dev app's route map — the \"mount\" half of the thin host (spec §12.1).\n *\n * The dev app is chartered with three roles, none of them \"the product\"\n * (spec §12.5): the local dev loop against every plugin, the colleague-facing\n * target-gallery demo, and the diagnostic probe surface. Milestone one keeps\n * affordance renderers here rather than in a ui package.\n */\n\nimport { readFile } from 'node:fs/promises';\nimport { createAgentRouter } from '@flue/runtime/routing';\nimport { Hono } from 'hono';\nimport { GherkinElicitor } from './agents/gherkin-elicitor.ts';\nimport { assetHandler } from './assets.ts';\nimport { GHERKIN_AGENT_ROUTE } from './routes.ts';\n\nconst app = new Hono();\n\n// One route per target agent. The gallery grows an entry per plugin; gherkin\n// is the tracer that wires end-to-end first (spec §13). The browser and mount\n// share the route constant; Flue still keys storage on the agent's independent,\n// pinned identity.\napp.route(`/agents/${GHERKIN_AGENT_ROUTE}`, createAgentRouter(GherkinElicitor));\n\n// The flue dev controller owns the whole request space — no fall-through to\n// vite's html serving — so the ui is app-served, in dev and in production\n// alike (spec §10, recorded facts).\n//\n// Two different files, because two different builds produce them: in dev, the\n// source `index.html` whose script tag vite resolves live; in production, the\n// client build's emitted `index.html`, whose script tag points at a real\n// bundled asset. `@flue/vite` emits the server environment only, so that\n// client build is a second, plain vite build — without it the ui tree would\n// have no build coverage at all.\nconst uiRoot = new URL(import.meta.env?.DEV === false ? './client/' : '../', import.meta.url);\n\napp.get('/', async (c) => c.html(await readFile(new URL('index.html', uiRoot), 'utf8')));\n\n// Production only: in dev, vite serves the module graph under /src. A\n// wildcard, not `:file` — bundlers may emit nested asset paths.\napp.get('/assets/*', assetHandler(uiRoot));\n\nexport default app;\n\n--- agent ---\n'use agent';\n/**\n * The gherkin elicitor (spec §12.5: one agent per target).\n *\n * Named as a noun — the thing, not the act — and read target-first, so the\n * family sorts together as targets multiply: `gherkin-elicitor`,\n * `assurance-elicitor`.\n *\n * The product is the harness library in a thin host-authored agent — Flue's\n * build-time scan makes the alternative structurally unavailable, since a\n * library cannot ship a pre-registered agent (spec §12.1). So this module is\n * deliberately thin: it mounts harness capability and holds no elicitation\n * semantics of its own.\n *\n * Three recorded Flue constraints are honoured here by construction (spec §10):\n * the `'use agent'` directive is the file's first statement; `agentName` is a\n * pinned string literal, because conversation storage keys on it; and the tool\n * set is static, because prompt-cache economics forbid per-question tool\n * swapping.\n */\n\nimport { useElicitation } from '@brunch/binding-flue';\nimport { gherkin } from '@brunch/plugin-gherkin';\nimport { useModel, type AgentProps } from '@flue/runtime';\nimport * as v from 'valibot';\n\nexport function GherkinElicitor(_props: AgentProps) {\n  useModel('anthropic/claude-haiku-4-5');\n  return useElicitation(gherkin);\n}\n\n/**\n * Pinned, and never to be edited: conversation storage keys on this literal,\n * so changing it orphans every existing conversation. Flue requires a string\n * literal here because build targets derive durable identifiers from it before\n * any user code runs.\n *\n * Product-prefixed on purpose, and this is the one place the prefix is not\n * cosmetic. Agent identities are global per application, and the September\n * demo shell is chartered to mount this library alongside the Petrinaut\n * libraries — a bare `gherkin-elicitor` could collide with another library's\n * agent, and the collision would land on durable conversation storage.\n *\n * The exported symbol stays the shorter `GherkinElicitor` because it reads\n * better at the mount site; `agentName` exists precisely to let durable\n * identity and source-level name differ.\n */\nGherkinElicitor.agentName = 'brunch-gherkin-elicitor';\n\n/**\n * Session→document binding (spec §9.1, adjudication L4): a new session's\n * `initialData` carries the target-document id, validated once at creation and\n * immutable thereafter — Flue's own lane for a target descriptor. Dispatching\n * to an existing conversation id resumes that session against the current state\n * of its target-document.\n */\nGherkinElicitor.initialData = v.object({\n  targetDocumentId: v.pipe(v.string(), v.nonEmpty()),\n});\n\n--- config ---\nimport { defineConfig } from '@flue/runtime/config';\n\nexport default defineConfig({\n  target: 'node',\n});\nimport { flue } from '@flue/vite';\nimport { defineConfig } from 'vite';\n\n// No @vitejs/plugin-react: the flue plugin's dev controller owns the whole\n// request space and hands every request to app.ts, with no fall-through to\n// vite's html middleware — so index.html is app-served and react-refresh's\n// preamble injection would never run (recorded Flue fact, spec §10). Vite's\n// core esbuild transform still compiles the .tsx modules.\nexport default defineConfig({\n  plugins: [flue()],\n});\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-0346wblbY0gbCrUkZxeF98`

```
{
  "output": "/**\n * `@brunch/binding-flue` — the Flue binding.\n *\n * One binding per substrate. It implements the substrate-capability list\n * (spec §10), owns the storage-port implementation (spec §9.6), and is the\n * only shell allowed to know Flue's dialect: **the harness imports no\n * substrate; a binding imports both** (spec §4).\n *\n * Every time mechanism wants to land in here, the second-binding test applies\n * (spec §14.2): genuinely substrate-specific, or mechanism leaking into Flue's\n * dialect?\n */\n\nimport {\n  AskInput,\n  FreeTextAffordance,\n  toolName,\n  type FreeTextAffordanceValue,\n  type Plugin,\n} from '@brunch/core';\nimport {\n  useAgentStart,\n  useDataWriter,\n  useDelivery,\n  usePersistentState,\n  useTool,\n} from '@flue/runtime';\n\nexport { CAPABILITIES, type Capability, type Provision } from './capabilities.ts';\nexport { createLocalCaptureStore } from './local-capture-store.ts';\n\n/**\n * Mount the elicitation harness in a Flue agent.\n *\n * Flue has no ask-the-user primitive, so the harness owns the turn-suspension\n * protocol: a `terminate: true` ask tool, the pending affordance in\n * per-session state, and the answer arriving as a fresh dispatch (spec §7.4).\n */\nexport function useElicitation(plugin: Plugin): string {\n  const delivery = useDelivery();\n  const [pending, setPending] = usePersistentState<FreeTextAffordanceValue | null>(\n    'pendingAffordance',\n    null,\n  );\n  const writeAffordance = useDataWriter('affordance', { schema: FreeTextAffordance });\n\n  useAgentStart((ctx) => {\n    if (delivery.kind !== 'user' || pending === null) return;\n\n    setPending(null);\n    ctx.append({\n      kind: 'signal',\n      type: 'affordance-reply-bound',\n      tagName: 'affordance-reply-bound',\n      body: `The immediately preceding user message is mechanically bound as the reply to this pending affordance:\\n\\n${pending.markdown}`,\n      attributes: { affordanceId: pending.id },\n    });\n  });\n\n  useTool({\n    name: toolName('ask'),\n    description:\n      'Ask one free-text question and suspend this turn for the person’s reply. A second ask in the same tool batch is rejected.',\n    input: AskInput,\n    output: FreeTextAffordance,\n    run({ data, toolCallId }) {\n      const affordance: FreeTextAffordanceValue = {\n        id: `affordance_${toolCallId}`,\n        form: 'free-text',\n        markdown: data.question,\n        payload: { question: data.question },\n      };\n\n      setPending((current) => {\n        if (current !== null) {\n          throw new Error(\n            `An interactive affordance is already pending (${current.id}); wait for its reply before asking another question.`,\n          );\n        }\n        return affordance;\n      });\n      writeAffordance(affordance);\n\n      return { output: affordance, terminate: true };\n    },\n  });\n\n  return [\n    `You are interviewing someone to elicit ${plugin.targetDomain}.`,\n    `Ask one question at a time with ${toolName('ask')}.`,\n    'Continue the conversation after each reply, using the harness-provided reply binding as a mechanical fact.',\n  ].join('\\n\\n');\n}\n\n--- capabilities ---\n/**\n * The substrate-capability list (spec §10), recorded as data.\n *\n * This is the core/binding seam, the portability pressure test, and the early\n * smell detector all at once: porting means reimplementing this list, and\n * exotic Flue-shaped entries appearing in it is the smell. Keeping it as a\n * checkable record rather than prose is what lets the second-binding test\n * (spec §14.2) be asked of every future addition — \"genuinely\n * substrate-specific, or mechanism leaking into Flue's dialect?\"\n *\n * Binding-size asymmetry is expected, not failure: each binding absorbs what\n * its substrate lacks or forbids.\n */\n\n/** How a binding satisfies one capability. */\nexport type Provision =\n  /** The substrate offers it directly. */\n  | 'native'\n  /** The substrate lacks or forbids it; the binding supplies it itself. */\n  | 'absorbed';\n\nexport interface Capability {\n  readonly id: number;\n  readonly name: string;\n  readonly provision: Provision;\n  /** How this binding satisfies it, in Flue's dialect. */\n  readonly mechanism: string;\n}\n\nexport const CAPABILITIES: readonly Capability[] = [\n  {\n    id: 1,\n    name: 'Register a tool',\n    provision: 'native',\n    mechanism: 'defineTool / useTool',\n  },\n  {\n    id: 2,\n    name: 'Contribute instructions',\n    provision: 'native',\n    mechanism: 'render return',\n  },\n  {\n    id: 3,\n    name: 'Persist per-conversation state',\n    provision: 'native',\n    mechanism: 'usePersistentState, atomic with its unit of work',\n  },\n  {\n    id: 4,\n    name: 'Emit an affordance payload',\n    provision: 'native',\n    mechanism: 'data channel + tool output parts',\n  },\n  {\n    id: 5,\n    name: 'Suspend for reply',\n    provision: 'absorbed',\n    mechanism: 'no ask primitive: terminate:true + pending-affordance slot + fresh dispatch',\n  },\n  {\n    id: 6,\n    name: 'Private model call',\n    provision: 'native',\n    mechanism: 'harness.prompt scratch conversation',\n  },\n  {\n    id: 7,\n    name: 'Subscribe to the would-stop lifecycle seam',\n    provision: 'native',\n    mechanism:\n      'useAgentFinish + ctx.append; fires on suspensions, so the pending guard is load-bearing; loop-guarded',\n  },\n  {\n    id: 8,\n    name: 'Read the durable entry projection with provenance-discriminating entry kinds',\n    provision: 'absorbed',\n    mechanism:\n      'no in-process API: public history projection over self-HTTP; `purpose` discriminates provenance',\n  },\n  {\n    id: 9,\n    name: 'Inject typed non-user signal entries',\n    provision: 'native',\n    mechanism: \"ctx.append / dispatch({kind:'signal'}); projects structurally non-user\",\n  },\n  {\n    id: 10,\n    name: 'Provide a transactional durable store outside conversation state',\n    provision: 'absorbed',\n    mechanism:\n      'Flue neither provides nor forbids; the binding owns the storage-port implementation',\n  },\n];\n\n--- local store ---\nimport {\n  applyCaptureStoreCommand,\n  createEmptyCaptureStoreSnapshot,\n  parseCaptureStoreSnapshot,\n  type CaptureStore,\n  type CaptureStoreCommand,\n  type CaptureStoreResult,\n  type CaptureStoreSnapshot,\n} from '@brunch/core';\nimport { randomUUID } from 'node:crypto';\nimport { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';\nimport { dirname, resolve } from 'node:path';\n\nconst writesByPath = new Map<string, Promise<void>>();\n\nclass LocalCaptureStore implements CaptureStore {\n  readonly #path: string;\n\n  constructor(path: string) {\n    this.#path = resolve(path);\n  }\n\n  async read(): Promise<CaptureStoreSnapshot> {\n    await writesByPath.get(this.#path);\n    return this.#readFile();\n  }\n\n  async execute(command: CaptureStoreCommand): Promise<CaptureStoreResult> {\n    const previous = writesByPath.get(this.#path) ?? Promise.resolve();\n    const operation = previous.then(async () => {\n      const result = applyCaptureStoreCommand(await this.#readFile(), command);\n      if (result.ok) await this.#writeFile(result.snapshot);\n      return result;\n    });\n    const settled = operation.then(\n      () => undefined,\n      () => undefined,\n    );\n    writesByPath.set(this.#path, settled);\n    void settled.finally(() => {\n      if (writesByPath.get(this.#path) === settled) writesByPath.delete(this.#path);\n    });\n    return operation;\n  }\n\n  async #readFile(): Promise<CaptureStoreSnapshot> {\n    try {\n      return parseCaptureStoreSnapshot(JSON.parse(await readFile(this.#path, 'utf8')));\n    } catch (error) {\n      if (\n        error instanceof Error &&\n        'code' in error &&\n        (error as NodeJS.ErrnoException).code === 'ENOENT'\n      ) {\n        return createEmptyCaptureStoreSnapshot();\n      }\n      throw error;\n    }\n  }\n\n  async #writeFile(snapshot: CaptureStoreSnapshot): Promise<void> {\n    await mkdir(dirname(this.#path), { recursive: true });\n    const temporaryPath = `${this.#path}.${randomUUID()}.tmp`;\n    try {\n      await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\\n`, {\n        encoding: 'utf8',\n        flag: 'wx',\n      });\n      await rename(temporaryPath, this.#path);\n    } finally {\n      await rm(temporaryPath, { force: true });\n    }\n  }\n}\n\nexport const createLocalCaptureStore = (path: string): CaptureStore => new LocalCaptureStore(path);\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-0346wblefITqctRFXexOWS`

```
{
  "output": "# Elicitation Kernel\n\nVocabulary for the elicitation-kernel effort: a standalone architecture generalizing brunch's elicitor into agentic interviewing against pluggable elicitation targets.\n\n## Language\n\n### Shells\n\n**Substrate**:\nThe agent framework the system is built on — the Pi family, Flue — including the embedding environment's concerns: deploy target, storage-port implementation, artifact delivery, model/provider. (The retired term \"host\" silently bundled these with interface concerns; they split into substrate and UI. The charter non-goal \"harness-agnostic core\" predates this glossary and reads \"substrate-agnostic\".)\n_Avoid_: harness (for Pi/Flue), platform, host (for the embedding environment)\n\n**UI**:\nThe interface shell: whatever affords user interaction — rendering, input, reply transport. Not bound to GUI or TUI; a chat channel qualifies.\n_Avoid_: host, host-interface, frontend, client\n\n**Harness**:\nThe middle shell and the essence of the effort: the generic capability layer of the elicitation system — mechanism and orchestration (the conversation loop, the `ask` API, capture envelope, issue queue, sweep bookkeeping). Injected into plugins as a narrow context; never owned by them.\n_Avoid_: kernel, core, elicitor (as a shell name — \"elicitor\" may name the whole system). Exempt compound: **kernel card** (below). \"Kernel invariants\" renamed **harness invariants** (spec §14.1).\n\n**Plugin**:\nThe innermost shell: target-defining policy. Declares packs, forms, and validators; composes at authoring time; receives harness capabilities by injection. Mostly policy — mechanism stays in the harness.\n_Avoid_: extension, pack (a pack is a unit *within* a plugin)\n\n**Binding**:\nThe substrate-facing adapter between harness and substrate: implements the harness's named substrate-capability list (tool registration, instruction assembly, persistent state, affordance emission, suspend-for-reply, private model call) in one substrate's dialect. One per substrate; the harness imports no substrate, a binding imports both. Bindings vary in size — each absorbs what its substrate lacks or forbids.\n_Avoid_: adapter (generic), integration, wrapper\n\n### Sessions & durability\n\n**Target-domain**:\nThe artifact family being elicited — what a plugin defines (gherkin scenarios, assurance arguments, BPMN). The family half of the former bare \"target\".\n_Avoid_: target-paradigm; bare \"target\" where family/instance is ambiguous\n\n**Target-document**:\nThe durable unit sessions attach to: one target-domain, its capture store, and its session history. Named by its purpose — its authoritative state is the capture store plus session logs, never the rendered artifact (renders are derived, cacheable, disposable). Endures independently of any session; never locks — completion is a derived status, not a write gate.\n_Avoid_: spec (as the unit name), workpiece, case, target-output\n\n**Session**:\nOne substrate conversation — the full log of entries (user, agent, tool calls, injected state messages), matching Pi's session model. Per-session state is exactly: the evidence log, the swept high-water mark, the pending-affordance slot. Sessions go quiet rather than close; any session is resumable against the current state of its target-document.\n_Avoid_: sitting, conversation (as a distinct concept)\n\n**Capture store**:\nThe durable, session-independent truth of a target-document: captures, issues, events. Written only by atomic sweep application (serialized); statuses and projections derive from it at read time.\n\n**Re-entry briefing**:\nThe state message the harness injects when a session resumes after the world moved: computed facts only — unswept tail, world-moved delta, open issues, pending affordance. Authored on behalf of the user in the transcript (Pi's custom-entry convention) but distinguished from true user entries in the data model, and never citable as capture evidence.\n_Avoid_: sync message, forced re-sweep\n\n### Interaction\n\n**Affordance**:\nA structured interactive element (question form, choice strip, questionnaire) emitted into the conversation stream as a rendered enhancement. Not a state machine — the conversation stays primary, and an affordance's payload is evidence in the session like any other entry.\n_Avoid_: exchange, exchange pair, terminal (brunch's retired turn-by-turn ontology)\n\n**Capture**:\nExtraction of structured evidence — envelope plus plugin-typed payload — from session entries. Produced by sweeps, never written directly during conversation.\n_Avoid_: extraction, harvest\n\n**Sweep**:\nAn idempotent pass over a settled range of session entries that produces captures. Re-sweeping a range never double-captures.\n\n**Settlement**:\nThe agent-judged event marking a range of conversation (a vein closing) ready to sweep. Always range-level, never per-question.\n_Avoid_: exchange completion\n\n**Interpretation render**:\nThe harness-owned affordance form showing current captured state — the harness frames envelope semantics; the plugin's renderer definition (typed against its own payload shapes) supplies the content view when provided, with a harness default (plain JSON view) otherwise.\n_Avoid_: digest (brunch's form)\n\n### Envelope & packs\n\n**Intermediate representation (IR)**:\nThe elicited description a target-document accumulates: the set of active captures, read through the plugin's declared payload type system. Not a second store — every consolidated view (entity graph, net, completion table) is a read-time projection over active captures, and the rendered artifact is one projection of the IR, never the IR itself. Defining a plugin's IR means defining its payload type system.\n_Avoid_: knowledge store, domain model (as a stored unit), staging area\n\n**Capture envelope**:\nThe harness-defined, domain-free wrapper around an opaque plugin payload: harness-minted id, evidence spans, epistemic status, confidence, value-xor-absence, alternatives grouping, one `supersedes` link. The hourglass waist. No stored status — envelope status (`active | superseded | retracted`) derives at read time from links and events.\n\n**Evidence span**:\nA capture's provenance link: a **quoted excerpt** (primary, the model-facing citation currency) plus a **pointer** (session id + entry range, harness-derived — entry identity is harness-side vocabulary only). Anchors only on true user and user-affordance-payload entries.\n\n**Epistemic status**:\n`explicit | inferred | tentative | defaulted | external-lookup` — how a capture's content relates to what the user actually said. Distinct from confidence; excluded from capture identity.\n\n**Absence state**:\nA first-class capture value where an answer would be: `unknown-to-user | not-yet-decided | not-applicable | explicitly-absent | declined | deferred` (`not-mentioned` is a computed fact, not a sweepable capture). Never collapses to null.\n_Avoid_: null, missing (as the stored representation)\n\n**Supersession**:\nThe explicit correction mechanism, single-hop over active heads only. Two channels: the creation-time `supersedes` link (sweep-time correction) and the resolution record (issue-time adjudication). Superseded captures stay visible — corrections don't erase history.\n\n**Resolution record**:\nThe explicit capture-store event that alone closes a `conflicting` issue (and, with no successor capture, expresses retraction). Must cite the true user's utterance as evidence.\n\n**Issue**:\nTyped, stored backpressure to the elicitation controller: `missing / ambiguous / conflicting / invalid / unsupported / unmapped / low-confidence`, with factual attributes. Two producers, namespaced: plugin ops (payload level) and the harness itself (envelope level). Closes only explicitly.\n_Avoid_: advisory (a different thing, below)\n\n**Advisory**:\nA computed, ephemeral, non-blocking fact the harness surfaces to the agent (unaccounted ask, unswept tail, world-moved delta). Never stored in the capture store; never gates anything.\n\n**Pack**:\nA unit within a plugin: **ElicitationPack** (kernel cards, completion contract, clarification hints) or **ProjectionPack** (`project` + `validate`, optional `reconcile`, annotated shapes, typed loss reports). Packs are shapes-to-fill plus behavioral guidance, per Principle v2.\n\n**Kernel card**:\nThe pack-content unit of elicitation guidance: Detects / Goal / contrastive Questions / Artifacts (brunch `BEHAVIORAL_KERNELS.md` lineage — \"kernel\" here names a small unit of behavioral guidance, not a shell; the compound is the glossary's one sanctioned \"kernel\" use). Splits by ownership: domain cards are plugin pack content; a harness-shipped **generic strategy quiver** (cards over envelope vocabulary — conflict, ambiguity, weak evidence) is named in spec §11.5, not designed.\n\n**PluginContext**:\nThe narrow injected context through which a plugin receives harness capabilities (the ask API, envelope, issue queue, sweep bookkeeping). The plugin's entire world at runtime; the four operations remain pure (snapshot-in/deltas-out) regardless.\n\n**Storage port**:\nThe harness-defined contract for the capture store (atomic sweep application, envelope invariants as store-level refusals), implemented by the binding for its deploy target. Plugins are storage-blind. Scope includes the **session-log archive** (archive-on-read; spec §9.6): session logs live with the target-document, retained indefinitely — the substrate's conversation store is the live transport copy, never the provenance record.\n\n### September demo\n\n**Demo shell**:\nThe one-off application built for the 17–18 September demo: consumes the elicitation library (harness + plugin + binding) and the Petrinaut libraries, owns the UI, session persistence, and elicitor runtime. Explicitly disposable — not a product commitment; neither library consumes the other.\n_Avoid_: \"the app\", standalone brunch, demo app (unqualified)\n\n**Artifact boundary**:\nThe decided integration posture between elicitor and Petrinaut (FE-1362): the elicitor emits a versioned net file plus scenario; Petrinaut consumes it through its published parser and import-with-autolayout path. The rejected alternative was library coupling (one library consuming the other).\n_Avoid_: file handoff (undersells it), integration (generic)\n\n**Revision story**:\nThe working-hypothesis demo spine (FE-1363; recommended to PM, not ratified): a sped-up recorded elicitation (conversation, interpretation surface, and growing net visible together) plus a bounded live segment in which a few turns elicit a fact forcing a structural revision of the net, run before/after in Petrinaut.\n_Avoid_: live demo (unqualified — the live part is one bounded segment, not the format)\n\n### Simulation & evaluation\n\n**Situation pack**:\nThe interviewee-side bundle defining a user-to-be-simulated: situation, scenario, and persona — knowledge and motivations, some facts deliberately coloured by the persona's perspective. Private to the agent (or human) playing the user. Invariant: never authored from, or shaped to mirror, the IR — the elicitor's job is to excavate across that wall.\n_Avoid_: fact pack (undersells the persona; collides with the answer key), persona pack (too narrow)\n\n**Answer key**:\nThe modeller-side list of facts the reference net needs, derived from the reference model — the evaluation rubric for what an elicitation should have excavated from a situation pack. Satisfies PRO-99's \"written list of all facts necessary to make the net\". Sits on the elicitor-team side of the wall; never part of the situation pack.\n_Avoid_: fact list (ambiguous with situation-pack content)\n\n**Walking skeleton**:\nA prototype that proves a transport or integration end-to-end on the real substrate (e.g. a real Flue agent + web UI) with stubbed internals.\n\n**Logic-prototype**:\nA prototype that locks down mechanism semantics (e.g. capture sweeps, settlement) in isolation, without the full host substrate.\n\n--- spec deployment section ---\nthe second-binding test keeps passing. **Publishing posture: workspace-internal**; the publishable\nshape is exactly the package boundaries above, but publishing waits on the real name and an\nexternal consumer.\n\n### 12.3 Naming & tool namespacing\n\nArchitectural strings name **identity, not function**: tool prefix derived from the product name —\nprovisionally `bl_*`, never `elicit_*`. All model-facing tools are harness-owned (plugins expose\noperations, not tools); core names operations abstractly, the binding renders substrate tool\nnames. The name-fog eventually resolves every provisional string; nothing bakes \"elicit\" or\n\"brunch\" into structure.\n\n### 12.4 Schemas and the SDK\n\n**Valibot throughout** — Flue locks it at every boundary; a Standard-Schema waist would buy\ncomfort at the cost of a conversion seam that can silently drop constraints (the silent-coercion\nsmell). SDK surface (core's exports): evidence anchoring, capture identity, issue construction,\nschema validation, retries, idempotency, state-delta application, tracing, test fixtures, the\nlocal simulation harness (\"debugging should not require reading an entire agent transcript\"), plus\nthe testing machinery of §14.4 (schema-driven arbitraries, the command alphabet, mutation\noperators, fixture freeze/replay format).\n\n### 12.5 Dev app, deploy, remote parity\n\n- **Dev app chartered with three roles** (roles, not features): the local dev loop against both\n  plugins; the colleague-facing **target-gallery demo** (parallel tabbed sessions across targets);\n  the **diagnostic probe surface** (provisional affordance renderers now; the exploded-view\n  instrumented readout when that fog graduates). One agent per target (`ElicitGherkin`,\n  `ElicitAssurance`): static per-agent tool sets, and the shape Cloudflare forces anyway.\n- **UI affordance package deferred**, named as intended: React renderers + reply transport over\n  `@flue/react`; non-React hosts build on `@flue/sdk`. Milestone one keeps renderers in the dev\n  app.\n- **Milestone one is local-only**, with **remote-parity constraints pinned now** so nothing\n  local-only creeps in: one-agent-many-conversations; pinned `agentName`; the storage port owned\n  outside the plugin (harness-defined, binding-implemented, §9.6); no dynamic agent creation.\n  Deploy-target choice waits on an infra conversation and blocks nothing here.\n- **CI smoke** = `vite build` + the simulation suite (no model key, no flake); an optional\n  secret-gated real-model `flue run` smoke once a provider key exists.\n\n### 12.6 Version axes (named, none implemented)\n\nAPI contract / plugin implementation / concept-schema / target-schema / persisted state. A change\nto a field's meaning is not a serializer change; the future migration story must be able to decide\nreuse / mechanical migration / reinterpretation-from-evidence / re-elicit.\n\n## 13. Dev targets and milestone one\n\n**Portfolio**: `plugin-gherkin` (tracer) + `plugin-assurance` (second target; forces the pack swap\nand the evidence-graded envelope); BPMN/process-mining named third; full elicit-lean deferred.\n**Hybrid order**: **both packs are authored before the pack interface freezes** (the two-targets-\non-each-axis rule, applied at design time — the trivial target must not freeze the contract before\nthe hard target has stressed it); **gherkin wires end-to-end first** as the cheap mechanism proof,\nassurance immediately after.\n\n### 13.1 Gherkin (milestone one)\n\n\n--- known gaps ---\n/**\n * The gaps this codebase knows it has.\n *\n * Spec §14.5 names five open verification items. Prose decays: an item nobody\n * runs into is an item nobody closes, and the ones here are exactly the kind\n * that stay invisible — a substrate behaviour nobody has driven, a durability\n * claim nobody has restarted into.\n *\n * So each gap is a record with a `closed` predicate that runs on every `bun\n * test`. Two things follow, and the second is the point:\n *\n * - while a gap is open, it is listed in the run output rather than forgotten;\n * - **when a gap's condition becomes true, the suite goes red** and stays red\n *   until someone deletes the entry. Closing a gap by accident is not allowed\n *   to pass silently — somebody has to look at it, confirm it, and record it\n *   on the ticket that owns it.\n *\n * The failure message is therefore an instruction, not a complaint.\n */\n\nimport { join } from 'node:path';\nimport { filesIn, REPO_ROOT, sourceFiles, workspacePackages } from './workspace.ts';\n\nexport interface KnownGap {\n  /** Short stable handle, used in test names. */\n  readonly id: string;\n  /** Spec section that names the item. */\n  readonly spec: string;\n  /** The Linear issue that owns closing it. */\n  readonly ticket: string;\n  /** What is not yet known, in one sentence. */\n  readonly gap: string;\n  /** What closing it requires — the thing a follow-up slice actually does. */\n  readonly closes: string;\n  /**\n   * True once the gap is demonstrably closed. Kept cheap and structural: this\n   * runs on every test invocation, so it may look at the tree but never at a\n   * model, a network, or a substrate.\n   */\n  readonly closed: () => boolean;\n}\n\n/**\n * A gap that a follow-up test closes is closed only when a test carrying the\n * citation `closes-gap: <id>` actually runs somewhere under `dir`:\n * registering a test and asserting something. Content rather than a filename,\n * because a filename check fails in both directions — `touch`ing the guessed\n * path \"closed\" a gap with nothing verified, while a real closure under any\n * other name stayed \"open\" forever and rotted the banner.\n *\n * The citation is a deliberate token, not any prose mention of the id: a test\n * that merely *talks about* the gap must not close it (the same cry-wolf\n * failure the directive check had with comments that mention `'use agent'`).\n */\nconst closedByTest = (dir: string, gapId: string): boolean =>\n  filesIn(join(REPO_ROOT, dir)).some(\n    (file) =>\n      file.text.includes(`closes-gap: ${gapId}`) &&\n      /\\b(?:test|it)\\s*\\(/.test(file.text) &&\n      file.text.includes('expect('),\n  );\n\nexport const KNOWN_GAPS: readonly KnownGap[] = [\n  {\n    id: 'restart-durability',\n    spec: '§14.5',\n    ticket: 'FE-1396',\n    gap: 'The capture store survives restart (proven in the ticket-13 prototype), but conversation-store durability with a real db.ts has never been driven across a restart.',\n    closes:\n      'A test under apps/dev/test that boots the dev app, holds a conversation, restarts the process, and resumes the same conversation id — citing `closes-gap: <this id>`.',\n    closed: () => closedByTest('apps/dev/test', 'restart-durability'),\n  },\n  {\n    id: 'compaction-vs-durable-history',\n    spec: '§9.7, §14.5',\n    ticket: 'FE-1386',\n    gap: 'No session has been driven across a compaction boundary, so whether Flue compaction leaves the durable entry projection intact is unverified — and evidence pointers bind to that projection.',\n    closes:\n      'A test under packages/binding-flue/test driving a session past compaction and asserting every capture’s evidence pointer still resolves through the session-log archive — citing `closes-gap: <this id>`.',\n    closed: () => closedByTest('packages/binding-flue/test', 'compaction-vs-durable-history'),\n  },\n  {\n    id: 'history-projection-paging',\n    spec: '§14.5',\n    ticket: 'FE-1391',\n    gap: 'The durable-history projection is read over self-HTTP; paging past ~1000 entries and binding base-URL discovery are both untested.',\n    closes:\n      'The binding’s history reader covering a paged projection, tested under packages/binding-flue/test — citing `closes-gap: <this id>`.',\n    closed: () => closedByTest('packages/binding-flue/test', 'history-projection-paging'),\n  },\n  {\n    id: 'interpretation-render-plugin-seam',\n    spec: '§7.6, §14.5',\n    ticket: 'FE-1394',\n    gap: 'The plugin-supplied renderer seam for the interpretation render has never been exercised, because no real pack exists yet.',\n    closes: 'A plugin supplying a renderer definition typed against its own payload shapes.',\n    closed: () => {\n      // Not a filename check: the seam is exercised once the plugin's source\n      // exports a renderer, wherever that export lives — and an empty file at\n      // a guessed path exports nothing.\n      const plugin = workspacePackages().find((pkg) => pkg.name === '@brunch/plugin-gherkin');\n      return (\n        plugin !== undefined &&\n        sourceFiles(plugin).some((file) =>\n          /export\\s+(?:const|function|class)\\s+\\w*[Rr]enderer/.test(file.text),\n        )\n      );\n    },\n  },\n];\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-0346wblhIcclqrKPea7ip0`

```
{
  "output": "// hermetic-substrate-test: faux-provider\nimport {\n  fauxAssistantMessage,\n  fauxProvider,\n  fauxToolCall,\n  type Context,\n} from '@earendil-works/pi-ai';\nimport { toolName } from '@brunch/core';\nimport { createFlueClient } from '@flue/sdk';\nimport { start } from '@flue/runtime/node';\nimport app from '../src/app.ts';\nimport { GherkinElicitor } from '../src/agents/gherkin-elicitor.ts';\nimport { GHERKIN_AGENT_ROUTE } from '../src/routes.ts';\n\nconst ask = toolName('ask');\nconst faux = fauxProvider({\n  provider: 'anthropic',\n  models: [{ id: 'claude-haiku-4-5' }],\n});\n\nlet replyContext: Context | undefined;\nfaux.setResponses([\n  fauxAssistantMessage(\n    [fauxToolCall(ask, { question: 'What outcome should the scenario describe?' })],\n    { stopReason: 'toolUse' },\n  ),\n  (context) => {\n    replyContext = context;\n    return fauxAssistantMessage([fauxToolCall(ask, { question: 'Who initiates that outcome?' })], {\n      stopReason: 'toolUse',\n    });\n  },\n  fauxAssistantMessage(\n    [\n      fauxToolCall(ask, { question: 'What happens first?' }),\n      fauxToolCall(ask, { question: 'What happens second?' }),\n    ],\n    { stopReason: 'toolUse' },\n  ),\n  fauxAssistantMessage('Waiting for the accepted question to be answered.'),\n]);\n\nconst flue = await start({\n  agents: [GherkinElicitor],\n  providers: [faux.provider],\n});\n\ntry {\n  const fetchApp = ((input: RequestInfo | URL, init?: RequestInit) =>\n    Promise.resolve(\n      app.fetch(input instanceof Request ? input : new Request(input, init)),\n    )) as typeof fetch;\n  const conversationId = `walking-skeleton-${crypto.randomUUID()}`;\n  const client = createFlueClient({\n    url: `http://brunch.test/agents/${GHERKIN_AGENT_ROUTE}/${conversationId}`,\n    fetch: fetchApp,\n  });\n\n  const kickoff = await client.send({\n    message: { kind: 'user', body: 'Begin the interview.' },\n    initialData: { targetDocumentId: 'walking-skeleton-test' },\n  });\n  await client.wait(kickoff);\n\n  const firstHistory = await client.history();\n  const firstParts = firstHistory.messages.flatMap((message) => message.parts);\n  const firstAsk = firstParts.find(\n    (part) =>\n      part.type === 'dynamic-tool' && part.toolName === ask && part.state === 'output-available',\n  );\n  const firstAskOutput =\n    firstAsk?.type === 'dynamic-tool' && firstAsk.state === 'output-available'\n      ? firstAsk.output\n      : undefined;\n\n  const answer = await client.send({\n    message: { kind: 'user', body: 'A shopper completes checkout.' },\n  });\n  await client.wait(answer);\n\n  const secondAnswer = await client.send({\n    message: { kind: 'user', body: 'The shopper initiates it.' },\n  });\n  await client.wait(secondAnswer);\n\n  const history = await client.history();\n  const finalAssistant = [...history.messages]\n    .reverse()\n    .find((message) => message.role === 'assistant');\n  const finalAskParts =\n    finalAssistant?.parts.filter((part) => part.type === 'dynamic-tool' && part.toolName === ask) ??\n    [];\n\n  console.log(\n    `WALKING_SKELETON_RESULT ${JSON.stringify({\n      boundReplyReachedModel:\n        JSON.stringify(replyContext).includes('A shopper completes checkout.') &&\n        JSON.stringify(replyContext).includes('affordance-reply-bound'),\n      durableOutput:\n        JSON.stringify(firstAskOutput).includes('What outcome should the scenario describe?') &&\n        JSON.stringify(firstAskOutput).includes('\"form\":\"free-text\"'),\n      markdownFloor: firstParts.some(\n        (part) =>\n          part.type === 'data-affordance' &&\n          JSON.stringify(part.data).includes('What outcome should the scenario describe?'),\n      ),\n      noInstructionWake: !JSON.stringify(history.messages)\n        .toLowerCase()\n        .includes('instructions updated'),\n      secondAskRejected:\n        finalAskParts.filter(\n          (part) => part.type === 'dynamic-tool' && part.state === 'output-available',\n        ).length === 1 &&\n        finalAskParts.filter(\n          (part) => part.type === 'dynamic-tool' && part.state === 'output-error',\n        ).length === 1,\n    })}`,\n  );\n} finally {\n  await flue.stop();\n}\n\n--- build artifact test ---\n/**\n * What the build actually emitted — checked against the artifact, not the source.\n *\n * `test/boundaries.test.ts` catches a misplaced `'use agent'` directive by\n * reading the source. This checks the same property from the other end: that\n * the agent really is registered in the emitted bundle. The distinction earns\n * its keep because the failure mode here is silent — `@flue/vite` drops a\n * module that stops looking like an agent module and the build stays green, so\n * \"it compiled\" says nothing about whether the app has any agents in it.\n *\n * Any future change that quietly stops an agent, its route, or the conversation\n * store from reaching the bundle fails here, whatever the cause: a directive\n * moved, a config path changed, an entry dropped from the scan glob.\n */\n\nimport { beforeAll, describe, expect, test } from 'bun:test';\nimport { existsSync, readdirSync, readFileSync } from 'node:fs';\nimport { join } from 'node:path';\nimport {\n  agentModules,\n  MODEL_KEY_NAME,\n  pinnedIdentities,\n  REPO_ROOT,\n  workspacePackages,\n} from './workspace.ts';\n\nconst DEV_APP = join(REPO_ROOT, 'apps/dev');\nconst DIST = join(DEV_APP, 'dist');\nconst CLIENT = join(DIST, 'client');\n\n/** Everything the server build emitted, concatenated. */\nlet bundle = '';\n\nbeforeAll(async () => {\n  // Build here rather than depending on a prior `bun run build`, so `bun test`\n  // alone is a complete signal and CI ordering cannot make this vacuous. The\n  // *root* build, not the dev app's own: CI has no separate Build step, so\n  // this is where every workspace package's build script gets exercised —\n  // building only apps/dev would let the next package's broken build merge\n  // green.\n  const built = Bun.spawnSync(['bun', 'run', 'build'], {\n    cwd: REPO_ROOT,\n    env: { ...process.env, NODE_ENV: 'production' },\n  });\n  if (built.exitCode !== 0) {\n    throw new Error(\n      `workspace build failed:\\n${built.stdout.toString()}\\n${built.stderr.toString()}`,\n    );\n  }\n  bundle = readdirSync(DIST)\n    .filter((entry) => entry.endsWith('.mjs'))\n    .map((entry) => readFileSync(join(DIST, entry), 'utf8'))\n    .join('\\n');\n});\n\n/** The pinned identity of every agent module in the dev app, read from source. */\nfunction declaredAgentIdentities(): string[] {\n  const dev = workspacePackages().find((pkg) => pkg.relPath === 'apps/dev')!;\n  return agentModules(dev).flatMap(pinnedIdentities);\n}\n\ndescribe('the emitted server bundle', () => {\n  test('exists', () => {\n    expect(existsSync(DIST)).toBe(true);\n    expect(bundle.length).toBeGreaterThan(0);\n  });\n\n  test('registers every declared agent under its pinned identity', () => {\n    // The check that matters. A `'use agent'` directive that is not the first\n    // statement builds green and simply never registers — the app boots with no\n    // agents and nothing says so until a conversation fails to start.\n    //\n    // Asserted against the emitted `__flueBindAgentModule(Fn, { identity })`\n    // call rather than the bare string, because the string survives that\n    // failure: the `agentName` assignment is still in the bundle as ordinary\n    // dead code once the module stops being scanned as an agent.\n    const bound = new Set(\n      [...bundle.matchAll(/__flueBindAgentModule\\([^)]*identity:\\s*[\"']([^\"']+)[\"']/g)].map(\n        (match) => match[1]!,\n      ),\n    );\n    const identities = declaredAgentIdentities();\n    expect(identities.length).toBeGreaterThan(0);\n    for (const identity of identities) {\n      expect({ identity, bound: bound.has(identity) }).toEqual({ identity, bound: true });\n    }\n  });\n\n  test('mounts the agent router and wires the conversation store', () => {\n    // Without db.ts reaching the bundle, conversations are process-memory and a\n    // restart loses them — a difference invisible until something restarts.\n    //\n    // Witnessed by strings that exist only in the app's own modules. The\n    // obvious witnesses are vacuous: `createAgentRouter` survives in a\n    // bootstrap JSDoc comment and `sqlite` in the bootstrap's unconditional\n    // default-adapter fallback, so both match even when the mount or db.ts\n    // never reach the bundle. (Bare `/agents/` is no better — a bundler\n    // region comment for `src/agents/` carries it.)\n    expect(bundle).toContain('route(`/agents/'); // app.ts's mount call\n    expect(bundle).toContain('BRUNCH_DEV_DB_PATH'); // db.ts's env override\n    expect(bundle).toContain('.data-wipe-me'); // db.ts's default store path\n  });\n\n  test('carries no model key', () => {\n    const modelKey = new RegExp(`${MODEL_KEY_NAME}\\\\s*[:=]\\\\s*['\"][^'\"]+['\"]`);\n    expect(bundle).not.toMatch(modelKey);\n  });\n});\n\ndescribe('the emitted client bundle', () => {\n  // `@flue/vite` emits the server environment only, so the ui tree is built by\n  // a second plain vite config. Without these, a client-side break would be\n  // invisible to CI — the Flue build would go green having never transformed a\n  // line of it.\n  test('emits html and a bundled entry', () => {\n    expect(existsSync(join(CLIENT, 'index.html'))).toBe(true);\n    expect(existsSync(join(CLIENT, 'assets/index.js'))).toBe(true);\n  });\n\n  test('the emitted html points at the built asset, not at source', () => {\n    // The failure this catches: shipping the source index.html, whose script\n    // tag names a .tsx module nothing serves in production.\n    const html = readFileSync(join(CLIENT, 'index.html'), 'utf8');\n    expect(html).toContain('/assets/index.js');\n    expect(html).not.toContain('.tsx');\n  });\n\n  test('the entry really bundled its dependencies', () => {\n    // A near-empty chunk would mean the entry resolved to nothing.\n    const entry = readFileSync(join(CLIENT, 'assets/index.js'), 'utf8');\n    expect(entry.length).toBeGreaterThan(10_000);\n  });\n});\n\n// The production asset route is tested in `apps/dev/test/assets.test.ts`,\n// against the handler module directly: the emitted server bundle targets\n// node (`node:sqlite`), so it cannot be imported and driven under `bun test`.\n\n--- CI ---\n# The CI smoke (spec §12.5): `vite build` plus the simulation suite — no model\n# key, no substrate, no flake. An optional secret-gated real-model `flue run`\n# smoke is named in the spec and deliberately absent until a provider key\n# exists; the suite asserts that it has not drifted in.\nname: CI\n\non:\n  push:\n    branches: [main]\n  pull_request:\n\njobs:\n  smoke:\n    runs-on: ubuntu-latest\n    steps:\n      # Full-SHA pins: org policy refuses tag-pinned actions (the job fails at\n      # setup before any step runs). Comments carry the tag each SHA matched.\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n\n      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2\n        with:\n          bun-version: '1.3.14'\n\n      - uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4\n        with:\n          path: ~/.bun/install/cache\n          key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}\n          restore-keys: ${{ runner.os }}-bun-\n\n      - run: bun install --frozen-lockfile\n\n      - name: Lint\n        run: bun run lint:check\n\n      - name: Formatting\n        run: bun run fmt:check\n\n      - name: Typecheck\n        run: bun run typecheck\n\n      # Reads the repository tree and the harness contract; touches no model\n      # and no substrate. Three suites, with different jobs: boundaries makes\n      # the spec §4/§12.2 invariants enforceable rather than aspirational;\n      # build-artifact checks what was actually emitted, because a Flue build\n      # that silently drops an agent still exits 0; known-gaps keeps the spec\n      # §14.5 open items visible and goes red when one closes unremarked.\n      #\n      # The build gate lives inside this step: build-artifact's beforeAll\n      # runs the full build (Flue server environment plus the plain client\n      # build that @flue/vite does not do) so that `bun test` alone is a\n      # complete signal. A separate Build step would build the app a second\n      # time for no additional coverage.\n      - name: Test\n        run: bun test\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-0346wblkuA634jFxIvG1kG`

```
{
  "output": "## ln/fe-1390-capture-store...origin/ln/fe-1390-capture-store\n\n--- recent ADR titles ---\ndocs/planning/elicitation-kernel/spec.md:1:# Elicitation Kernel — Specification\ndocs/planning/elicitation-kernel/spec.md:3:Status: draft for review\ndocs/planning/elicitation-kernel/spec.md:15:## 1. Purpose\ndocs/planning/elicitation-kernel/spec.md:32:## 2. Non-goals and seams\ndocs/planning/elicitation-kernel/spec.md:48:## 3. Vocabulary\ndocs/planning/elicitation-kernel/spec.md:65:## 4. Architecture: four shells and a binding\ndocs/planning/elicitation-kernel/spec.md:91:## 5. The capture envelope\ndocs/planning/elicitation-kernel/spec.md:137:### 5.1 Absence states\ndocs/planning/elicitation-kernel/spec.md:178:## 6. Operations, validation strata, issues\ndocs/planning/elicitation-kernel/spec.md:180:### 6.1 Plugin operations\ndocs/planning/elicitation-kernel/spec.md:203:### 6.2 Two validation strata\ndocs/planning/elicitation-kernel/spec.md:218:### 6.3 Issues vs. advisories\ndocs/planning/elicitation-kernel/spec.md:231:### 6.4 Operation cadence is orchestration policy\ndocs/planning/elicitation-kernel/spec.md:239:## 7. Questioning-UX contract\ndocs/planning/elicitation-kernel/spec.md:241:### 7.1 No exchange-pair ontology\ndocs/planning/elicitation-kernel/spec.md:249:### 7.2 Baseline forms and the markdown floor\ndocs/planning/elicitation-kernel/spec.md:262:### 7.3 One live affordance (adjudicated, C6)\ndocs/planning/elicitation-kernel/spec.md:277:### 7.4 Turn suspension, reply binding, and the wake wart (adjudicated, C7)\ndocs/planning/elicitation-kernel/spec.md:299:### 7.5 Transport outcomes (adjudicated, L9)\ndocs/planning/elicitation-kernel/spec.md:307:### 7.6 Interpretation render\ndocs/planning/elicitation-kernel/spec.md:315:### 7.7 Recorded transport facts (Flue)\ndocs/planning/elicitation-kernel/spec.md:324:## 8. Capture mechanics: settlement, sweep, supersession\ndocs/planning/elicitation-kernel/spec.md:326:### 8.1 Settlement: trigger and judgment\ndocs/planning/elicitation-kernel/spec.md:338:### 8.2 Harness-resolved evidence anchoring\ndocs/planning/elicitation-kernel/spec.md:347:### 8.3 Sweep idempotence\ndocs/planning/elicitation-kernel/spec.md:356:### 8.4 Supersession: single-hop, two channels\ndocs/planning/elicitation-kernel/spec.md:368:### 8.5 Resolution records\ndocs/planning/elicitation-kernel/spec.md:374:### 8.6 Unaccounted-ask advisory\ndocs/planning/elicitation-kernel/spec.md:381:### 8.7 Resume-time sweep reconciliation\ndocs/planning/elicitation-kernel/spec.md:387:## 9. Sessions, durability, and the storage port\ndocs/planning/elicitation-kernel/spec.md:389:### 9.1 Durable target-document, transient sessions, sweep as the only bridge\ndocs/planning/elicitation-kernel/spec.md:407:### 9.2 Per-session state and concurrency\ndocs/planning/elicitation-kernel/spec.md:420:### 9.3 Re-entry briefing\ndocs/planning/elicitation-kernel/spec.md:431:### 9.4 Provenance: only the true user's side is evidence\ndocs/planning/elicitation-kernel/spec.md:441:### 9.5 Completion is derived, never a gate\ndocs/planning/elicitation-kernel/spec.md:448:### 9.6 The storage port (adjudicated, C1)\ndocs/planning/elicitation-kernel/spec.md:473:### 9.7 Context compaction vs. the durable log\ndocs/planning/elicitation-kernel/spec.md:499:## 10. The substrate-capability list\ndocs/planning/elicitation-kernel/spec.md:530:## 11. Plugins and packs\ndocs/planning/elicitation-kernel/spec.md:532:### 11.1 What a plugin owns\ndocs/planning/elicitation-kernel/spec.md:542:### 11.2 Pack form and Principle v2\ndocs/planning/elicitation-kernel/spec.md:553:### 11.3 The smallest honest plugin\ndocs/planning/elicitation-kernel/spec.md:560:### 11.4 Pattern guidance (inherited from brunch, as patterns not mechanism)\ndocs/planning/elicitation-kernel/spec.md:568:### 11.5 Generic strategy cards (named, not designed)\ndocs/planning/elicitation-kernel/spec.md:589:## 12. Shipping shape\ndocs/planning/elicitation-kernel/spec.md:591:### 12.1 Root\ndocs/planning/elicitation-kernel/spec.md:599:### 12.2 Package topology (intended structure; nothing scaffolded during the map)\ndocs/planning/elicitation-kernel/spec.md:624:### 12.3 Naming & tool namespacing\ndocs/planning/elicitation-kernel/spec.md:632:### 12.4 Schemas and the SDK\ndocs/planning/elicitation-kernel/spec.md:642:### 12.5 Dev app, deploy, remote parity\ndocs/planning/elicitation-kernel/spec.md:659:### 12.6 Version axes (named, none implemented)\ndocs/planning/elicitation-kernel/spec.md:665:## 13. Dev targets and milestone one\ndocs/planning/elicitation-kernel/spec.md:674:### 13.1 Gherkin (milestone one)\ndocs/planning/elicitation-kernel/spec.md:680:### 13.2 The assurance argument\ndocs/planning/elicitation-kernel/spec.md:700:### 13.3 Derived labels, the ledger, and the validator's honest stance\ndocs/planning/elicitation-kernel/spec.md:718:## 14. Acceptance material\ndocs/planning/elicitation-kernel/spec.md:720:### 14.1 The ten harness invariants (restated in envelope vocabulary; enforced as test properties)\ndocs/planning/elicitation-kernel/spec.md:740:### 14.2 The five proof obligations (contract acceptance criteria)\ndocs/planning/elicitation-kernel/spec.md:748:### 14.3 Gating tests and review vocabulary\ndocs/planning/elicitation-kernel/spec.md:757:### 14.4 Testing strategy\ndocs/planning/elicitation-kernel/spec.md:777:### 14.5 Open verification items (named, with homes)\ndocs/planning/elicitation-kernel/spec.md:793:## Appendix A — Adjudications\ndocs/adr/0001-brunch-is-the-product-name.md:1:# ADR-0001: `brunch` is the product name, and it may appear in structure\ndocs/adr/0001-brunch-is-the-product-name.md:4:Status: accepted\ndocs/adr/0001-brunch-is-the-product-name.md:8:## Context\ndocs/adr/0001-brunch-is-the-product-name.md:32:## Decision\ndocs/adr/0001-brunch-is-the-product-name.md:51:## Why the agent identity carries the product prefix\ndocs/adr/0001-brunch-is-the-product-name.md:65:## Consequences\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n \"BRUNCH_DEV_DB_PATH|sqlite\\(|db\\.ts|dbPath\" apps/dev packages test -g '*.ts' -g '*.json' && printf '\\n--- files ---\\n' && rg --files apps/dev | sort",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '380,530p' docs/planning/elicitation-kernel/spec.md && sed -n '720,792p' docs/planning/elicitation-kernel/spec.md && printf '\\n--- boundaries ---\\n' && sed -n '1,220p' test/boundaries.test.ts",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/guide/database/",
  "objective": "Extract current Flue Node database adapter setup, supported stores, schema/migration ownership, deployment topology, and limits relevant to converting this project's local SQLite persistence into production persistence.",
  "forceRefetch": true
}
```

**Tool Use:** `read_web_page`

```json
{
  "url": "https://flueframework.com/docs/guide/deploy/",
  "objective": "Extract Flue's framework-level deployment decision tree and target tradeoffs, especially Node vs Cloudflare and constraints that matter to this project's current Node app.",
  "forceRefetch": true
}
```

## User

**Tool Result:** `TU-0346wc1p3MauwgskU7O6CJ`

```
{
  "output": "test/boundaries.test.ts:342:    // `db.ts` — Flue's build-time scan makes shipping a pre-registered agent\ntest/boundaries.test.ts:344:    for (const file of ['src/app.ts', 'src/db.ts']) {\napps/dev/src/db.ts:18:export default sqlite(conversationDbPath());\ntest/known-gaps.ts:68:    gap: 'The capture store survives restart (proven in the ticket-13 prototype), but conversation-store durability with a real db.ts has never been driven across a restart.',\napps/dev/src/db-path.ts:7: * the exact restart-durability failure `db.ts` exists to prevent. From `src/`\napps/dev/src/db-path.ts:11: * Kept apart from `db.ts` so it stays importable under `bun test`: the\napps/dev/src/db-path.ts:19:  // '' through to sqlite(), which opens an anonymous temporary database\napps/dev/src/db-path.ts:21:  const override = process.env.BRUNCH_DEV_DB_PATH;\ntest/build-artifact.test.ts:90:    // Without db.ts reaching the bundle, conversations are process-memory and a\ntest/build-artifact.test.ts:96:    // default-adapter fallback, so both match even when the mount or db.ts\ntest/build-artifact.test.ts:100:    expect(bundle).toContain('BRUNCH_DEV_DB_PATH'); // db.ts's env override\ntest/build-artifact.test.ts:101:    expect(bundle).toContain('.data-wipe-me'); // db.ts's default store path\napps/dev/test/db-path.test.ts:8: * Tested against `db-path.ts` rather than `db.ts`, because the adapter module\napps/dev/test/db-path.test.ts:23:  const originalOverride = process.env.BRUNCH_DEV_DB_PATH;\napps/dev/test/db-path.test.ts:27:    if (originalOverride === undefined) delete process.env.BRUNCH_DEV_DB_PATH;\napps/dev/test/db-path.test.ts:28:    else process.env.BRUNCH_DEV_DB_PATH = originalOverride;\napps/dev/test/db-path.test.ts:32:    delete process.env.BRUNCH_DEV_DB_PATH;\napps/dev/test/db-path.test.ts:43:    process.env.BRUNCH_DEV_DB_PATH = './relative/on-purpose.db';\napps/dev/test/db-path.test.ts:48:    // sqlite('') would open an anonymous temporary database deleted on close\napps/dev/test/db-path.test.ts:50:    process.env.BRUNCH_DEV_DB_PATH = '';\n\n--- files ---\napps/dev/flue.config.ts\napps/dev/index.html\napps/dev/package.json\napps/dev/src/agents/gherkin-elicitor.ts\napps/dev/src/app.ts\napps/dev/src/assets.ts\napps/dev/src/db-path.ts\napps/dev/src/db.ts\napps/dev/src/routes.ts\napps/dev/src/ui/chat.tsx\napps/dev/src/ui/main.tsx\napps/dev/src/ui/styles.css\napps/dev/test/assets.test.ts\napps/dev/test/db-path.test.ts\napps/dev/test/walking-skeleton.integration.ts\napps/dev/test/walking-skeleton.test.ts\napps/dev/vite.client.config.ts\napps/dev/vite.config.ts\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-0346wc1qW3vv33A67vRyQU`

````
{
  "output": "\n### 8.7 Resume-time sweep reconciliation\n\nA session ending between settlement judgment and sweep leaves an unswept tail — a computable fact\n(entries above the high-water mark). On resume the harness surfaces it as an advisory (inside the\nre-entry briefing, §9.3) and the agent judges whether to sweep before proceeding.\n\n## 9. Sessions, durability, and the storage port\n\n### 9.1 Durable target-document, transient sessions, sweep as the only bridge\n\n- **Target-document** = one target-domain + its capture store + its session history. Its\n  authoritative state is **the capture store plus all session logs — never the render**.\n  Projections, renders, and artifacts are strictly derived: cacheable, disposable. Session logs\n  are durable truth too: discarding swept logs would dead-end every capture's evidence pointers.\n  **Conversations are themselves documents** (amended on review 2026-08-11): each session log is\n  kept as reference, indefinitely, and lives **with** the target-document in the same persistence\n  home — the storage port's session-log archive (§9.6) — so evidence pointers resolve against\n  the target-document's own store, never against whatever the substrate happens to retain.\n- **Session** = one substrate conversation. Sessions **never formally close** — they go quiet and\n  stay resumable; \"ended\" would be a fiction the harness cannot verify.\n- **Session→document binding** (adjudicated, L4): a new session's `initialData` carries the\n  target-document id (validated once at creation, immutable — Flue's own lane for a target\n  descriptor). Dispatching to an existing conversation id resumes that session against the current\n  state of its target-document; a new id opens a new session against the named document. Plugin\n  choice is conversation-lifetime-immutable for the same reason.\n\n### 9.2 Per-session state and concurrency\n\nStrictly per-session state is **exactly three things**: the evidence log, the swept high-water\nmark, the pending-affordance slot. (The private scratchpad is *not* session state — pattern\nguidance only; its natural Flue home is the `harness.prompt` scratch conversation, §11.4.)\n\nConcurrency is **interleaved-only** for milestone one: the store is serialized (sweeps validate\nand apply atomically — a transactional guarantee, not a session lock); staleness is optimistic —\nthe single-hop supersession refusal doubles as the stale-session guard, and the refusal carries\nthe world-moved facts. Refusal granularity is **whole-sweep atomic**; re-proposing is cheap once\nthe advisory is digested. No locking, no merge, no sync events; true simultaneous-sweep\ncoordination stays fog until a real concurrent consumer appears.\n\n### 9.3 Re-entry briefing\n\nWhen a session resumes after the world moved, the harness injects a **state message** on the\nuser's behalf (Pi's custom-entry convention; on Flue, a typed `kind: 'signal'` entry). Content is\ncomputed facts only: unswept tail, world-moved delta (captures created/superseded and issues\nopened/closed since this session's last sweep; anchor = session start if it never swept), open\nissues, pending unanswered affordance. Advisory-only — the agent weighs; nothing is forced. A\n**minimal user-visible insertion notice** accompanies every injected state message. Ticket 13\nproved the briefing in all three shapes (fresh, resumed, post-restart) and observed it produce\nunscripted conversational conflict-surfacing.\n\n### 9.4 Provenance: only the true user's side is evidence\n\nThe data model **distinguishes true user entries from injected on-behalf-of-user entries**.\nCapture evidence spans anchor only on true user (and user-affordance-payload) entries; injected\nbriefings live in the log honestly but are **never citable as capture evidence** — and on Flue\nthis is mechanically enforced, since signals appear structurally non-user in the entry projection\n(a capture citing an injected entry is refused at validation). Reconciliation with harness invariant 1 (Appendix A,\nC5): user-derived captures cite user entries; `defaulted` / `external-lookup` captures cite a\ndeclared default or documented transformation instead.\n\n### 9.5 Completion is derived, never a gate\n\nA target-document has no lock and no terminal state: completion-contract satisfaction is a\nread-time derived status (§5's derived-status family). A user returning with a correction after\n\"done\" is the motivating story. Semantic completeness and representation completeness remain\nseparate assessments; each issue records its origin.\n\n### 9.6 The storage port (adjudicated, C1)\n\n**The storage port is harness-defined and binding-implemented; plugins are storage-blind.** The\nharness defines the port's contract (the capture-store operations and their envelope invariants,\nenforced as store-level refusals); the binding implements it for its deploy target; the plugin\nnever touches persistence. Reconciliation with the shipping-shape's \"host-owned storage\": the\nsubstrate's *conversation* storage (Flue's `db.ts`) stays host-authored because Flue requires it\nof the consuming app; the harness's *capture store* is the storage port, implemented in\n`packages/binding-flue` (and any future binding). The remote-parity constraint reads accordingly: the\nstorage port is owned **outside the plugin** (§12.5).\n\n**The port's scope is the capture store plus the session-log archive** (amended on review\n2026-08-11): session logs attached to a target-document live with it, retained indefinitely.\nThe mechanism is **archive-on-read** — whenever the binding reads the durable entry projection\n(every sweep, every briefing computation), it retains the entries it read in the\ntarget-document store. At minimum, every entry a capture points to must be retrievable from the\narchive forever; the substrate's conversation store remains the live transport copy, never the\nprovenance record.\n\n**Milestone-one local store**: binding-owned; the format is binding-internal **but constrained** —\nit must provide whole-sweep-atomic application and refusals with serialized writes (adjudicated,\nL13; a flat append-only text file does not qualify unaided). The ticket-13 skeleton's shape (JSON\nfile, tmp+rename atomic, in-process serialization) is the proven floor; it holds the session-log\narchive alongside captures, issues, and events.\n\n### 9.7 Context compaction vs. the durable log\n\nPi-family substrates compact long transcripts, with custom compaction definitions controlling\nwhich entry kinds survive in the context the model re-reads — ordinary user and agent messages\nare normally summarized away. This never touches the spec's durability claims, **provided one\nconstraint holds, stated here as part of the storage contract**:\n\n- **Compaction may shrink what the model re-reads, never what the store can resolve.** Evidence\n  pointers and the sweep machinery bind to the **durable entry projection** (capability 8, §10),\n  not to the model's context window. A binding must guarantee the durable projection is\n  compaction-independent; a substrate whose compaction prunes durable history is a substrate whose\n  binding must preserve the pruned entries itself (binding absorption, as with capability 10).\n  The session-log archive (§9.6) is that preservation mechanism, already in place: compaction\n  cannot remove anything the archive holds.\n- Two existing mechanisms already cushion the model-side loss: **excerpt-primary evidence spans**\n  (§5) keep every capture citable and self-contained even where durable access degrades, and the\n  **re-entry briefing** (§9.3) already treats \"the model no longer remembers\" as a normal state —\n  a compacted session is informationally a resumed one. Per-session harness state (high-water\n  mark, pending-affordance slot) lives outside the transcript and cannot be compacted away.\n- If a binding supplies a compaction definition, injected signals and affordance tool parts need\n  no protected status: briefings are recomputable facts and affordance identity is durable on\n  tool output parts — only true user entries are irreplaceable, and the archive holds those.\n\nWhether Flue's compaction (if and as it ships one) preserves the durable-history projection\nunmodified is **unverified** — named in §14.5.\n\n## 10. The substrate-capability list\n\nThe core/binding seam, the portability pressure test, and the early-smell detector: porting =\nreimplementing this list; exotic Flue-shaped entries appearing here is the smell. **Ten entries**\n(six from the shipping-shape resolution, four added by the sweep-seam skeleton):\n\n| # | Capability | Flue status |\n|---|---|---|\n| 1 | Register a tool | native (`defineTool`/`useTool`) |\n| 2 | Contribute instructions | native (render return) |\n| 3 | Persist per-conversation state | native (`usePersistentState`, atomic with its unit of work) |\n| 4 | Emit an affordance payload | native (data channel + tool output parts) |\n| 5 | Suspend-for-reply | **absorbed**: no ask primitive; `terminate: true` + pending slot + fresh dispatch (§7.4) |\n| 6 | Private model call | native (`harness.prompt` scratch conversation) |\n| 7 | Subscribe to the would-stop lifecycle seam, with same-response signal steering | native (`useAgentFinish` + `ctx.append`; fires on suspensions — pending guard load-bearing; loop-guarded) |\n| 8 | Read the session's durable entry projection, with provenance-discriminating entry kinds | **binding-absorbed**: no in-process API; public history projection over self-HTTP; `purpose` discriminates provenance |\n| 9 | Inject typed non-user signal entries, same-response and as deliveries | native (`ctx.append` / `dispatch({kind:'signal'})`; projects structurally non-user) |\n| 10 | Provide a transactional durable store outside conversation state | **binding-absorbed** entirely (Flue neither provides nor forbids) |\n\nBinding-size asymmetry is expected, not failure: each binding absorbs what its substrate lacks or\nforbids. Core names operations abstractly; the binding renders substrate tool names.\n\n**Recorded Flue facts the implementation must respect**: `@flue/vite` requires vite ^8 and the\n`'use agent'` directive as the file's first statement; `agentName` must be a string literal and\nmust be pinned (conversation storage keys on it); the dev controller owns the whole request space,\nso the ui is a separate app or app-served assets; tool schemas are Valibot, frozen at module load;\ntool names are globally unique per render with reserved names; prompt-cache economics forbid\nper-question tool swapping (one stable tool set + state-driven instructions); subagents are\nconversationally sterile; non-React hosts build on `@flue/sdk`; without `db.ts` conversations are\nprocess-memory (restart loses them; the capture store survives independently — proven, ticket 13).\n\n## 11. Plugins and packs\n### 14.1 The ten harness invariants (restated in envelope vocabulary; enforced as test properties)\n\n1. **No value without provenance.** Every projected value traces to a capture (with evidence\n   spans), a declared default, or a documented transformation.\n2. **No silent conflict resolution.** Contradictory active captures resolve only via an explicit\n   resolution record or supersession event.\n3. **No silent projection loss.** Relevant active captures that cannot be represented appear in\n   the typed loss report.\n4. **Corrections don't erase history.** Superseded captures remain inspectable and never active.\n5. **Retries are semantically idempotent.** A retried operation or re-swept range never creates a\n   second user assertion (content-keyed capture identity).\n6. **Issues are namespaced to their producer.** A plugin/target-domain requirement never silently\n   becomes a harness-level requirement; harness envelope issues are namespaced to the harness.\n7. **Plugin failures are atomic.** A failed operation leaves no partially applied deltas; sweeps\n   apply whole or refuse whole.\n8. **Equivalent state produces equivalent projection.** Projection is a function of the\n   capture-store snapshot, never of discovery order.\n9. **Unknown remains distinct from false.** Absence states never collapse to null or negation.\n10. **Explicit remains distinct from inferred and defaulted.** Epistemic status never collapses.\n\n### 14.2 The five proof obligations (contract acceptance criteria)\n\nIndependent variability · semantic conservation · explicit transformation · controlled elicitation\n· local implementation — judged as in the criteria doc, against the hourglass. Companion tests:\n**smallest-honest-plugin** (every contract addition checked against the bar it raises) and its\nsibling the **second-binding test** (every time mechanism wants to land in the binding: \"genuinely\nsubstrate-specific, or mechanism leaking into Flue's dialect?\").\n\n### 14.3 Gating tests and review vocabulary\n\nGating: **reprojection / projector substitution** (capture once, project into materially different\ntargets, verify agreement); **minimal pairs** (\"the budget is / might be €20,000\"); **black-box\nauthoring** (public SDK + docs to a developer who hasn't read core; count concepts, boilerplate,\nescape hatches). Review vocabulary (named smells): opaque payload waist, giant context bag,\nschema-shaped questioning, null collapse, silent coercion/loss, correction-as-duplication, hidden\ntarget leakage.\n\n### 14.4 Testing strategy\n\n**Generation-first fixtures over a deterministic replay driver**; everything runs in plain\n`bun test` — no model, no substrate. Hand-written fixtures are seeds; the corpus is generated:\n\n- Properties come from the **harness contract** — the ten invariants above are literally\n  properties; generators come from the **plugin's declarations**, never its implementation\n  (`arbitraryFromSchema`: Valibot → fast-check arbitraries), plus negative-space properties for\n  plugin code (validators total — never throw, always typed issues; `project` never emits an\n  undeclared loss category).\n- Where dynamics are the subject: **model-based command-sequence testing** (`fc.commands`) over\n  the envelope-derived alphabet — utter · settle-range · sweep · correct · contradict ·\n  reply-with-absence · redirect.\n- Language realism: a **model as offline generator, never CI oracle** — a model plays respondent\n  against the plugin's own kernel cards, varied by persona/curveball, plus a mutation library\n  generalizing minimal pairs (epistemic-status flips, absence injections, supersession\n  injections). Outputs freeze as replayable fixtures; **regenerate when declarations change**.\n- Shrunk counterexamples are minimal pathological conversations: pinned as regressions and read\n  first as type-design feedback on envelope/payload types.\n\n### 14.5 Open verification items (named, with homes)\n\n- **Interpretation-render plugin-renderer seam** — exercised once real packs exist (milestone-one\n  build, both plugins).\n- **Restart durability of the full stack** — the capture store survives restart (proven, ticket\n  13); conversation-store durability with a real `db.ts` is untested (milestone-one dev app).\n- **Wake-wart residue** — §7.4's no-interpolation ruling removes the cause observed in ticket 10;\n  confirm no other instruction-state write path re-triggers advisory wakes (milestone-one binding).\n- **History-projection paging** (>1000 entries) and binding base-URL discovery — binding\n  implementation details flagged by ticket 13.\n- **Compaction vs. durable history** (§9.7) — verify that Pi/Flue compaction leaves the durable\n  entry projection unmodified (or scope what the binding must preserve itself); no prototype has\n  driven a session across a compaction boundary (milestone-one binding).\n\n---\n\n\n--- boundaries ---\n/**\n * The architectural boundaries, as tests rather than as documentation.\n *\n * Spec §4 and §12.2 state the dependency direction as invariants; an invariant\n * nobody can run is a wish. These are the mechanical checks — they read the\n * real tree, so a package added later is governed without opting in.\n *\n * Two of them are load-bearing beyond tidiness, because the Flue build is\n * silent about the failure: a `'use agent'` directive that is not the file's\n * first statement builds green and simply never registers the agent.\n */\n\nimport { describe, expect, test } from 'bun:test';\nimport { readFileSync } from 'node:fs';\nimport { join } from 'node:path';\nimport {\n  AGENT_DIRECTIVE_STATEMENT,\n  agentModules,\n  allDependencies,\n  filesIn,\n  importedPackages,\n  MODEL_KEY_NAME,\n  packageOf,\n  pinnedIdentities,\n  REPO_ROOT,\n  sourceFiles,\n  testFiles,\n  workspacePackages,\n  type WorkspacePackage,\n} from './workspace.ts';\n\nconst PACKAGES = workspacePackages();\n\nconst CORE = '@brunch/core';\n/** Any substrate package. The harness may never name one; a binding must. */\nconst SUBSTRATE_SCOPES = ['@flue/', '@earendil-works/'];\n\nconst isSubstrate = (name: string): boolean =>\n  SUBSTRATE_SCOPES.some((scope) => name.startsWith(scope));\nconst byRole = (role: string): WorkspacePackage[] =>\n  PACKAGES.filter((pkg) => pkg.dir.startsWith(`${role}-`));\n\ntest('every workspace package is one the spec topology names', () => {\n  // Derived from the spec's own §12.2 topology block instead of a second\n  // hand-written list here. The spec names *intended* structure — some\n  // entries are not scaffolded yet — so the direction checked is disk ⊆\n  // spec: a package the spec does not name is loud, while an\n  // intended-but-unbuilt one is not a failure. (The old hardcoded equality\n  // would have failed the next legitimate package instead of governing it.)\n  const spec = readFileSync(join(REPO_ROOT, 'docs/planning/elicitation-kernel/spec.md'), 'utf8');\n  const topology = /### 12\\.2[^\\n]*\\n[\\s\\S]*?```\\n([\\s\\S]*?)```/.exec(spec)?.[1];\n  expect(topology).toBeDefined();\n  const named = new Set(\n    [...topology!.matchAll(/^((?:packages|apps)\\/[\\w-]+)(?=\\s|$)/gm)].map((match) => match[1]!),\n  );\n  expect(named.size).toBeGreaterThan(0);\n  for (const pkg of PACKAGES) {\n    expect({ pkg: pkg.relPath, inSpec: named.has(pkg.relPath) }).toEqual({\n      pkg: pkg.relPath,\n      inSpec: true,\n    });\n  }\n});\n\ntest('every package is actually scanned', () => {\n  // Without this, a package the file walker misses passes every file-level\n  // invariant vacuously — the substrate-import ban, the plugin-resolves-core\n  // rule, and the schema-library ban would all iterate an empty list and go\n  // green. A silent exemption is worse than no check at all.\n  for (const pkg of PACKAGES) {\n    expect({ pkg: pkg.relPath, scanned: sourceFiles(pkg).length > 0 }).toEqual({\n      pkg: pkg.relPath,\n      scanned: true,\n    });\n  }\n});\n\ndescribe('role prefixes name what a package is architecturally (spec §12.2)', () => {\n  test('every package under packages/ is core or carries a role prefix', () => {\n    for (const pkg of PACKAGES.filter((p) => p.kind === 'package')) {\n      expect(pkg.dir).toMatch(/^(core|plugin-[a-z0-9-]+|binding-[a-z0-9-]+)$/);\n    }\n  });\n\n  test('no package uses an avoided role noun', () => {\n    // The glossary's own noun is `binding`; `adapter-*` and `wrapper-*` are\n    // avoided terms, and `elicit-*` names function rather than identity.\n    for (const pkg of PACKAGES) {\n      expect(pkg.dir).not.toMatch(/^(adapter|wrapper|elicit)-/);\n    }\n  });\n\n  test('the manifest name matches the role-prefixed directory', () => {\n    for (const pkg of PACKAGES) {\n      expect(pkg.name).toBe(`@brunch/${pkg.dir}`);\n    }\n  });\n});\n\ndescribe('dependency direction (spec §4, §12.2)', () => {\n  test('the harness imports no substrate', () => {\n    const core = PACKAGES.find((pkg) => pkg.name === CORE);\n    expect(core).toBeDefined();\n    expect(allDependencies(core!).filter(isSubstrate)).toEqual([]);\n    for (const file of sourceFiles(core!)) {\n      const substrateImports = importedPackages(file).filter((s) => isSubstrate(packageOf(s)));\n      expect({ file: file.relPath, substrateImports }).toEqual({\n        file: file.relPath,\n        substrateImports: [],\n      });\n    }\n  });\n\n  test('the harness depends on no binding and no plugin', () => {\n    const core = PACKAGES.find((pkg) => pkg.name === CORE)!;\n    for (const dependency of allDependencies(core)) {\n      expect(dependency).not.toMatch(/^@brunch\\/(binding|plugin)-/);\n    }\n  });\n\n  test('plugins resolve core only — never the binding, never Flue', () => {\n    const plugins = byRole('plugin');\n    expect(plugins.length).toBeGreaterThan(0);\n    for (const plugin of plugins) {\n      const workspaceDeps = allDependencies(plugin).filter((d) => d.startsWith('@brunch/'));\n      expect(workspaceDeps).toEqual([CORE]);\n      expect(allDependencies(plugin).filter(isSubstrate)).toEqual([]);\n\n      for (const file of sourceFiles(plugin)) {\n        for (const specifier of importedPackages(file)) {\n          const pkg = packageOf(specifier);\n          expect(isSubstrate(pkg)).toBe(false);\n          if (pkg.startsWith('@brunch/')) expect(pkg).toBe(CORE);\n        }\n      }\n    }\n  });\n\n  test('a binding imports both', () => {\n    const bindings = byRole('binding');\n    expect(bindings.length).toBeGreaterThan(0);\n    for (const binding of bindings) {\n      const deps = allDependencies(binding);\n      expect(deps).toContain(CORE);\n      expect(deps.some(isSubstrate)).toBe(true);\n    }\n  });\n\n  test('bindings depend on no plugin — the harness discovers plugins, not the substrate', () => {\n    for (const binding of byRole('binding')) {\n      for (const dependency of allDependencies(binding)) {\n        expect(dependency).not.toMatch(/^@brunch\\/plugin-/);\n      }\n    }\n  });\n});\n\ndescribe('the direction is physical, not merely declared', () => {\n  // Bun's isolated linker gives each package only what it declares, so a\n  // forbidden import cannot even resolve. This asserts that property holds\n  // rather than assuming it — a hoisted node_modules would quietly restore\n  // every forbidden path.\n  const resolvesFrom = (pkg: WorkspacePackage, specifier: string): boolean => {\n    try {\n      Bun.resolveSync(specifier, pkg.path);\n      return true;\n    } catch {\n      return false;\n    }\n  };\n\n  // Probed with the substrate packages the bindings actually declare, and\n  // with every binding by name — derived from the tree, so a new substrate\n  // dependency or a second binding is probed without opting in.\n  const substratePackages = [\n    ...new Set(byRole('binding').flatMap((b) => allDependencies(b).filter(isSubstrate))),\n  ];\n\n  test('a plugin cannot resolve the substrate or a binding', () => {\n    expect(substratePackages.length).toBeGreaterThan(0);\n    for (const plugin of byRole('plugin')) {\n      for (const specifier of substratePackages) {\n        expect({\n          plugin: plugin.dir,\n          specifier,\n          resolves: resolvesFrom(plugin, specifier),\n        }).toEqual({ plugin: plugin.dir, specifier, resolves: false });\n      }\n      for (const binding of byRole('binding')) {\n        expect(resolvesFrom(plugin, binding.name)).toBe(false);\n      }\n      expect(resolvesFrom(plugin, CORE)).toBe(true);\n    }\n  });\n\n  test('core cannot resolve the substrate', () => {\n    const core = PACKAGES.find((pkg) => pkg.name === CORE)!;\n    for (const specifier of substratePackages) {\n      expect({ specifier, resolves: resolvesFrom(core, specifier) }).toEqual({\n        specifier,\n        resolves: false,\n      });\n    }\n  });\n});\n\ndescribe('Valibot is the schema library at every boundary (spec §12.4)', () => {\n  // Flue locks Valibot at every boundary. A Standard-Schema waist would buy\n  // comfort at the cost of a conversion seam that can silently drop\n  // constraints — the silent-coercion smell.\n  const OTHER_SCHEMA_LIBRARIES = [\n    'zod',\n    'yup',\n    'joi',\n    'ajv',\n    'superstruct',\n    'arktype',\n    'io-ts',\n    'runtypes',\n    '@sinclair/typebox',\n",
  "exitCode": 0
}
````

**Tool Result:** `TU-0346wc1sSzlBgZObWLTQez`

````
# description: Configure where Flue durably stores agent conversations, from the in-memory default to SQLite, Postgres, and beyond.
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg
This guide covers what Flue stores, how the `db.ts` entry module works, the in-memory default and its limits, the built-in `sqlite()`
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg
adapter, and the ecosystem of adapters for Postgres, libSQL, and other backends.
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg
One note up front: the database is a **Node.js** concern.

...

title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > The `db.ts` entry module
To choose a database, create a `db.ts` file in your project’s [source directory](https://flueframework.com/docs/guide/project-layout/) and default-export a persistence adapter:
```ts
import { sqlite } from '@flue/runtime/node';

export default sqlite('./data/flue.db');
````

title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > The `db.ts` entry module
Like `app.ts`, the `db.ts` entry is discovered by convention — `vite dev`, `vite build`, and `flue run` all resolve it from the source root (`.flue/`, `src/`, or the project root) and connect it at startup.

...

title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > The `db.ts` entry module
Flue calls the adapter’s `migrate()` once at boot to create or verify its tables, then awaits `connect()` — so an unreachable or misconfigured database fails at startup, not in the middle of your first conversation.

...

title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > The in-memory default
Without a `db.ts`, Flue runs on in-memory SQLite. Everything works — conversations, persisted state, recovery within the process lifetime — but **a restart loses everything**: every conversation, every accepted submission, every piece of state.

...

title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > The in-memory default
| Command | Without db.ts |
| vite dev | A cache file (node_modules/.cache/flue/dev.db) — history survives code reloads, resets when the dev server cold-starts. |
| vite build | In-memory — the deployed server keeps state only for the process lifetime. |
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > The in-memory default
With a `db.ts`, all three use your adapter, so development runs against the same storage shape as production.
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > The built-in `sqlite()` adapter
The `sqlite()` adapter ships with the runtime and needs no extra dependencies — it runs on Node’s built-in `node:sqlite` module. Point it at a file path for storage that survives restarts:

```ts
import { sqlite } from "@flue/runtime/node";

export default sqlite("./data/flue.db");
```

title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > The built-in `sqlite()` adapter
The adapter creates the file (and any missing parent directories) on first boot and opens it in WAL mode. Calling `sqlite()` with no argument — or with `':memory:'` — gives you the same in-memory database as the default.
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > The built-in `sqlite()` adapter
A file-backed SQLite database covers a single-host deployment: it survives process restarts and redeploys on the same machine, but not the loss of the host itself. When state must survive host loss, or multiple replicas need to share it, use an external database.
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Ecosystem adapters
Flue publishes adapters for the major database ecosystems, each available as a [blueprint](https://flueframework.com/docs/cli/add/) — a Markdown implementation guide your coding agent applies, rather than a package installer. The blueprint name is the backend’s lowercase name:

```sh
flue add database postgres
```

title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Ecosystem adapters
| Backend | Adapter package |
| [Postgres](https://flueframework.com/docs/ecosystem/databases/postgres/) | @flue/postgres |
| [Supabase](https://flueframework.com/docs/ecosystem/databases/supabase/) | @flue/postgres |
| [Turso](https://flueframework.com/docs/ecosystem/databases/turso/) | @flue/libsql |title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Ecosystem adapters
| Backend | Adapter package |
| [Postgres](https://flueframework.com/docs/ecosystem/databases/postgres/) | @flue/postgres |
| [Supabase](https://flueframework.com/docs/ecosystem/databases/supabase/) | @flue/postgres |
| [MySQL](https://flueframework.com/docs/ecosystem/databases/mysql/) | @flue/mysql |title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Ecosystem adapters
| Backend | Adapter package |
| [Postgres](https://flueframework.com/docs/ecosystem/databases/postgres/) | @flue/postgres |
| [Supabase](https://flueframework.com/docs/ecosystem/databases/supabase/) | @flue/postgres |
| [MongoDB](https://flueframework.com/docs/ecosystem/databases/mongodb/) | @flue/mongodb |title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Ecosystem adapters
| Backend | Adapter package |
| [Postgres](https://flueframework.com/docs/ecosystem/databases/postgres/) | @flue/postgres |
| [Supabase](https://flueframework.com/docs/ecosystem/databases/supabase/) | @flue/postgres |
| [Redis](https://flueframework.com/docs/ecosystem/databases/redis/) | @flue/redis |

...

title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Ecosystem adapters
There are no migrations to run by hand with any adapter. `migrate()` provisions Flue’s tables idempotently on first boot, reuses them on restart, and stamps a format version — a database written by an incompatible Flue version refuses to start rather than corrupting state.
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Ecosystem adapters
A shared database does **not** enable active-active scaling. A durable external database lets a replacement process recover accepted work and lets replicas share conversation state, but each agent conversation still needs exactly one live Node owner at a time.
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Ecosystem adapters
See [Durability](https://flueframework.com/docs/guide/durability/) for the ownership rules and what recovery actually replays.
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Writing a custom adapter
If your backend isn’t in the catalog, you can implement the storage contract yourself. An adapter is an object with `connect()` (returning the three stores — submissions, conversation streams, and attachments), plus optional `migrate()` and `close()`; the types live in `@flue/runtime/adapter`:
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Writing a custom adapter

```ts
import type { PersistenceAdapter } from '@flue/runtime/adapter';

export default {
  migrate() {
    /* create or verify backing storage */
  },
  connect() {
    return { submissionStore, conversationStreamStore, attachmentStore };
  },
  close() {
    /* release connections */
  },
```

...

title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Choosing a database
| Situation | Choice |
| Local development | The defaults — add db.ts only to develop against production storage |
| Single-host Node deployment | File-backed sqlite() |
| Cloudflare deployment | Nothing to configure — Durable Object SQLite is automatic |
| A backend not in the catalog | A custom PersistenceAdapter |
title: Database | Flue
image: https://flueframework.com/docs/og4.jpg > Next steps

- [Durability](https://flueframework.com/docs/guide/durability/) — what recovery replays after an interruption, and the one-live-owner rule.
- [Data Persistence API](https://flueframework.com/docs/reference/data-persistence-api/) — the full adapter and store contracts.
  title: Database | Flue
  image: https://flueframework.com/docs/og4.jpg > Next steps
- [Postgres](https://flueframework.com/docs/ecosystem/databases/postgres/) and the other ecosystem database pages — per-backend setup, configuration, and caveats.
- [Deploy Agents on Node.js](https://flueframework.com/docs/ecosystem/deploy/node/) — provisioning a database alongside your server.

```

**Tool Result:** `TU-0346wc1u7jQutZpaOA2e1X`

```

# description: Build your Flue application into a deployable artifact and ship it to the Node.js or Cloudflare target.

title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Build with Vite

1. **Resolves the project.** It discovers [flue.config.ts](https://flueframework.com/docs/reference/configuration/) and locates your entry modules (`app.ts` required; `db.ts` and `cloudflare.ts` optional).
2.

...

title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Choose a target
Flue builds for two targets:

- **Node.js** produces a self-starting server you can run anywhere Node runs: a VM, a container, or a managed host.
- **Cloudflare** produces a Worker where each agent runs inside its own Durable Object, with durable state and global addressability out of the box.
  title: Deploy | Flue
  image: https://flueframework.com/docs/og4.jpg > Choose a target
  When `target` is unset, `flue()` auto-detects it from the Vite plugin array: with `@cloudflare/vite-plugin` present the target is `'cloudflare'`, otherwise `'node'`. An explicit [target](https://flueframework.com/docs/reference/configuration/) overrides detection.
  title: Deploy | Flue
  image: https://flueframework.com/docs/og4.jpg > Deploy on Node.js
  `vite build` bundles the application into two Node entries: the self-starting `dist/server.mjs`, and the non-listening `dist/app.mjs` chunk it imports:

```bash
vite build
node dist/server.mjs
```

Three things to know before shipping the artifact:
title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy on Node.js

- **Environment:** the built server does not load `.env` — supply provider keys and other configuration when you start it. It listens on port `3000` by default; set `PORT` to change it.
- **Dependencies:** application dependencies are externalized, not bundled.
  title: Deploy | Flue
  image: https://flueframework.com/docs/og4.jpg > Deploy on Node.js
  Deploy the artifact alongside its `node_modules`, or in a container that installs them.
- **State:** without a [db.ts](https://flueframework.com/docs/guide/database/) adapter, conversations live in process-local memory and a restart loses them. Configure a durable adapter before deploying anything you care about.

...

title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy on Node.js
For runtime details — state and durability, process ownership, multi-replica rules, environment and secrets — see the [Node.js target guide](https://flueframework.com/docs/guide/node-target/).

...

title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy on Cloudflare
On Cloudflare, `flue()` cooperates with the official `@cloudflare/vite-plugin`, which owns workerd dev, build output, preview, and deploy. `flue()` must come **before** `cloudflare()` in the plugins array; the wrong order is diagnosed with an error.
title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy on Cloudflare
Flue’s job is generating the Worker inputs the Cloudflare plugin consumes: a Worker entry that registers your scanned agents and exports one Durable Object class per agent, plus your authored `wrangler.jsonc` merged with the generated bindings. Add both generated paths to `.gitignore`:

...

title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy on Cloudflare
Two things stay yours to author in `wrangler.jsonc`: the `nodejs_compat` compatibility flag, and the **Durable Object migrations** — an append-only record of your deployments that Flue never writes.
title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy on Cloudflare
Every deployed agent needs a migration entry for its generated class, so adding an agent is always a triple: the agent, its mount in `app.ts` (skip for dispatch-only agents), and a new migration tag:
title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy on Cloudflare

```jsonc
{
  "name": "my-flue-worker",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["FlueTriageAgent"] }],
}
```

...

title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy on Cloudflare
Build and deploy through the Cloudflare plugin: `vite build`, then deploy against the config it emits into `dist/`.
title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Deploy on Cloudflare
For the full walkthrough, see [Deploy Agents on Cloudflare](https://flueframework.com/docs/ecosystem/deploy/cloudflare/); for runtime behavior — generated classes and bindings, durable execution, service bindings — see the [Cloudflare target guide](https://flueframework.com/docs/guide/cloudflare-target/).

...

title: Deploy | Flue
image: https://flueframework.com/docs/og4.jpg > Docs Navigation > Sections

- [Guide](https://flueframework.com/docs/guide/getting-started/)
- [Reference](https://flueframework.com/docs/reference/agent-api/)
- [CLI](https://flueframework.com/docs/cli/overview/)
- [Agent SDK](https://flueframework.com/docs/sdk/overview/)
- [Ecosystem](https://flueframework.com/docs/ecosystem/)

````

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "nl -ba apps/dev/src/db.ts && printf '\\n--- db path ---\\n' && nl -ba apps/dev/src/db-path.ts && printf '\\n--- project config versions ---\\n' && rg -n '\"(@flue/|ai\"|@trytilde|next|vercel|cloudflare)' package.json apps packages bun.lock | sed -n '1,160p'",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
````

**Tool Use:** `shell_command`

```json
{
  "command": "nl -ba CONTEXT.md | sed -n '1,130p' && printf '\\n--- package/app selected ---\\n' && nl -ba apps/dev/package.json | sed -n '1,100p' && nl -ba apps/dev/src/app.ts | sed -n '1,100p' && nl -ba apps/dev/src/agents/gherkin-elicitor.ts | sed -n '20,110p'",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "nl -ba packages/binding-flue/src/capabilities.ts | sed -n '1,150p' && printf '\\n--- binding ask ---\\n' && nl -ba packages/binding-flue/src/index.ts | sed -n '25,120p' && printf '\\n--- local store selected ---\\n' && nl -ba packages/binding-flue/src/local-capture-store.ts | sed -n '1,120p'",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "nl -ba docs/planning/elicitation-kernel/spec.md | sed -n '642,661p' && nl -ba test/known-gaps.ts | sed -n '60,118p' && nl -ba .github/workflows/ci.yml | sed -n '1,100p'",
  "workdir": "/Users/lunelson/Code/hashintel/brunch-lite"
}
```

## User

**Tool Result:** `TU-0346wcH56DvMLrbCjD29Xd`

```
{
  "output": "     1\t/**\n     2\t * The substrate's conversation storage — host-authored because Flue requires\n     3\t * it of the consuming app (spec §9.6, adjudication C1).\n     4\t *\n     5\t * Not to be confused with the capture store: that is the harness's storage\n     6\t * port, harness-defined and implemented in `@brunch/binding-flue`, and plugins are\n     7\t * blind to both. This file holds only the live transport copy of conversations.\n     8\t * The provenance record is the target-document's own session-log archive.\n     9\t *\n    10\t * Without this file conversations are process-memory and a restart loses them\n    11\t * (recorded Flue fact, spec §10). Restart durability of the full stack is an\n    12\t * open verification item (spec §14.5) that this file exists to make testable.\n    13\t */\n    14\t\n    15\timport { sqlite } from '@flue/runtime/node';\n    16\timport { conversationDbPath } from './db-path.ts';\n    17\t\n    18\texport default sqlite(conversationDbPath());\n\n--- db path ---\n     1\t/**\n     2\t * Where the conversation store lives, resolved before the adapter opens it.\n     3\t *\n     4\t * Anchored to this module's location — the way `app.ts` anchors `uiRoot` —\n     5\t * never to the launch directory: a cwd-relative default silently creates a\n     6\t * fresh empty database when the app is launched from anywhere else, which is\n     7\t * the exact restart-durability failure `db.ts` exists to prevent. From `src/`\n     8\t * and from the emitted `dist/` bundle alike, `../.data-wipe-me/` resolves to\n     9\t * the package directory.\n    10\t *\n    11\t * Kept apart from `db.ts` so it stays importable under `bun test`: the\n    12\t * adapter module pulls in `@flue/runtime/node`, which cannot be driven there.\n    13\t */\n    14\t\n    15\timport { fileURLToPath } from 'node:url';\n    16\t\n    17\texport function conversationDbPath(): string {\n    18\t  // Truthiness, not nullish, on purpose: a set-but-empty override would pass\n    19\t  // '' through to sqlite(), which opens an anonymous temporary database\n    20\t  // deleted on close — silently non-durable again.\n    21\t  const override = process.env.BRUNCH_DEV_DB_PATH;\n    22\t  return override\n    23\t    ? override\n    24\t    : fileURLToPath(new URL('../.data-wipe-me/conversations.db', import.meta.url));\n    25\t}\n\n--- project config versions ---\nbun.lock:23:        \"@flue/react\": \"^2.0.3\",\nbun.lock:24:        \"@flue/runtime\": \"^2.0.3\",\nbun.lock:25:        \"@flue/sdk\": \"^2.0.3\",\nbun.lock:33:        \"@flue/vite\": \"^2.0.3\",\nbun.lock:44:        \"@flue/runtime\": \"^2.0.3\",\nbun.lock:238:    \"@flue/react\": [\"@flue/react@2.0.3\", \"\", { \"peerDependencies\": { \"@flue/sdk\": \"2.0.3\", \"react\": \">=18\" } }, \"sha512-6Yd5EVUhCFyypFUyZ1RjPhre/NG06nUHPru7wITQnCjzi2syF1U2bP3sl9jJj0cqznHhsXl3fPXU8sPRo/3+DQ==\"],\nbun.lock:240:    \"@flue/runtime\": [\"@flue/runtime@2.0.3\", \"\", { \"dependencies\": { \"@earendil-works/pi-agent-core\": \"^0.83.0\", \"@earendil-works/pi-ai\": \"^0.83.0\", \"@hono/node-server\": \"^2.0.3\", \"@modelcontextprotocol/client\": \"2.0.0\", \"@valibot/to-json-schema\": \"^1.3.0\", \"hono\": \"^4.8.3\", \"js-yaml\": \"^5.2.1\", \"ulidx\": \"^2.4.1\", \"valibot\": \"^1.1.0\" } }, \"sha512-RfWyZG9x2hlDb1264XTESX42tzzG3AA8er3XjaTIxIMh28pTD91zKd9Jh6PFXKeTkZegLsGiJKDxmiCddlyeug==\"],\nbun.lock:242:    \"@flue/sdk\": [\"@flue/sdk@2.0.3\", \"\", { \"dependencies\": { \"@durable-streams/client\": \"^0.2.6\" } }, \"sha512-ZD5HZGeVxWu0/G6KYrpOh1RGGBpvk/i9QojWMykNzVrH0w4g3nTPdZN9kY4JvYh/+aRtqTrwb3c1Tb3hUm8BIg==\"],\nbun.lock:244:    \"@flue/vite\": [\"@flue/vite@2.0.3\", \"\", { \"dependencies\": { \"@flue/runtime\": \"2.0.3\", \"@hono/node-server\": \"^2.0.3\", \"agents\": \"^0.20.1\", \"magic-string\": \"^1.0.0\", \"tinyglobby\": \"^0.2.15\", \"ulidx\": \"^2.4.1\" }, \"peerDependencies\": { \"vite\": \"^8.0.0\" } }, \"sha512-Klrl+vFzp+z9sYQ+yc7k/yxGrjWMvjoeKtzEZ+wgYwzLfai1sR9iYlMrpLg2ORTH8KqZ+kHvKR0Y2l8wHIvSIA==\"],\nbun.lock:420:    \"agents\": [\"agents@0.20.1\", \"\", { \"dependencies\": { \"@babel/plugin-proposal-decorators\": \"^8.0.2\", \"@cfworker/json-schema\": \"^4.1.1\", \"@rolldown/plugin-babel\": \"^0.2.3\", \"cron-schedule\": \"^6.0.0\", \"esbuild\": \"^0.28.1\", \"mimetext\": \"^3.0.28\", \"nanoid\": \"^5.1.16\", \"partyserver\": \"^0.5.8\", \"partysocket\": \"1.3.0\", \"yaml\": \"^2.9.0\", \"yargs\": \"^18.0.0\" }, \"peerDependencies\": { \"@ai-sdk/react\": \"^3.0.0 || ^4.0.0\", \"@cloudflare/codemode\": \">=0.5.0\", \"@modelcontextprotocol/client\": \"2.0.0\", \"@modelcontextprotocol/sdk\": \"1.30.0\", \"@modelcontextprotocol/server\": \"2.0.0\", \"@tanstack/ai\": \">=0.10.2 <1.0.0\", \"@x402/core\": \"^2.0.0\", \"@x402/evm\": \"^2.0.0\", \"ai\": \"^6.0.0 || ^7.0.0\", \"chat\": \"^4.29.0\", \"just-bash\": \"^3.0.0\", \"react\": \"^19.0.0\", \"vite\": \">=6.0.0 <9.0.0\", \"zod\": \"^4.0.0\" }, \"optionalPeers\": [\"@ai-sdk/react\", \"@cloudflare/codemode\", \"@tanstack/ai\", \"@x402/core\", \"@x402/evm\", \"ai\", \"chat\", \"just-bash\", \"vite\"], \"bin\": { \"agents\": \"dist/cli/index.js\" } }, \"sha512-HQRYMeZpD3k8djYBH7atRPojZMee3NvmXkzsmMWXfdHZ94vMljmWqSsD1XZd70LovHyQrw6/R81AZZIsRiFM6Q==\"],\napps/dev/package.json:15:    \"@flue/react\": \"^2.0.3\",\napps/dev/package.json:16:    \"@flue/runtime\": \"^2.0.3\",\napps/dev/package.json:17:    \"@flue/sdk\": \"^2.0.3\",\napps/dev/package.json:25:    \"@flue/vite\": \"^2.0.3\",\npackages/binding-flue/package.json:12:    \"@flue/runtime\": \"^2.0.3\",\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-0346wcH5aLjZifjeDM0vJM`

```
{
  "output": "     1\t# Elicitation Kernel\n     2\t\n     3\tVocabulary for the elicitation-kernel effort: a standalone architecture generalizing brunch's elicitor into agentic interviewing against pluggable elicitation targets.\n     4\t\n     5\t## Language\n     6\t\n     7\t### Shells\n     8\t\n     9\t**Substrate**:\n    10\tThe agent framework the system is built on — the Pi family, Flue — including the embedding environment's concerns: deploy target, storage-port implementation, artifact delivery, model/provider. (The retired term \"host\" silently bundled these with interface concerns; they split into substrate and UI. The charter non-goal \"harness-agnostic core\" predates this glossary and reads \"substrate-agnostic\".)\n    11\t_Avoid_: harness (for Pi/Flue), platform, host (for the embedding environment)\n    12\t\n    13\t**UI**:\n    14\tThe interface shell: whatever affords user interaction — rendering, input, reply transport. Not bound to GUI or TUI; a chat channel qualifies.\n    15\t_Avoid_: host, host-interface, frontend, client\n    16\t\n    17\t**Harness**:\n    18\tThe middle shell and the essence of the effort: the generic capability layer of the elicitation system — mechanism and orchestration (the conversation loop, the `ask` API, capture envelope, issue queue, sweep bookkeeping). Injected into plugins as a narrow context; never owned by them.\n    19\t_Avoid_: kernel, core, elicitor (as a shell name — \"elicitor\" may name the whole system). Exempt compound: **kernel card** (below). \"Kernel invariants\" renamed **harness invariants** (spec §14.1).\n    20\t\n    21\t**Plugin**:\n    22\tThe innermost shell: target-defining policy. Declares packs, forms, and validators; composes at authoring time; receives harness capabilities by injection. Mostly policy — mechanism stays in the harness.\n    23\t_Avoid_: extension, pack (a pack is a unit *within* a plugin)\n    24\t\n    25\t**Binding**:\n    26\tThe substrate-facing adapter between harness and substrate: implements the harness's named substrate-capability list (tool registration, instruction assembly, persistent state, affordance emission, suspend-for-reply, private model call) in one substrate's dialect. One per substrate; the harness imports no substrate, a binding imports both. Bindings vary in size — each absorbs what its substrate lacks or forbids.\n    27\t_Avoid_: adapter (generic), integration, wrapper\n    28\t\n    29\t### Sessions & durability\n    30\t\n    31\t**Target-domain**:\n    32\tThe artifact family being elicited — what a plugin defines (gherkin scenarios, assurance arguments, BPMN). The family half of the former bare \"target\".\n    33\t_Avoid_: target-paradigm; bare \"target\" where family/instance is ambiguous\n    34\t\n    35\t**Target-document**:\n    36\tThe durable unit sessions attach to: one target-domain, its capture store, and its session history. Named by its purpose — its authoritative state is the capture store plus session logs, never the rendered artifact (renders are derived, cacheable, disposable). Endures independently of any session; never locks — completion is a derived status, not a write gate.\n    37\t_Avoid_: spec (as the unit name), workpiece, case, target-output\n    38\t\n    39\t**Session**:\n    40\tOne substrate conversation — the full log of entries (user, agent, tool calls, injected state messages), matching Pi's session model. Per-session state is exactly: the evidence log, the swept high-water mark, the pending-affordance slot. Sessions go quiet rather than close; any session is resumable against the current state of its target-document.\n    41\t_Avoid_: sitting, conversation (as a distinct concept)\n    42\t\n    43\t**Capture store**:\n    44\tThe durable, session-independent truth of a target-document: captures, issues, events. Written only by atomic sweep application (serialized); statuses and projections derive from it at read time.\n    45\t\n    46\t**Re-entry briefing**:\n    47\tThe state message the harness injects when a session resumes after the world moved: computed facts only — unswept tail, world-moved delta, open issues, pending affordance. Authored on behalf of the user in the transcript (Pi's custom-entry convention) but distinguished from true user entries in the data model, and never citable as capture evidence.\n    48\t_Avoid_: sync message, forced re-sweep\n    49\t\n    50\t### Interaction\n    51\t\n    52\t**Affordance**:\n    53\tA structured interactive element (question form, choice strip, questionnaire) emitted into the conversation stream as a rendered enhancement. Not a state machine — the conversation stays primary, and an affordance's payload is evidence in the session like any other entry.\n    54\t_Avoid_: exchange, exchange pair, terminal (brunch's retired turn-by-turn ontology)\n    55\t\n    56\t**Capture**:\n    57\tExtraction of structured evidence — envelope plus plugin-typed payload — from session entries. Produced by sweeps, never written directly during conversation.\n    58\t_Avoid_: extraction, harvest\n    59\t\n    60\t**Sweep**:\n    61\tAn idempotent pass over a settled range of session entries that produces captures. Re-sweeping a range never double-captures.\n    62\t\n    63\t**Settlement**:\n    64\tThe agent-judged event marking a range of conversation (a vein closing) ready to sweep. Always range-level, never per-question.\n    65\t_Avoid_: exchange completion\n    66\t\n    67\t**Interpretation render**:\n    68\tThe harness-owned affordance form showing current captured state — the harness frames envelope semantics; the plugin's renderer definition (typed against its own payload shapes) supplies the content view when provided, with a harness default (plain JSON view) otherwise.\n    69\t_Avoid_: digest (brunch's form)\n    70\t\n    71\t### Envelope & packs\n    72\t\n    73\t**Intermediate representation (IR)**:\n    74\tThe elicited description a target-document accumulates: the set of active captures, read through the plugin's declared payload type system. Not a second store — every consolidated view (entity graph, net, completion table) is a read-time projection over active captures, and the rendered artifact is one projection of the IR, never the IR itself. Defining a plugin's IR means defining its payload type system.\n    75\t_Avoid_: knowledge store, domain model (as a stored unit), staging area\n    76\t\n    77\t**Capture envelope**:\n    78\tThe harness-defined, domain-free wrapper around an opaque plugin payload: harness-minted id, evidence spans, epistemic status, confidence, value-xor-absence, alternatives grouping, one `supersedes` link. The hourglass waist. No stored status — envelope status (`active | superseded | retracted`) derives at read time from links and events.\n    79\t\n    80\t**Evidence span**:\n    81\tA capture's provenance link: a **quoted excerpt** (primary, the model-facing citation currency) plus a **pointer** (session id + entry range, harness-derived — entry identity is harness-side vocabulary only). Anchors only on true user and user-affordance-payload entries.\n    82\t\n    83\t**Epistemic status**:\n    84\t`explicit | inferred | tentative | defaulted | external-lookup` — how a capture's content relates to what the user actually said. Distinct from confidence; excluded from capture identity.\n    85\t\n    86\t**Absence state**:\n    87\tA first-class capture value where an answer would be: `unknown-to-user | not-yet-decided | not-applicable | explicitly-absent | declined | deferred` (`not-mentioned` is a computed fact, not a sweepable capture). Never collapses to null.\n    88\t_Avoid_: null, missing (as the stored representation)\n    89\t\n    90\t**Supersession**:\n    91\tThe explicit correction mechanism, single-hop over active heads only. Two channels: the creation-time `supersedes` link (sweep-time correction) and the resolution record (issue-time adjudication). Superseded captures stay visible — corrections don't erase history.\n    92\t\n    93\t**Resolution record**:\n    94\tThe explicit capture-store event that alone closes a `conflicting` issue (and, with no successor capture, expresses retraction). Must cite the true user's utterance as evidence.\n    95\t\n    96\t**Issue**:\n    97\tTyped, stored backpressure to the elicitation controller: `missing / ambiguous / conflicting / invalid / unsupported / unmapped / low-confidence`, with factual attributes. Two producers, namespaced: plugin ops (payload level) and the harness itself (envelope level). Closes only explicitly.\n    98\t_Avoid_: advisory (a different thing, below)\n    99\t\n   100\t**Advisory**:\n   101\tA computed, ephemeral, non-blocking fact the harness surfaces to the agent (unaccounted ask, unswept tail, world-moved delta). Never stored in the capture store; never gates anything.\n   102\t\n   103\t**Pack**:\n   104\tA unit within a plugin: **ElicitationPack** (kernel cards, completion contract, clarification hints) or **ProjectionPack** (`project` + `validate`, optional `reconcile`, annotated shapes, typed loss reports). Packs are shapes-to-fill plus behavioral guidance, per Principle v2.\n   105\t\n   106\t**Kernel card**:\n   107\tThe pack-content unit of elicitation guidance: Detects / Goal / contrastive Questions / Artifacts (brunch `BEHAVIORAL_KERNELS.md` lineage — \"kernel\" here names a small unit of behavioral guidance, not a shell; the compound is the glossary's one sanctioned \"kernel\" use). Splits by ownership: domain cards are plugin pack content; a harness-shipped **generic strategy quiver** (cards over envelope vocabulary — conflict, ambiguity, weak evidence) is named in spec §11.5, not designed.\n   108\t\n   109\t**PluginContext**:\n   110\tThe narrow injected context through which a plugin receives harness capabilities (the ask API, envelope, issue queue, sweep bookkeeping). The plugin's entire world at runtime; the four operations remain pure (snapshot-in/deltas-out) regardless.\n   111\t\n   112\t**Storage port**:\n   113\tThe harness-defined contract for the capture store (atomic sweep application, envelope invariants as store-level refusals), implemented by the binding for its deploy target. Plugins are storage-blind. Scope includes the **session-log archive** (archive-on-read; spec §9.6): session logs live with the target-document, retained indefinitely — the substrate's conversation store is the live transport copy, never the provenance record.\n   114\t\n   115\t### September demo\n   116\t\n   117\t**Demo shell**:\n   118\tThe one-off application built for the 17–18 September demo: consumes the elicitation library (harness + plugin + binding) and the Petrinaut libraries, owns the UI, session persistence, and elicitor runtime. Explicitly disposable — not a product commitment; neither library consumes the other.\n   119\t_Avoid_: \"the app\", standalone brunch, demo app (unqualified)\n   120\t\n   121\t**Artifact boundary**:\n   122\tThe decided integration posture between elicitor and Petrinaut (FE-1362): the elicitor emits a versioned net file plus scenario; Petrinaut consumes it through its published parser and import-with-autolayout path. The rejected alternative was library coupling (one library consuming the other).\n   123\t_Avoid_: file handoff (undersells it), integration (generic)\n   124\t\n   125\t**Revision story**:\n   126\tThe working-hypothesis demo spine (FE-1363; recommended to PM, not ratified): a sped-up recorded elicitation (conversation, interpretation surface, and growing net visible together) plus a bounded live segment in which a few turns elicit a fact forcing a structural revision of the net, run before/after in Petrinaut.\n   127\t_Avoid_: live demo (unqualified — the live part is one bounded segment, not the format)\n   128\t\n   129\t### Simulation & evaluation\n   130\t\n\n--- package/app selected ---\n     1\t{\n     2\t  \"name\": \"@brunch/dev\",\n     3\t  \"version\": \"0.0.0\",\n     4\t  \"private\": true,\n     5\t  \"type\": \"module\",\n     6\t  \"description\": \"The dev/demo vehicle: local dev loop, target gallery, diagnostic probe surface. Not the product.\",\n     7\t  \"scripts\": {\n     8\t    \"dev\": \"vite dev\",\n     9\t    \"build\": \"vite build && vite build --config vite.client.config.ts\"\n    10\t  },\n    11\t  \"dependencies\": {\n    12\t    \"@brunch/binding-flue\": \"workspace:*\",\n    13\t    \"@brunch/core\": \"workspace:*\",\n    14\t    \"@brunch/plugin-gherkin\": \"workspace:*\",\n    15\t    \"@flue/react\": \"^2.0.3\",\n    16\t    \"@flue/runtime\": \"^2.0.3\",\n    17\t    \"@flue/sdk\": \"^2.0.3\",\n    18\t    \"hono\": \"^4.6.0\",\n    19\t    \"react\": \"^19.0.0\",\n    20\t    \"react-dom\": \"^19.0.0\",\n    21\t    \"valibot\": \"^1.4.2\"\n    22\t  },\n    23\t  \"devDependencies\": {\n    24\t    \"@earendil-works/pi-ai\": \"^0.83.0\",\n    25\t    \"@flue/vite\": \"^2.0.3\",\n    26\t    \"@types/react\": \"^19.0.0\",\n    27\t    \"@types/react-dom\": \"^19.0.0\",\n    28\t    \"vite\": \"^8\"\n    29\t  }\n    30\t}\n     1\t/**\n     2\t * The dev app's route map — the \"mount\" half of the thin host (spec §12.1).\n     3\t *\n     4\t * The dev app is chartered with three roles, none of them \"the product\"\n     5\t * (spec §12.5): the local dev loop against every plugin, the colleague-facing\n     6\t * target-gallery demo, and the diagnostic probe surface. Milestone one keeps\n     7\t * affordance renderers here rather than in a ui package.\n     8\t */\n     9\t\n    10\timport { readFile } from 'node:fs/promises';\n    11\timport { createAgentRouter } from '@flue/runtime/routing';\n    12\timport { Hono } from 'hono';\n    13\timport { GherkinElicitor } from './agents/gherkin-elicitor.ts';\n    14\timport { assetHandler } from './assets.ts';\n    15\timport { GHERKIN_AGENT_ROUTE } from './routes.ts';\n    16\t\n    17\tconst app = new Hono();\n    18\t\n    19\t// One route per target agent. The gallery grows an entry per plugin; gherkin\n    20\t// is the tracer that wires end-to-end first (spec §13). The browser and mount\n    21\t// share the route constant; Flue still keys storage on the agent's independent,\n    22\t// pinned identity.\n    23\tapp.route(`/agents/${GHERKIN_AGENT_ROUTE}`, createAgentRouter(GherkinElicitor));\n    24\t\n    25\t// The flue dev controller owns the whole request space — no fall-through to\n    26\t// vite's html serving — so the ui is app-served, in dev and in production\n    27\t// alike (spec §10, recorded facts).\n    28\t//\n    29\t// Two different files, because two different builds produce them: in dev, the\n    30\t// source `index.html` whose script tag vite resolves live; in production, the\n    31\t// client build's emitted `index.html`, whose script tag points at a real\n    32\t// bundled asset. `@flue/vite` emits the server environment only, so that\n    33\t// client build is a second, plain vite build — without it the ui tree would\n    34\t// have no build coverage at all.\n    35\tconst uiRoot = new URL(import.meta.env?.DEV === false ? './client/' : '../', import.meta.url);\n    36\t\n    37\tapp.get('/', async (c) => c.html(await readFile(new URL('index.html', uiRoot), 'utf8')));\n    38\t\n    39\t// Production only: in dev, vite serves the module graph under /src. A\n    40\t// wildcard, not `:file` — bundlers may emit nested asset paths.\n    41\tapp.get('/assets/*', assetHandler(uiRoot));\n    42\t\n    43\texport default app;\n    20\t */\n    21\t\n    22\timport { useElicitation } from '@brunch/binding-flue';\n    23\timport { gherkin } from '@brunch/plugin-gherkin';\n    24\timport { useModel, type AgentProps } from '@flue/runtime';\n    25\timport * as v from 'valibot';\n    26\t\n    27\texport function GherkinElicitor(_props: AgentProps) {\n    28\t  useModel('anthropic/claude-haiku-4-5');\n    29\t  return useElicitation(gherkin);\n    30\t}\n    31\t\n    32\t/**\n    33\t * Pinned, and never to be edited: conversation storage keys on this literal,\n    34\t * so changing it orphans every existing conversation. Flue requires a string\n    35\t * literal here because build targets derive durable identifiers from it before\n    36\t * any user code runs.\n    37\t *\n    38\t * Product-prefixed on purpose, and this is the one place the prefix is not\n    39\t * cosmetic. Agent identities are global per application, and the September\n    40\t * demo shell is chartered to mount this library alongside the Petrinaut\n    41\t * libraries — a bare `gherkin-elicitor` could collide with another library's\n    42\t * agent, and the collision would land on durable conversation storage.\n    43\t *\n    44\t * The exported symbol stays the shorter `GherkinElicitor` because it reads\n    45\t * better at the mount site; `agentName` exists precisely to let durable\n    46\t * identity and source-level name differ.\n    47\t */\n    48\tGherkinElicitor.agentName = 'brunch-gherkin-elicitor';\n    49\t\n    50\t/**\n    51\t * Session→document binding (spec §9.1, adjudication L4): a new session's\n    52\t * `initialData` carries the target-document id, validated once at creation and\n    53\t * immutable thereafter — Flue's own lane for a target descriptor. Dispatching\n    54\t * to an existing conversation id resumes that session against the current state\n    55\t * of its target-document.\n    56\t */\n    57\tGherkinElicitor.initialData = v.object({\n    58\t  targetDocumentId: v.pipe(v.string(), v.nonEmpty()),\n    59\t});\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-0346wcH6r2hqVDTUuS3lYy`

```
{
  "output": "     1\t/**\n     2\t * The substrate-capability list (spec §10), recorded as data.\n     3\t *\n     4\t * This is the core/binding seam, the portability pressure test, and the early\n     5\t * smell detector all at once: porting means reimplementing this list, and\n     6\t * exotic Flue-shaped entries appearing in it is the smell. Keeping it as a\n     7\t * checkable record rather than prose is what lets the second-binding test\n     8\t * (spec §14.2) be asked of every future addition — \"genuinely\n     9\t * substrate-specific, or mechanism leaking into Flue's dialect?\"\n    10\t *\n    11\t * Binding-size asymmetry is expected, not failure: each binding absorbs what\n    12\t * its substrate lacks or forbids.\n    13\t */\n    14\t\n    15\t/** How a binding satisfies one capability. */\n    16\texport type Provision =\n    17\t  /** The substrate offers it directly. */\n    18\t  | 'native'\n    19\t  /** The substrate lacks or forbids it; the binding supplies it itself. */\n    20\t  | 'absorbed';\n    21\t\n    22\texport interface Capability {\n    23\t  readonly id: number;\n    24\t  readonly name: string;\n    25\t  readonly provision: Provision;\n    26\t  /** How this binding satisfies it, in Flue's dialect. */\n    27\t  readonly mechanism: string;\n    28\t}\n    29\t\n    30\texport const CAPABILITIES: readonly Capability[] = [\n    31\t  {\n    32\t    id: 1,\n    33\t    name: 'Register a tool',\n    34\t    provision: 'native',\n    35\t    mechanism: 'defineTool / useTool',\n    36\t  },\n    37\t  {\n    38\t    id: 2,\n    39\t    name: 'Contribute instructions',\n    40\t    provision: 'native',\n    41\t    mechanism: 'render return',\n    42\t  },\n    43\t  {\n    44\t    id: 3,\n    45\t    name: 'Persist per-conversation state',\n    46\t    provision: 'native',\n    47\t    mechanism: 'usePersistentState, atomic with its unit of work',\n    48\t  },\n    49\t  {\n    50\t    id: 4,\n    51\t    name: 'Emit an affordance payload',\n    52\t    provision: 'native',\n    53\t    mechanism: 'data channel + tool output parts',\n    54\t  },\n    55\t  {\n    56\t    id: 5,\n    57\t    name: 'Suspend for reply',\n    58\t    provision: 'absorbed',\n    59\t    mechanism: 'no ask primitive: terminate:true + pending-affordance slot + fresh dispatch',\n    60\t  },\n    61\t  {\n    62\t    id: 6,\n    63\t    name: 'Private model call',\n    64\t    provision: 'native',\n    65\t    mechanism: 'harness.prompt scratch conversation',\n    66\t  },\n    67\t  {\n    68\t    id: 7,\n    69\t    name: 'Subscribe to the would-stop lifecycle seam',\n    70\t    provision: 'native',\n    71\t    mechanism:\n    72\t      'useAgentFinish + ctx.append; fires on suspensions, so the pending guard is load-bearing; loop-guarded',\n    73\t  },\n    74\t  {\n    75\t    id: 8,\n    76\t    name: 'Read the durable entry projection with provenance-discriminating entry kinds',\n    77\t    provision: 'absorbed',\n    78\t    mechanism:\n    79\t      'no in-process API: public history projection over self-HTTP; `purpose` discriminates provenance',\n    80\t  },\n    81\t  {\n    82\t    id: 9,\n    83\t    name: 'Inject typed non-user signal entries',\n    84\t    provision: 'native',\n    85\t    mechanism: \"ctx.append / dispatch({kind:'signal'}); projects structurally non-user\",\n    86\t  },\n    87\t  {\n    88\t    id: 10,\n    89\t    name: 'Provide a transactional durable store outside conversation state',\n    90\t    provision: 'absorbed',\n    91\t    mechanism:\n    92\t      'Flue neither provides nor forbids; the binding owns the storage-port implementation',\n    93\t  },\n    94\t];\n\n--- binding ask ---\n    25\t  usePersistentState,\n    26\t  useTool,\n    27\t} from '@flue/runtime';\n    28\t\n    29\texport { CAPABILITIES, type Capability, type Provision } from './capabilities.ts';\n    30\texport { createLocalCaptureStore } from './local-capture-store.ts';\n    31\t\n    32\t/**\n    33\t * Mount the elicitation harness in a Flue agent.\n    34\t *\n    35\t * Flue has no ask-the-user primitive, so the harness owns the turn-suspension\n    36\t * protocol: a `terminate: true` ask tool, the pending affordance in\n    37\t * per-session state, and the answer arriving as a fresh dispatch (spec §7.4).\n    38\t */\n    39\texport function useElicitation(plugin: Plugin): string {\n    40\t  const delivery = useDelivery();\n    41\t  const [pending, setPending] = usePersistentState<FreeTextAffordanceValue | null>(\n    42\t    'pendingAffordance',\n    43\t    null,\n    44\t  );\n    45\t  const writeAffordance = useDataWriter('affordance', { schema: FreeTextAffordance });\n    46\t\n    47\t  useAgentStart((ctx) => {\n    48\t    if (delivery.kind !== 'user' || pending === null) return;\n    49\t\n    50\t    setPending(null);\n    51\t    ctx.append({\n    52\t      kind: 'signal',\n    53\t      type: 'affordance-reply-bound',\n    54\t      tagName: 'affordance-reply-bound',\n    55\t      body: `The immediately preceding user message is mechanically bound as the reply to this pending affordance:\\n\\n${pending.markdown}`,\n    56\t      attributes: { affordanceId: pending.id },\n    57\t    });\n    58\t  });\n    59\t\n    60\t  useTool({\n    61\t    name: toolName('ask'),\n    62\t    description:\n    63\t      'Ask one free-text question and suspend this turn for the person’s reply. A second ask in the same tool batch is rejected.',\n    64\t    input: AskInput,\n    65\t    output: FreeTextAffordance,\n    66\t    run({ data, toolCallId }) {\n    67\t      const affordance: FreeTextAffordanceValue = {\n    68\t        id: `affordance_${toolCallId}`,\n    69\t        form: 'free-text',\n    70\t        markdown: data.question,\n    71\t        payload: { question: data.question },\n    72\t      };\n    73\t\n    74\t      setPending((current) => {\n    75\t        if (current !== null) {\n    76\t          throw new Error(\n    77\t            `An interactive affordance is already pending (${current.id}); wait for its reply before asking another question.`,\n    78\t          );\n    79\t        }\n    80\t        return affordance;\n    81\t      });\n    82\t      writeAffordance(affordance);\n    83\t\n    84\t      return { output: affordance, terminate: true };\n    85\t    },\n    86\t  });\n    87\t\n    88\t  return [\n    89\t    `You are interviewing someone to elicit ${plugin.targetDomain}.`,\n    90\t    `Ask one question at a time with ${toolName('ask')}.`,\n    91\t    'Continue the conversation after each reply, using the harness-provided reply binding as a mechanical fact.',\n    92\t  ].join('\\n\\n');\n    93\t}\n\n--- local store selected ---\n     1\timport {\n     2\t  applyCaptureStoreCommand,\n     3\t  createEmptyCaptureStoreSnapshot,\n     4\t  parseCaptureStoreSnapshot,\n     5\t  type CaptureStore,\n     6\t  type CaptureStoreCommand,\n     7\t  type CaptureStoreResult,\n     8\t  type CaptureStoreSnapshot,\n     9\t} from '@brunch/core';\n    10\timport { randomUUID } from 'node:crypto';\n    11\timport { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';\n    12\timport { dirname, resolve } from 'node:path';\n    13\t\n    14\tconst writesByPath = new Map<string, Promise<void>>();\n    15\t\n    16\tclass LocalCaptureStore implements CaptureStore {\n    17\t  readonly #path: string;\n    18\t\n    19\t  constructor(path: string) {\n    20\t    this.#path = resolve(path);\n    21\t  }\n    22\t\n    23\t  async read(): Promise<CaptureStoreSnapshot> {\n    24\t    await writesByPath.get(this.#path);\n    25\t    return this.#readFile();\n    26\t  }\n    27\t\n    28\t  async execute(command: CaptureStoreCommand): Promise<CaptureStoreResult> {\n    29\t    const previous = writesByPath.get(this.#path) ?? Promise.resolve();\n    30\t    const operation = previous.then(async () => {\n    31\t      const result = applyCaptureStoreCommand(await this.#readFile(), command);\n    32\t      if (result.ok) await this.#writeFile(result.snapshot);\n    33\t      return result;\n    34\t    });\n    35\t    const settled = operation.then(\n    36\t      () => undefined,\n    37\t      () => undefined,\n    38\t    );\n    39\t    writesByPath.set(this.#path, settled);\n    40\t    void settled.finally(() => {\n    41\t      if (writesByPath.get(this.#path) === settled) writesByPath.delete(this.#path);\n    42\t    });\n    43\t    return operation;\n    44\t  }\n    45\t\n    46\t  async #readFile(): Promise<CaptureStoreSnapshot> {\n    47\t    try {\n    48\t      return parseCaptureStoreSnapshot(JSON.parse(await readFile(this.#path, 'utf8')));\n    49\t    } catch (error) {\n    50\t      if (\n    51\t        error instanceof Error &&\n    52\t        'code' in error &&\n    53\t        (error as NodeJS.ErrnoException).code === 'ENOENT'\n    54\t      ) {\n    55\t        return createEmptyCaptureStoreSnapshot();\n    56\t      }\n    57\t      throw error;\n    58\t    }\n    59\t  }\n    60\t\n    61\t  async #writeFile(snapshot: CaptureStoreSnapshot): Promise<void> {\n    62\t    await mkdir(dirname(this.#path), { recursive: true });\n    63\t    const temporaryPath = `${this.#path}.${randomUUID()}.tmp`;\n    64\t    try {\n    65\t      await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\\n`, {\n    66\t        encoding: 'utf8',\n    67\t        flag: 'wx',\n    68\t      });\n    69\t      await rename(temporaryPath, this.#path);\n    70\t    } finally {\n    71\t      await rm(temporaryPath, { force: true });\n    72\t    }\n    73\t  }\n    74\t}\n    75\t\n    76\texport const createLocalCaptureStore = (path: string): CaptureStore => new LocalCaptureStore(path);\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-0346wcH9sEIeJxJQiBiuM9`

```
{
  "output": "   642\t### 12.5 Dev app, deploy, remote parity\n   643\t\n   644\t- **Dev app chartered with three roles** (roles, not features): the local dev loop against both\n   645\t  plugins; the colleague-facing **target-gallery demo** (parallel tabbed sessions across targets);\n   646\t  the **diagnostic probe surface** (provisional affordance renderers now; the exploded-view\n   647\t  instrumented readout when that fog graduates). One agent per target (`ElicitGherkin`,\n   648\t  `ElicitAssurance`): static per-agent tool sets, and the shape Cloudflare forces anyway.\n   649\t- **UI affordance package deferred**, named as intended: React renderers + reply transport over\n   650\t  `@flue/react`; non-React hosts build on `@flue/sdk`. Milestone one keeps renderers in the dev\n   651\t  app.\n   652\t- **Milestone one is local-only**, with **remote-parity constraints pinned now** so nothing\n   653\t  local-only creeps in: one-agent-many-conversations; pinned `agentName`; the storage port owned\n   654\t  outside the plugin (harness-defined, binding-implemented, §9.6); no dynamic agent creation.\n   655\t  Deploy-target choice waits on an infra conversation and blocks nothing here.\n   656\t- **CI smoke** = `vite build` + the simulation suite (no model key, no flake); an optional\n   657\t  secret-gated real-model `flue run` smoke once a provider key exists.\n   658\t\n   659\t### 12.6 Version axes (named, none implemented)\n   660\t\n   661\tAPI contract / plugin implementation / concept-schema / target-schema / persisted state. A change\n    60\t      file.text.includes('expect('),\n    61\t  );\n    62\t\n    63\texport const KNOWN_GAPS: readonly KnownGap[] = [\n    64\t  {\n    65\t    id: 'restart-durability',\n    66\t    spec: '§14.5',\n    67\t    ticket: 'FE-1396',\n    68\t    gap: 'The capture store survives restart (proven in the ticket-13 prototype), but conversation-store durability with a real db.ts has never been driven across a restart.',\n    69\t    closes:\n    70\t      'A test under apps/dev/test that boots the dev app, holds a conversation, restarts the process, and resumes the same conversation id — citing `closes-gap: <this id>`.',\n    71\t    closed: () => closedByTest('apps/dev/test', 'restart-durability'),\n    72\t  },\n    73\t  {\n    74\t    id: 'compaction-vs-durable-history',\n    75\t    spec: '§9.7, §14.5',\n    76\t    ticket: 'FE-1386',\n    77\t    gap: 'No session has been driven across a compaction boundary, so whether Flue compaction leaves the durable entry projection intact is unverified — and evidence pointers bind to that projection.',\n    78\t    closes:\n    79\t      'A test under packages/binding-flue/test driving a session past compaction and asserting every capture’s evidence pointer still resolves through the session-log archive — citing `closes-gap: <this id>`.',\n    80\t    closed: () => closedByTest('packages/binding-flue/test', 'compaction-vs-durable-history'),\n    81\t  },\n    82\t  {\n    83\t    id: 'history-projection-paging',\n    84\t    spec: '§14.5',\n    85\t    ticket: 'FE-1391',\n    86\t    gap: 'The durable-history projection is read over self-HTTP; paging past ~1000 entries and binding base-URL discovery are both untested.',\n    87\t    closes:\n    88\t      'The binding’s history reader covering a paged projection, tested under packages/binding-flue/test — citing `closes-gap: <this id>`.',\n    89\t    closed: () => closedByTest('packages/binding-flue/test', 'history-projection-paging'),\n    90\t  },\n    91\t  {\n    92\t    id: 'interpretation-render-plugin-seam',\n    93\t    spec: '§7.6, §14.5',\n    94\t    ticket: 'FE-1394',\n    95\t    gap: 'The plugin-supplied renderer seam for the interpretation render has never been exercised, because no real pack exists yet.',\n    96\t    closes: 'A plugin supplying a renderer definition typed against its own payload shapes.',\n    97\t    closed: () => {\n    98\t      // Not a filename check: the seam is exercised once the plugin's source\n    99\t      // exports a renderer, wherever that export lives — and an empty file at\n   100\t      // a guessed path exports nothing.\n   101\t      const plugin = workspacePackages().find((pkg) => pkg.name === '@brunch/plugin-gherkin');\n   102\t      return (\n   103\t        plugin !== undefined &&\n   104\t        sourceFiles(plugin).some((file) =>\n   105\t          /export\\s+(?:const|function|class)\\s+\\w*[Rr]enderer/.test(file.text),\n   106\t        )\n   107\t      );\n   108\t    },\n   109\t  },\n   110\t];\n     1\t# The CI smoke (spec §12.5): `vite build` plus the simulation suite — no model\n     2\t# key, no substrate, no flake. An optional secret-gated real-model `flue run`\n     3\t# smoke is named in the spec and deliberately absent until a provider key\n     4\t# exists; the suite asserts that it has not drifted in.\n     5\tname: CI\n     6\t\n     7\ton:\n     8\t  push:\n     9\t    branches: [main]\n    10\t  pull_request:\n    11\t\n    12\tjobs:\n    13\t  smoke:\n    14\t    runs-on: ubuntu-latest\n    15\t    steps:\n    16\t      # Full-SHA pins: org policy refuses tag-pinned actions (the job fails at\n    17\t      # setup before any step runs). Comments carry the tag each SHA matched.\n    18\t      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n    19\t\n    20\t      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2\n    21\t        with:\n    22\t          bun-version: '1.3.14'\n    23\t\n    24\t      - uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4\n    25\t        with:\n    26\t          path: ~/.bun/install/cache\n    27\t          key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}\n    28\t          restore-keys: ${{ runner.os }}-bun-\n    29\t\n    30\t      - run: bun install --frozen-lockfile\n    31\t\n    32\t      - name: Lint\n    33\t        run: bun run lint:check\n    34\t\n    35\t      - name: Formatting\n    36\t        run: bun run fmt:check\n    37\t\n    38\t      - name: Typecheck\n    39\t        run: bun run typecheck\n    40\t\n    41\t      # Reads the repository tree and the harness contract; touches no model\n    42\t      # and no substrate. Three suites, with different jobs: boundaries makes\n    43\t      # the spec §4/§12.2 invariants enforceable rather than aspirational;\n    44\t      # build-artifact checks what was actually emitted, because a Flue build\n    45\t      # that silently drops an agent still exits 0; known-gaps keeps the spec\n    46\t      # §14.5 open items visible and goes red when one closes unremarked.\n    47\t      #\n    48\t      # The build gate lives inside this step: build-artifact's beforeAll\n    49\t      # runs the full build (Flue server environment plus the plain client\n    50\t      # build that @flue/vite does not do) so that `bun test` alone is a\n    51\t      # complete signal. A separate Build step would build the app a second\n    52\t      # time for no additional coverage.\n    53\t      - name: Test\n    54\t        run: bun test\n",
  "exitCode": 0
}
```

## Assistant

### Bottom line

**Keep Flue as this project’s agent substrate.** Tilde is not a like-for-like replacement: Flue supplies the agent runtime, lifecycle, persistence semantics, and deployable server; Tilde supplies a hosted control plane around an agent runtime you build separately—principally with Vercel AI SDK.

Tilde may later be useful alongside Flue for managed MCP tools, credentials, channels, and event ingress. Re-platforming brunch-lite onto it now would add work without resolving the project’s current risks.

_Assessment current to 14 August 2026._

```diagram
Flue
┌────┐    ┌─────────────────────────┐    ┌──────────────┐
│ UI │───▶│ Your Flue runtime/server│───▶│ Model + tools│
└────┘    │ Conversations + recovery│    └──────────────┘
          └────────────┬────────────┘
                       ▼
                  Your database

Tilde
┌────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ Chat / signals │───▶│ Tilde cloud        │───▶│ Your AI SDK endpoint│
└────────────────┘    │ History, credentials│    │ commonly on Vercel │
                      │ tools, routing      │    └──────────┬─────────┘
                      └────────────────────┘               ▼
                                                    Model + agent loop
```

### Comparative assessment

| Concern                     | Flue                                                                                                                                                | Tilde                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What it is**              | Open-source TypeScript agent runtime and application framework.                                                                                     | Hosted agent control plane plus endpoint/client SDKs.                                                                                                                   |
| **Programming model**       | Agent functions and React-like hooks for models, tools, state, lifecycle, data parts, skills and subagents.                                         | Ordinary Vercel AI SDK loops wrapped in a signed `chatKitEndpoint`; Tilde does not own the inference loop.                                                              |
| **Local development**       | `flue run` for one agent; `vite dev` for the application; in-process execution and HTTP tests. No cloud account required beyond the model provider. | Requires a Tilde workspace, registered endpoint, one-time credentials and usually a managed public Cloudflare tunnel. Mission Control provides a useful remote test UI. |
| **Testing**                 | Public in-process and HTTP surfaces; Vitest-based eval guidance; typed runtime events and OTel, Sentry and Braintrust integrations.                 | SDK unit-testability and AI SDK callbacks, but cloud integrations require remote testing. No comparable documented eval or tracing framework.                           |
| **Conversation durability** | Explicit accepted-work and recovery contract; persistent state is atomic with runtime work. External effects remain at-least-once.                  | Hosted ChatKit preserves sessions and queues turns, but the documented SDK supplies no Flue-equivalent durable execution or arbitrary atomic per-conversation state.    |
| **Deployment**              | Builds the actual agent server: Node anywhere or Cloudflare Workers/Durable Objects.                                                                | Tilde deploys/configures control-plane resources. Your agent endpoint must be deployed separately; first-party examples assume Next.js/Vercel.                          |
| **Scaling**                 | Cloudflare gives structural single ownership. Node requires one live owner per conversation even with a shared database.                            | Tilde handles ingress and queue policies, while endpoint execution remains subject to the chosen serverless host’s duration and failure model.                          |
| **Infrastructure as code**  | Conventional source, Vite, database and host configuration; Wrangler migrations on Cloudflare.                                                      | Strong `tilde.state.yaml` export/plan/import story for Tilde resources, but it excludes secrets, credentials, conversation history and application infrastructure.      |
| **Portability**             | Apache-2.0; portable Node hosting, with deeper Cloudflare coupling if that target is chosen.                                                        | Agent/model code remains yours, but history, signals, credentials, MCP catalog and routing depend on Tilde’s SaaS.                                                      |
| **Maturity**                | Current 2.0.3 release is substantial but follows a recent architectural rewrite.                                                                    | Very early: SDK packages are around 0.1–0.2. The public SDK repository is marked `UNLICENSED`; only the examples are MIT.                                               |

Sources: [Flue durability](https://flueframework.com/docs/guide/durability/), [Node deployment](https://flueframework.com/docs/ecosystem/deploy/node/), [Cloudflare deployment](https://flueframework.com/docs/ecosystem/deploy/cloudflare/), [Tilde ChatKit](https://trytilde.ai/docs/chatkit), [dev tunnels](https://trytilde.ai/docs/llms/dev-tunnels.md), [portable state](https://trytilde.ai/docs/terraform), and the [Tilde Harness SDK](https://github.com/trytilde/harness-sdk).

### Import for brunch-lite

The project already isolates Flue correctly rather than allowing it to define the domain model:

- The substrate-neutral harness and plugin boundary is explicit in [CONTEXT.md](file:///Users/lunelson/Code/hashintel/brunch-lite/CONTEXT.md#L17-L27).
- The ten substrate requirements are recorded in the [Flue capability list](file:///Users/lunelson/Code/hashintel/brunch-lite/packages/binding-flue/src/capabilities.ts#L30-L93).
- The actual agent remains thin in [gherkin-elicitor.ts](file:///Users/lunelson/Code/hashintel/brunch-lite/apps/dev/src/agents/gherkin-elicitor.ts#L22-L59).
- The project already has a hermetic faux-model walking skeleton and emitted-artifact checks.

That architecture makes a future Tilde binding possible, but it would be substantial. Tilde does not natively replace several capabilities brunch-lite currently obtains from Flue:

- atomic `usePersistentState`;
- lifecycle hooks and same-response signal injection;
- structured conversation data writers;
- durable accepted-work recovery;
- the current suspend-and-resume protocol.

Tilde ChatKit history could replace the live conversation transport, and Signals would improve managed event ingress. The capture store would nevertheless remain application-owned: Tilde Memory is not a substitute for brunch-lite’s transactional capture store, evidence archive and whole-sweep refusal semantics.

#### Recommended course

1. **Finish milestone one on Flue.** This matches the existing local-only decision in the [spec](file:///Users/lunelson/Code/hashintel/brunch-lite/docs/planning/elicitation-kernel/spec.md#L642-L657).
2. **Deploy the current demo on a single Node host first**, using persistent storage for both SQLite and the JSON capture store. The current application is Node-specific.
3. Before exposing it remotely:
   - close the existing [restart-durability gap](file:///Users/lunelson/Code/hashintel/brunch-lite/test/known-gaps.ts#L63-L80);
   - add authentication and per-conversation authorization—the current mounted Flue route is public;
   - add runtime telemetry;
   - settle persisted-state versioning and backup expectations.
4. **Do not select Cloudflare casually.** Flue conversations map well to Durable Objects, but brunch-lite’s target-document spans multiple sessions. Its capture store therefore still needs a separate cross-conversation persistence design, and the current filesystem-backed implementation cannot move unchanged.
5. **Revisit Tilde only when managed integrations become a concrete requirement.** The lowest-risk experiment would be consuming a Tilde-managed MCP server from the existing Flue agent. That tests its strongest proposition—tool and credential brokerage—without replacing the proven runtime.
6. Treat adoption of the Tilde SDK as requiring a **licensing, data-governance and vendor review** while its package remains unlicensed and its SaaS pricing and contracts are still evolving.
