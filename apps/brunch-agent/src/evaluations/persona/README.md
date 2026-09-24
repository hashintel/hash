# Browser-visible persona testing

A coding agent plays a simulated person and interviews with Brunch through the real browser composer. Brunch chooses tools; the panel executes them and shows the growing net and workpiece. The agent never touches the browser: it runs a small command, the launcher types the message into the panel, waits for Brunch to finish, and prints the reply. You watch the whole conversation in Chrome.

From the HASH root on macOS:

```sh
yarn brunch:persona --list-cases
yarn brunch:persona --case inventory-purchasing --agent claude
```

Replace the case name with any listed case. `--help` lists every option without starting services or inference. If the default dev ports are occupied, leave those services alone and select an unused pair, for example `BRUNCH_CHAT_PORT=4332 BRUNCH_PANEL_PORT=4926 yarn brunch:persona --case truck-fleet-maintenance --agent codex`.

The command uses the app's normal development configuration for Brunch: `apps/brunch-agent/.env*`, with process environment taking precedence. Google Chrome in `/Applications` and installed workspace dependencies are required, plus the agent you select. Brunch defaults to the Petrinaut assistant model; override it with `--brunch-model` and `--brunch-thinking`.

## Choose the persona agent

- `--agent claude|codex|cursor-agent|pi` starts that agent with a one-line launch prompt pointing at the private persona brief. `--persona-model` goes to the agent's own model flag; `--persona-thinking` goes to `pi --thinking` and is accepted only with `--agent pi`.
- `--agent-command '<shell command>'` starts any other agent. Every `{prompt}` in the template becomes the quoted launch prompt, for example `--agent-command 'opencode run {prompt}'`.
- With neither option, the launcher prints the launch prompt and the helper path. Start any agent yourself, in any terminal, and give it that prompt.

The agent runs in a sibling Herdr pane when the launcher runs inside Herdr (`HERDR_ENV=1`); otherwise it takes over the launcher's terminal. It starts in the run directory with your normal shell environment, so it uses its own login and credentials. Its permission prompts are its own: approve the helper command when asked, or allow it in the agent's settings.

The persona agent may be able to read the repository; the brief tells it not to seek answer keys or repository content, and it is asked to play a role rather than being sandboxed. Brunch itself can see only what the persona types.

## How the agent talks to Brunch

Each run writes `<run>/bin/persona`, a helper bound to that run's bridge socket:

```sh
persona say "We lose about a day a week to expediting."   # prints Brunch's reply
persona say <<'EOF'
A longer message, typed as one chat turn.
EOF
persona transcript          # the visible conversation so far
persona state               # run and turn state as JSON
persona end "Goal reached"  # ends the conversation and closes the run
persona rpc '{"type":"get_state"}'   # one raw record in, JSONL records out
```

`say` blocks until Brunch has completely finished, including browser-tool continuations; a turn can take several minutes. Interrupting the command (or a shell-tool timeout) stops Brunch's turn. Errors go to stderr with exit status 1, and the persona is told never to resend a failed message: it may already have been admitted.

The helper speaks a Pi-style JSONL protocol to the bridge. Commands are `{ "id"?, "type", ... }` records: `prompt` (with `message`), `get_state`, `get_transcript` and `end` (with optional `reason`). Each command gets one `response` record with `success` and `data` or `error`. An accepted `prompt` is followed by `turn_start`, `assistant_message` and `turn_settled` events (`replied`, `failed` or `aborted`). Records are framed on LF only. New interaction types, such as structured answers to a question card, are added as new command and event types.

## Persona axes

`--persona-verbosity` accepts `terse`, `default` or `expansive`; `--persona-disclosure` accepts `reticent`, `default` or `forthcoming`. Each non-default setting overrides only that axis in the situation pack; the default leaves the pack's axis unchanged. Verbosity controls answer length and response effort; disclosure controls how readily relevant knowledge is volunteered. Neither reveals private material, merges the actor with the elicitor, or asks the actor to help the interview succeed. Reticence is not hostility, feigned ignorance, or permission to withhold a directly requested answer.

The persona's governing rules are in [`launch/brief/system.md`](launch/brief/system.md) and the axis overrides in [`launch/brief/axes/`](launch/brief/axes). They permit natural, gradual disclosure and realistic improvisation rather than literal pack reproduction.

**Persona runs have no automatic accounting cutoff.** The launcher disables the campaign accounting wrapper for Brunch even if `BRUNCH_STEP_A_ACCOUNTING` was inherited. There is no fixed turn-count limit. A live-provider run requires explicit model and spend authorization; the existence of this command grants none.

## Supply a context pack

`--case` accepts a name under `libs/@hashintel/brunch-agent/evaluations/cases/` or an absolute or caller-relative directory. That directory supplies exactly two launcher inputs:

- `situation-pack.md`: private actor background, including the person, operational knowledge and interaction posture.
- `opening-message.md`: public first utterance. The launcher sends the text below the first standalone `---` separator, or the entire file if there is no separator. Put any private operator preamble above that separator.

