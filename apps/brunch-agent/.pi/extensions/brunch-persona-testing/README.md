# Browser-visible persona testing

This is the supported persona method: a background Pi actor sends ordinary utterances through the real browser composer. Brunch chooses tools; the panel executes them and shows the growing net and workpiece. No operator-authored mutations, separate headless document or screenshot-driven AI is involved.

From the HASH root in a macOS Herdr terminal:

```sh
yarn brunch:persona --list-cases
yarn brunch:persona --case inventory-purchasing
```

Replace the case name with any listed case. `--help` lists launch and resume options without starting services or inference. If the default dev ports are occupied, leave those services alone and select an unused pair, for example `BRUNCH_CHAT_PORT=4332 BRUNCH_PANEL_PORT=4926 yarn brunch:persona --case truck-fleet-maintenance`.

The command uses the app's normal development configuration: `apps/brunch-agent/.env*`, with process environment taking precedence. Google Chrome in `/Applications`, `pi` and `herdr` on PATH, and installed workspace dependencies are required. Defaults: Brunch `openai/gpt-5.6-sol` at low reasoning, persona `anthropic/claude-sonnet-4-6` at low reasoning. Override without source edits:

```sh
yarn brunch:persona --case inventory-purchasing \
  --brunch-model openai/gpt-5.6-sol --brunch-thinking low \
  --persona-model anthropic/claude-sonnet-4-6 --persona-thinking medium
```

