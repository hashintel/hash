# Browser-visible persona testing

From the HASH root in Herdr:

```sh
yarn brunch:persona --case vestera-scheduling
```

`--case` accepts a name under `libs/@hashintel/brunch-agent/evaluations/cases/` or a directory containing `situation-pack.md` and `opening-message.md`. The opening is the text below the first `---` separator, or the entire file if there is no separator. An optional `--objective "…"` supplies a private persona objective. Use `--help` for the command surface.

The command uses the app's normal development configuration: `apps/brunch-agent/.env*`, with process environment taking precedence. Chrome, Pi, Herdr and installed workspace dependencies are required. `BRUNCH_CHAT_MODEL` selects the model; the launcher defaults to `claude-sonnet-4-6`. An already-running app retains its existing configuration. There is no special Docker database, copied credential file or per-run launch script. The current [mission](../../../../../libs/@hashintel/brunch-agent/MISSION.md) authorizes this unmetered local route; the launcher omits `BRUNCH_STEP_A_ACCOUNTING` for processes it starts and does not change a reused server's environment.

## One operation

The maintained [launcher](../../../src/evaluations/persona/launch.ts):

1. Starts missing local Brunch/Petrinaut services with the normal development commands, reusing available services without restarting them.
2. Opens a fresh persistent Chrome profile and sends the case's public opening through the real Petrinaut AI panel.
3. Captures only that request's native browser attachment fields and admission UID, then waits for its exact Brunch reply.
4. Opens an isolated Pi persona in a sibling Herdr pane, with the private pack and actual reply. Only `brunch_turn` is available; the persona cannot read repository files or answer keys.
5. Keeps the browser open to follow the same conversation and workpiece. After the persona stops, the ordinary browser composer can continue that conversation.

Keep the launcher running while using the session. Ctrl-C or closing its browser stops the resources the launcher created, including its persona pane; reused services are left alone. Run data and browser profiles are retained. Do not submit browser turns concurrently with the persona.

## What is shared

Pi's private actor session and Brunch's interview are different sessions. The browser and `brunch_turn` share **one Brunch conversation**, native incarnation and document binding. Brunch's canonical history remains authoritative. The persona sees only Brunch's reply text, not the operator-side tool trace. The pack and launch instructions reach Brunch only if the persona puts them in an utterance; [SYSTEM.md](SYSTEM.md) requires natural, gradual disclosure and permits realistic improvisation rather than literal pack reproduction.

The browser displays the Markdown returned by a successful `update_workpiece` as a recorded settlement, without waiting for a second model-chosen query. An actual `brunch_workpiece` query supersedes that display with queried state. Recorded output is not a new current-state authority or proof of freshness after reopening; pointer-only historical outputs are not reconstructed from their inputs. This route supports elicitation and workpiece updates, **not persona-driven browser construction**: external client-tool requests stop with an explicit error. There is no mock/headless substitution. Normal locally submitted UI turns retain their browser execution path.

### Read-only browser observation

While the launcher remains running, an operator may attach `cdp-cli` to the Chrome instance it already launched. This is observation of the same browser, not another browser, conversation, runner or UI submission. While the persona is active, use read-only observation (`tabs`, `snapshot`, `console`, `screenshot`, or DOM-reading `eval`); do not mutate the page, navigate, click, fill, reload, close tabs or submit a browser turn.

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

A failed or indeterminate admitted submission stops the persona without replay. Inspect its canonical history before deciding whether to continue or start another run. A tool failure is not a reason to rewrite testimony, manufacture results or silently switch identity. The ordinary UI may restore a failed message as a draft: clear and verify the exact composer text before submitting a different turn. A browser tool's fill receipt does not prove that it replaced the existing draft.

## Retained data

Each launch prints its directory under `apps/brunch-agent/.data-wipe-me/persona-runs/`:

- `run.json`: case/configuration paths and owned process/pane identifiers; no credentials.
- `session.json`: private native browser attachment, not a reusable template or public artifact.
- `persona-input.md` and `pi/`: private actor input and native Pi session.
- `evidence/`: the existing bridge's canonical snapshot and derived transcript, tool trace and workpiece.
- Service logs, only for services this launch started.

The persistent Chrome profile lives outside the checkout to avoid source-watcher traversal; its path is in `run.json`. Preserve it for same-profile reopening. These are run outputs, not additional operating procedures. Historical run-specific scripts and handoffs are evidence of past execution, not instructions for new runs; do not copy or rerun them.

## Verification and implementation

`test/persona-browser.integration.ts` uses the launcher's actual browser initialization, then the registered persona extension against the built ChatAgent and real Chrome with a synthetic provider. It verifies shared identity, live messages, two source-linked workpiece revisions displayed without post-settlement queries, mismatch refusal, and an unanswered persona browser read retained across ordinary UI continuation. After reload the UI queries current workpiece state, obtains a fresh browser observation and performs a parameter mutation without completing the old read. It establishes plumbing, not real-persona fidelity or usefulness. Actual persona sessions need separate human assessment.

From the HASH root, the macOS loopback-only synthetic proof uses the Brunch endpoint build and Node's TypeScript transform mode:

```sh
VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat turbo run build --filter @apps/brunch-agent --filter @apps/petrinaut-website
cd apps/brunch-agent
sandbox-exec -f ../../libs/@hashintel/brunch-agent/evaluations/protocols/network-guard/loopback-only.sb env -u BRUNCH_STEP_A_ACCOUNTING -u HASH_OTLP_ENDPOINT node --experimental-transform-types test/persona-browser.integration.ts
```

The launcher composes the existing [Pi extension](../brunch-persona-testing.ts), [browser attachment validator](../../../src/evaluations/persona/browser-session.ts), [turn bridge](../../../src/evaluations/persona/brunch-turn.ts) and [evidence writer](../../../src/evaluations/persona/proof-artifacts.ts). It adds no conversation store or alternate elicitor. The extension's mock and real-headless hosts remain supported test mechanisms in `client-tool-hosts.ts`; they are not alternate ways to run this browser-visible procedure. Historical accounting instrumentation remains opt-in code for its named diagnostic instruments, not a launch prerequisite.