Other files, including reference nets and answer keys, are not loaded. An optional `--objective "…"` sets a private fresh-run objective without editing the pack; otherwise the actor pursues the person's goal through interview, model review, why questions and a correction, stopping when satisfied or blocked. The objective is written into the run's private brief but not into `run.json`, and the launcher does not reapply it on resume.

## One operation

The [launcher](launch.ts):

1. Starts its own local Brunch/Petrinaut services with a fresh run-local SQLite database. Occupied ports refuse rather than reuse unverified services.
2. Opens a separate, headed Chrome window on the real Petrinaut AI panel. On an interactive terminal it prints the URL and profile and **waits for Enter before sending the public opening**, so you can start screen recording. `--skip-recording-pause` skips the wait; it is skipped automatically when stdin is not a terminal, for example when an agent runs the launcher.
3. Sends the opening and waits through browser-tool continuations for the completed reply. The default route is `/` with no preloaded net; `--initial-net` is optional staging, not a from-scratch run.
4. Opens the browser bridge, writes `bin/persona` and the private `persona-brief.md` (rules, axes, helper guide, objective, the opening exchange and the situation pack), then starts the agent.
5. Types each `say` message into the ordinary composer, waits until every admitted continuation settles, and returns the reply. This uses selectors, not screenshot-based AI computer use.

Ctrl-C in the launcher, closing its browser, `persona end`, or the foreground agent exiting stops the resources the launcher created; other services are left alone. After `end` the agent's Herdr pane stays open so it can report to you; after Ctrl-C the launcher closes it. When the agent shares the launcher's terminal, Ctrl-C belongs to the agent; quit the agent to stop the run. Do not submit browser turns concurrently with the persona.

## What is shared

The agent's session and Brunch's interview are different conversations. The browser and the helper share **one Brunch conversation**, native incarnation and document binding; Brunch's canonical history remains authoritative. The persona sees only Brunch's reply prose, not the tool trace. The pack and brief reach Brunch only if the persona puts them in an utterance.

The bridge only submits text and observes completion. It neither fabricates results nor executes mutations independently, and it refuses to overwrite a nonempty composer draft. The panel's history-replay guard remains intact.

### Read-only browser observation

While the launcher remains running, an operator may attach `cdp-cli` to the Chrome instance it launched for observation (`tabs`, `snapshot`, `console`, `screenshot`, or DOM-reading `eval`). Chat/Ledger tab switching is supported during persona turns. Keep the document and conversation fixed: do not navigate, reload, edit the model or submit concurrent human turns.

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

The debugging endpoint controls this browser: keep it loopback-only and keep its run-private profile out of commits and shared proof artifacts.

### Resume the original run

Use `yarn brunch:persona --resume <run-directory>` with the original `BRUNCH_PANEL_PORT` and an unused `BRUNCH_CHAT_PORT`. Resume reuses the saved Chrome profile, database and effective axis settings; it does not replay the opening or import a snapshot. It starts a **fresh** persona agent (the original one unless you pass agent options) with `resume-brief.md`, which points back to the original brief and tells it to read `persona transcript` first. Fresh-run options, including `--objective` and axis flags, are rejected.

The panel opens first and the launcher waits for recording readiness **before starting backend recovery or the agent**. After Enter, Flue settles the prior admitted submission; the launcher checks it against the last admitted utterance in `bridge-log.jsonl` and refuses mismatches or unanswered browser calls. The interrupted utterance is never resent. Runs made with the earlier Pi extension launcher have no bridge log and cannot be resumed.

## Retained data

Each launch prints its directory under `apps/brunch-agent/.data-wipe-me/persona-runs/`:

- `run.json`: case and configuration paths, effective Brunch model settings, persona axes, the selected persona agent, the bridge socket path and owned process/pane identifiers; no credentials.
- `configuration-preflight.json`: request-free Brunch configuration checks.
- `conversation.db`: this run's local Flue database, including conversation history, persistent workpiece state and provider usage records.
- `session.json`: private native browser attachment, not a reusable template or public artifact.
- `persona-brief.md`, `resume-brief.md` and `bin/persona`: the agent's private brief, latest resume notice and bridge helper.
- `bridge-log.jsonl`: every utterance Brunch admitted, used to reconcile resume.
- `evidence/`: canonical snapshot and derived transcript, tool trace, workpiece and bound `net.json`; refreshed after completed turns and on shutdown.
- Service logs, only for services this launch started.

The persistent Chrome profile lives outside the checkout; its path is in `run.json`. Older runs may also contain `pi/`, `persona-input.md`, `usage-ledger.json` or `attempt-ledger.md`; leave them untouched as historical evidence.

## Verification

The unit tests cover the JSONL framing, the bridge and helper round trip, agent command construction, the brief and resume reconciliation inputs:

```sh
yarn workspace @apps/brunch-agent test:unit
```

For Anthropic schema acceptance after a tool, schema, or adapter change, run `yarn workspace @apps/brunch-agent test:anthropic-tools`. It checks the captured Brunch tool catalogues through Anthropic's free token-counting API and performs no generation.