`--help` lists every flag. `OPENAI_API_KEY` is required for the default Brunch model; `ANTHROPIC_API_KEY` is required for the persona. Paid runs still require owner authorization under the current [mission](../../../../../libs/@hashintel/brunch-agent/MISSION.md) and [execution safety](../../../../../libs/@hashintel/brunch-agent/evaluations/README.md#execution-safety); the existence of this command grants none.

**Persona runs have no automatic accounting cutoff.** The launcher disables the campaign accounting wrapper even if `BRUNCH_STEP_A_ACCOUNTING` was inherited. Pi uses its native provider. There are no request reservations, budget/unknown-usage refusals, or `--budget-usd` / `--accept-unknown` flags. Usage remains observational in the native records below; missing usage is not zero cost. There is no fixed turn-count limit. Use Ctrl-C to stop the run.

## Supply a context pack

`--case` accepts a name under `libs/@hashintel/brunch-agent/evaluations/cases/` or an absolute or caller-relative directory. No case-specific code or registry entry is required. That directory supplies exactly two launcher inputs:

- `situation-pack.md`: private actor background, including the person, operational knowledge and interaction posture.
- `opening-message.md`: public first utterance. The launcher sends the text below the first standalone `---` separator, or the entire file if there is no separator. Put any private operator preamble above that separator.

Other files, including reference nets and answer keys, are not loaded. Keep them evaluator-side. An optional `--objective "…"` sets a private run objective without editing the pack; otherwise the actor pursues the person's goal through interview, model review, why questions and a correction, stopping when satisfied or blocked. For a smaller probe, name one incident and its desired outcome rather than requesting exhaustive pack acquisition.

```sh
yarn brunch:persona --case ./path/to/context-pack --objective "Resolve the delayed delivery incident and review the resulting model."
```

## One operation

The maintained [launcher](../../../src/evaluations/persona/launch.ts):

1. Starts its own local Brunch/Petrinaut services with a fresh run-local SQLite database. Occupied ports refuse rather than reuse unverified services; set unused `BRUNCH_CHAT_PORT` and `BRUNCH_PANEL_PORT` values to leave existing services alone.
2. Opens a separate, headed Chrome window and the real Petrinaut AI panel. Its tab title includes `Brunch persona` and the run ID; the launcher prints the exact URL and profile, brings the page forward, then **waits for Enter before sending the public opening**. Start screen recording before pressing Enter in the launcher terminal.
3. Captures the native identity and waits through browser-tool continuations for the completed reply. The default route is `/` with no preloaded net; `--initial-net` is optional staging, not a from-scratch run.
4. Opens an isolated Pi persona in a sibling Herdr pane, with the private pack and actual reply. Only `brunch_turn` is available; the persona cannot read repository files or answer keys.
5. Receives each persona utterance on a private run-local socket and deterministically fills/submits the ordinary composer. The panel streams replies and executes Brunch's browser tools. Only after all admitted continuations settle does `brunch_turn` return the reply. This uses selectors, not screenshot-based AI computer use.

The persona invocation uses Pi's `--approve` for run-local project trust, so it neither asks for trust nor prints the untrusted-project warning. This does not save a persistent trust decision. The explicit persona extension/tool allowlist and `--no-context-files`, `--no-skills`, `--no-prompt-templates` and `--no-extensions` flags remain in place; project trust is not a grant of additional persona tools.

Run the launcher in a Herdr tab with room for its sibling persona pane (two panes total). Keep it running while using the session. Ctrl-C or closing its browser stops the resources the launcher created, including its persona pane; other services are left alone. Run data and browser profiles are retained. Do not submit browser turns concurrently with the persona.

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

A failed or indeterminate bridge turn stops the persona without replay. Cancellation requests the panel's ordinary Stop action. Model-visible tool errors may be repaired by Brunch within the same turn; a bridge failure is not permission to manufacture results or switch identity. The bridge refuses to overwrite a nonempty composer draft.

### Resume the original run

Use `yarn brunch:persona --resume <absolute-run-directory>` with the original `BRUNCH_PANEL_PORT` and an unused `BRUNCH_CHAT_PORT`. The launcher prints the absolute run path; relative paths resolve from the invoking directory. Resume reuses the saved Chrome profile, database and exact Pi session; it does not replay the opening or import a snapshot. Fresh-run options are rejected. Old accounting fields and ledgers are preserved as historical evidence but neither read nor changed to permit continuation.

The panel opens first and the launcher waits for recording readiness **before starting backend recovery or Pi**. Until Enter, the conversation/workpiece may be unavailable because the backend is stopped. After Enter, Flue settles the prior admitted submission; the launcher checks it against Pi's last utterance and refuses mismatches or unanswered browser calls. Pi receives a private reconciliation notice, then authors its next ordinary utterance from the original history. The interrupted utterance is never resent. Missing original stores or ambiguous Pi sessions require operator investigation, not a new identity or automatic replay.

## Retained data

Each launch prints its directory under `apps/brunch-agent/.data-wipe-me/persona-runs/`:

- `run.json`: case/configuration paths, effective Brunch and persona model/effort settings, private socket path and owned process/pane identifiers; no credentials. Resume of older Sonnet-only runs still reads the legacy `model` field.
- `configuration-preflight.json`: request-free Brunch configuration checks. The launcher separately checks Pi's isolated configuration before startup.
- `conversation.db` and adjacent capture files: this run's original local conversation/workpiece stores, retained for original-session reopening. Flue's canonical `assistant_message_completed` records retain provider usage and cost estimates in the conversation stream tables; the projected `evidence/snapshot.json` omits that usage.
- `session.json`: private native browser attachment, not a reusable template or public artifact.
- `persona-input.md` and `pi/`: private actor input and native Pi session, including assistant usage records; `resume-input.md`, when present, is the latest private reconciliation notice.
- `evidence/`: canonical snapshot and derived transcript, tool trace, workpiece and bound `net.json`; refreshed after completed turns and net retention on shutdown.
- Service logs, only for services this launch started.

The persistent Chrome profile lives outside the checkout to avoid source-watcher traversal; its path is in `run.json`. Preserve it for same-profile reopening. These are run outputs, not additional operating procedures. Historical run-specific scripts and handoffs are evidence of past execution, not instructions for new runs; do not copy or rerun them.

Older runs may also contain `usage-ledger.json` and `attempt-ledger.md`. Leave them untouched; new runs do not create them. Native catalogue estimates are not invoices, and interrupted requests may lack final usage. There is no replacement budget ledger or spend-enforcement service.

## Verification and implementation

Before paid observation after a tool/schema/adapter change, run `yarn workspace @apps/brunch-agent test:anthropic-tools` from the HASH root. It rebuilds Brunch, captures its native tool catalogues and checks acceptance through Anthropic's free token-counting API with a synthetic message. It requires the normal development credential but performs no generation, sends no case data and does not settle unknown spend. The [schema acceptance contract](../../../../../libs/@hashintel/brunch-agent/evaluations/README.md#tool-schema-acceptance) owns coverage and limitations.

`test/persona-construction.integration.ts` uses the actual opening helper, registered Pi extension, local socket and ordinary composer against the built ChatAgent and real Chrome with a synthetic provider. It checks empty start, opening-tool continuation, repeated workpiece/net updates, tab switching during a continuation, cancellation and no replay on reload. It also restarts the backend after an aborted turn, reconciles without sending, retains the net/workpiece and executes a new browser-tool turn in the original conversation; mismatched utterances and browser principals refuse. It establishes mechanism viability, not persona fidelity, construction quality, crash recovery at every boundary or an accepted worked example.

The construction proof holds the recording pause and checks that no submission occurs before release. `test/persona-extension-lifecycle.test.ts`, enabled with `PI_PERSONA_CLI=$(command -v pi)`, crosses the installed Pi's flag hydration and tool-registration boundary with a synthetic socket reply and no inference. After building Brunch, `node --experimental-strip-types test/provider-accounting.integration.ts --disabled` checks that native requests proceed with an unusable historical ledger, preserve it untouched and retain usage in the original database. These checks do not prove live-model fidelity or successful generation with the operator's credential.

From the HASH root, build and run the synthetic browser proof:

```sh
yarn workspace @apps/brunch-agent test:persona
```

The launcher composes the [Pi extension](../brunch-persona-testing.ts), [private IPC bridge](../../../src/evaluations/persona/browser-bridge.ts), [browser turn](../../../src/evaluations/persona/browser-turn.ts) and [evidence writer](../../../src/evaluations/persona/proof-artifacts.ts). The extension requires the launcher bridge; evidence retention and browser identity belong to the launcher. Independent headless construction probes under `src/evaluations/runbook/` are not persona launch methods.
