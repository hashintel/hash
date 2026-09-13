# Browser-visible persona testing

From the HASH root in Herdr:

```sh
yarn brunch:persona --case vestera-scheduling
```

`--case` accepts a name under `libs/@hashintel/brunch-agent/evaluations/cases/` or a directory containing `situation-pack.md` and `opening-message.md`. The opening is the text below the first `---` separator, or the entire file if there is no separator. An optional `--objective "…"` supplies a private persona objective. Use `--help` for the command surface.

The command uses the app's normal development configuration: `apps/brunch-agent/.env*`, with process environment taking precedence. Chrome, Pi, Herdr and installed workspace dependencies are required. `BRUNCH_CHAT_MODEL` selects the model; the launcher defaults to `claude-sonnet-4-6`. An already-running app retains its existing configuration. Paid runs require the allocation specified by the current [mission](../../../../../libs/@hashintel/brunch-agent/MISSION.md) and [execution safety](../../../../../libs/@hashintel/brunch-agent/evaluations/README.md#execution-safety); the existence of this command grants none. The launcher omits historical `BRUNCH_STEP_A_ACCOUNTING` instrumentation for processes it starts and does not change a reused server's environment.

## One operation

The maintained [launcher](../../../src/evaluations/persona/launch.ts):

1. Starts missing local Brunch/Petrinaut services with the normal development commands, reusing available services without restarting them.
2. Opens a fresh persistent Chrome profile and sends the case's public opening through the real Petrinaut AI panel.
3. Captures the native identity and waits through browser-tool continuations for the completed reply. The default route is `/` with no preloaded net; `--initial-net` is optional staging, not a from-scratch run.
4. Opens an isolated Pi persona in a sibling Herdr pane, with the private pack and actual reply. Only `brunch_turn` is available; the persona cannot read repository files or answer keys.
5. Receives each persona utterance on a private run-local socket and deterministically fills/submits the ordinary composer. The panel streams replies and executes Brunch's browser tools. Only after all admitted continuations settle does `brunch_turn` return the reply. This uses selectors, not screenshot-based AI computer use.

The persona invocation uses Pi's `--approve` for run-local project trust, so it neither asks for trust nor prints the untrusted-project warning. This does not save a persistent trust decision. The explicit persona extension/tool allowlist and `--no-context-files`, `--no-skills`, `--no-prompt-templates` and `--no-extensions` flags remain in place; project trust is not a grant of additional persona tools.

Keep the launcher running while using the session. Ctrl-C or closing its browser stops the resources the launcher created, including its persona pane; reused services are left alone. Run data and browser profiles are retained. Do not submit browser turns concurrently with the persona.

## What is shared

Pi's private actor session and Brunch's interview are different sessions. The browser and `brunch_turn` share **one Brunch conversation**, native incarnation and document binding. Brunch's canonical history remains authoritative. The persona sees only Brunch's reply text, not the operator-side tool trace. The pack and launch instructions reach Brunch only if the persona puts them in an utterance; [SYSTEM.md](SYSTEM.md) requires natural, gradual disclosure and permits realistic improvisation rather than literal pack reproduction.

The browser displays successful `mutate_workpiece` revisions; `read_workpiece` queries current state. Browser inspection and construction use the same executor as ordinary UI turns. Brunch chooses tools; the persona bridge only submits text and observes completion. It neither fabricates results nor executes mutations independently. The panel's history-replay guard remains intact.

### Read-only browser observation

While the launcher remains running, an operator may attach `cdp-cli` to the Chrome instance it already launched for observation (`tabs`, `snapshot`, `console`, `screenshot`, or DOM-reading `eval`). AI/Workpiece tab switching is supported during persona turns. Keep the document and conversation fixed: do not navigate, reload, edit the model or submit concurrent human turns. The launcher alone drives the composer.

```sh
run=apps/brunch-agent/.data-wipe-me/persona-runs/run-XXXXXX
profile="$(jq -r '.browserProfile' "$run/run.json")"
port="$(head -n 1 "$profile/DevToolsActivePort")"
case "$port" in *[!0-9]* | "") exit 1 ;; esac
cdp="http://127.0.0.1:$port"
cdp-cli --cdp-url "$cdp" tabs
page=REPLACE_WITH_PAGE_ID_FROM_TABS
cdp-cli --cdp-url "$cdp" snapshot "$page"
cdp-cli --cdp-url "$cdp" screenshot "$page" "$run/browser-observer.png"
```

The debugging endpoint controls this browser: keep it loopback-only and keep its run-private profile/control material out of commits and shared proof artifacts. Pair any screenshot with its canonical history observation; the screenshot alone does not establish a settlement, freshness, or utility verdict.

A failed or indeterminate bridge turn stops the persona without replay. Cancellation requests the panel's ordinary Stop action. Inspect canonical history before deciding whether to continue manually or start another run. Model-visible tool errors may be repaired by Brunch within the same turn; a bridge failure is not permission to manufacture results or switch identity. The bridge refuses to overwrite a nonempty composer draft.

## Retained data

Each launch prints its directory under `apps/brunch-agent/.data-wipe-me/persona-runs/`:

- `run.json`: case/configuration paths, private socket path and owned process/pane identifiers; no credentials.
- `session.json`: private native browser attachment, not a reusable template or public artifact.
- `persona-input.md` and `pi/`: private actor input and native Pi session.
- `evidence/`: canonical snapshot and derived transcript, tool trace, workpiece and bound `net.json`; refreshed after completed turns and net retention on shutdown.
- Service logs, only for services this launch started.

The persistent Chrome profile lives outside the checkout to avoid source-watcher traversal; its path is in `run.json`. Preserve it for same-profile reopening. These are run outputs, not additional operating procedures. Historical run-specific scripts and handoffs are evidence of past execution, not instructions for new runs; do not copy or rerun them.

## Verification and implementation

`test/persona-construction.integration.ts` uses the actual opening helper, registered Pi extension, local socket and ordinary composer against the built ChatAgent and real Chrome with a synthetic provider. It checks empty start, opening-tool continuation, repeated workpiece/net updates, tab switching during a continuation, cancellation and no replay on reload. It establishes mechanism viability, not persona fidelity, construction quality or accepted Inventory evidence. The older `test/persona-browser.integration.ts` targets the legacy SDK spectator attachment; it currently fails its old construction-mode validator before reaching the intentionally unanswered browser read. It does not test the launcher's browser-executed path.

From the HASH root, the synthetic proof uses the Brunch endpoint build and Node's TypeScript transform mode:

```sh
VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat turbo run build --filter '@apps/brunch-agent...' --filter '@apps/petrinaut-website...' --env-mode=loose
cd apps/brunch-agent
env -u BRUNCH_STEP_A_ACCOUNTING -u HASH_OTLP_ENDPOINT node --experimental-transform-types test/persona-construction.integration.ts
```

The launcher composes the [Pi extension](../brunch-persona-testing.ts), [private IPC bridge](../../../src/evaluations/persona/browser-bridge.ts), [browser turn](../../../src/evaluations/persona/browser-turn.ts) and [evidence writer](../../../src/evaluations/persona/proof-artifacts.ts). It adds no conversation store or alternate elicitor. `--brunch-browser-session` is the legacy SDK-only attachment; `mock` and `real-headless` remain isolated test hosts. None is combined with the launcher's `--brunch-browser-bridge` executor.
