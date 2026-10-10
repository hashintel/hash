# Browser-visible persona testing

A coding agent plays a simulated person who talks with Brunch through the real browser composer. Brunch chooses tools; the panel executes them and shows the growing net and Ledger. The agent never touches the browser: it runs a small command, the launcher types the message into the panel, waits for Brunch to finish, and prints the reply. You watch the whole conversation in Chrome.

From the HASH root on macOS:

```sh
yarn brunch:persona --list-cases
yarn brunch:persona --case inventory-purchasing --agent claude
```

Replace the case name with any listed case. `--help` lists every option without starting services or inference. If the default dev ports are occupied, leave those services alone and select an unused pair, for example `BRUNCH_CHAT_PORT=4332 BRUNCH_PANEL_PORT=4926 yarn brunch:persona --case truck-fleet-maintenance --agent codex`.

The command uses the app's normal development configuration for Brunch: `apps/brunch-agent/.env*`, with process environment taking precedence. Google Chrome in `/Applications` and installed workspace dependencies are required, plus the agent you select. Brunch defaults to the Petrinaut assistant model; override it with `--brunch-model` and `--brunch-thinking`.

## The persona

The persona is a naive domain expert. It knows its own work, as its case's situation pack describes it, and it wants the conversation to help, but it knows nothing about Brunch's aims or how an interview should go. It answers the question it was asked, briefly, in the way the pack says the person talks. Its rules are in [`launch/brief/system.md`](launch/brief/system.md).

Brunch sees only what the persona types. The pack is legitimately the persona's own knowledge, so the persona needs no sandbox; the agent starts in a temporary directory only so that the repository's development `AGENTS.md` and `CLAUDE.md` files stay out of its context.

## Choose the persona agent

- `--agent claude|codex|cursor-agent|pi` starts that agent with a one-line launch prompt pointing at the private persona brief. `--persona-model` goes to the agent's own model flag; `--persona-thinking` goes to `pi --thinking` and is accepted only with `--agent pi`.
- `--agent-command '<shell command>'` starts any other agent. Every `{prompt}` in the template becomes the quoted launch prompt, for example `--agent-command 'opencode run {prompt}'`.
- With neither option, the launcher prints the launch prompt and the helper path. Start any agent yourself, in any terminal, and give it that prompt.

The agent runs in a sibling Herdr pane when the launcher runs inside Herdr (`HERDR_ENV=1`); otherwise it takes over the launcher's terminal. It starts in a fresh directory under the system temporary directory, outside the repository. It keeps your normal shell environment, so it uses its own login, credentials and user-level instructions. Its permission prompts are its own: approve reading the brief and running the helper command when asked, or allow them in the agent's settings.

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

## Stopping

The persona stops by its own rule: when the person has what they came for, when the conversation is going nowhere, or when they run out of patience. It then runs `persona end` and tells you why it stopped. You, or an agent supervising the run, can force a stop at any point, for example after a chosen number of turns, with `<run>/bin/persona end`, or with Ctrl-C in the launcher when the agent runs in its own pane.

**Persona runs have no automatic accounting cutoff.** The launcher disables the campaign accounting wrapper for Brunch even if `BRUNCH_STEP_A_ACCOUNTING` was inherited. There is no built-in turn-count limit. A live-provider run requires explicit model and spend authorization; the existence of this command grants none.

## Compare guidance

`--guidance baseline|replacement|feedback|identity|manual|receipt` selects one guidance owner for the whole run; the default is `baseline`. It sets `BRUNCH_GUIDANCE_VARIANT` on the owned backend, not a persona instruction.

| Arm               | Model-facing guidance                                                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — `baseline`    | Existing package prompts and skills, including build-first corrections                                                                                                                                                                                                                                          |
| B — `replacement` | App-owned always-on guidance, `eliciting` and `constructing` skills, and typed epistemic guidance on the Ledger commit tool                                                                                                                                                                                     |
| C — `feedback`    | Exactly B plus the always-on account–draft feedback policy: choose asking, repairing, checking or deferring by consequence for the purpose and wider account                                                                                                                                                    |
| D — `identity`    | Exactly C with the identity-addressed Ledger (Notes filed against the model's identities and relationships, always typed, each naming the coverage dimensions it serves, with coverage returned on every commit) and its low-resolution instruction                                                             |
| E — `manual`      | A hand-edited arm, copied from D as of round 4c: its own system prompt, instructions, skills and Ledger under `chat-agent/guidance/manual/`, the Ledger including its tools, schema, commit rules and readers                                                                                                   |
| F — `receipt`     | D as of round 4c, self-contained like E, except that every turn ends with one question chosen from the commit receipt's coverage, the receipt lists the five missing needs nearest a goal through the relationships, and a goal's measure and an activity's capacity replace the needs round 4c showed as noise |

E and F each mount only their own copies under `chat-agent/guidance/<arm>/`, so editing one changes no other arm, and the other arms' source hashes leave them out. The copies cover everything the model reads: the system prompt, skills and instructions, and the Ledger itself. Where the other arms take the browser-tool, `query_basis`, Petrinaut capability and experiment-drafting instructions from `agent.ts` and the SDCPN plugin, a self-contained arm mounts its own copy or nothing: F copies all four, while E mounts none and carries them in its `petrinaut` and `modelling` skills and its tool descriptions. Each arm defines its own `ledger_commit` and `ledger_compile` tools over its own Ledger — the receipt arm's under `receipt/ledger-tools.ts` and `receipt/ledger/` (the Note and change schemas, which needs count as met, and how the coverage receipt and the map render), the manual arm's in the SDCPN plugin's `ledger2` slice (`packages/plugin-sdcpn/src/ledger2/`: route-encoded record entries, the fold that assigns queue-aligned record IDs on commit, and the sectioned projection its map renders), which lives there so the website can render it and which the manual arm's source hash includes, with its tools under `manual/tools/ledger.ts` — each defining what a commit stores or refuses and how history is read back. It also defines its own `query_basis` (`receipt/query-basis-tool.ts`, `manual/tools/query-basis.ts`), which reads the arm's Ledger; only the net-change history it reads alongside stays shared. The persona evidence reads an arm's Ledger with that arm's reader (`ledger-evidence.ts`), so an arm can change its Ledger's shape without breaking it; F's `ledger.md` is therefore the arm's own full map with its coverage terms, E's is its agent-skin projection, and A–D's omits coverage. Their tests check wiring, not wording. What stays shared is the tool names, which the host's policy keys on; the Petrinaut, draft and `ping` tools; and the website panel, which reads a conversation's Ledger with the package's reader, or with `ledger2`'s when it holds no Notes, and may misrender the receipt arm, whose Ledger has diverged. The panel is not evidence.

A, B and C keep the same tool implementations and schemas; D keeps the same tool names but changes the Ledger's schema, so C versus D compares a Ledger design together with its guidance. `BRUNCH_LEDGER_NOTES` does not apply to D. C isolates the feedback addition; A versus B compares a bundle of placement and content changes, not heading words alone. Legacy package guidance remains solely as the control; it is not mounted alongside B or C. Native Flue skill references package and load the candidate resources.

Use the existing persona launcher for each arm. From the repository root:

```sh
# Run only after live inference is authorised; repeat with replacement and feedback.
BRUNCH_LEDGER_NOTES=typed yarn brunch:persona --case inventory-purchasing \
  --guidance baseline \
  --brunch-model openai/gpt-5.5-2026-04-23 --brunch-thinking medium \
  --agent pi --persona-model anthropic/claude-sonnet-4-6 --persona-thinking medium
```

For a matched comparison keep the case, objective, initial net, Ledger shape, Brunch model/thinking and persona model/thinking identical; vary only `--guidance`. Every run gets a fresh database, browser profile and conversation. Do not edit guidance between arms. `run.json` records selected source hashes, the case hash and model settings; guidance drift is checked before subsequent persona turns. These are source fingerprints, not a complete environment snapshot. Resumes restore the saved arm and refuse changed guidance.

Inspect the retained dialogue, Ledger and net together. The observation cases are early purpose/breadth versus local fixation, connected resource/calendar/release meaning, and correction versus contextual coexistence. They are situations to look for across arms, not extra prompt variants or a questionnaire for the persona. Check when building begins, whether new meaning reshapes the draft, and whether a construction-led question should instead have been a repair, check or deferral. Include the countercase where a local clarification is the right next move. Tool/skill tests establish wiring only; the live comparison must establish any behavioural improvement.

## Supply a context pack

`--case` accepts a name under `libs/@hashintel/brunch-agent/evaluations/cases/` or an absolute or caller-relative directory. That directory supplies exactly two launcher inputs:

- `situation-pack.md`: the person's background: who they are, what they know about their work, what they want and how they talk.
- `opening-message.md`: the person's first message, sent as the whole file, trimmed.

Other files in the directory are not loaded. A case may keep a `key.md` beside them for scoring a run: what the person believes, where the pack puts that under pressure, what should change in Brunch's work when it is caught, and what must stay unknown. A key grades what Brunch tells apart, respects or keeps conditional, not the order in which it builds. The persona never sees it. An optional `--objective "…"` gives the person a private aim for this run without editing the pack. Phrase it as the person would think of it (for example "find out whether a second night shift would clear the backlog"), not as interview steps. Without it, the person's goal comes from the pack. The objective is written into the run's private brief but not into `run.json`, and the launcher does not reapply it on resume.

## One operation

The [launcher](launch.ts):

1. Starts its own local Brunch/Petrinaut services with a fresh run-local SQLite database. Occupied ports refuse rather than reuse unverified services.
2. Opens a separate, headed Chrome window on the real Petrinaut AI panel. On an interactive terminal it prints the URL and profile and **waits for Enter before sending the public opening**, so you can start screen recording. `--skip-recording-pause` skips the wait; it is skipped automatically when stdin is not a terminal, for example when an agent runs the launcher.
3. Sends the opening and waits through browser-tool continuations for the completed reply. The default route is `/` with no preloaded net; `--initial-net` is optional staging, not a from-scratch run.
4. Opens the browser bridge, writes `bin/persona` and the private `persona-brief.md` (role, command guide, any objective, the opening exchange and the situation pack), then starts the agent.
5. Types each `say` message into the ordinary composer, waits until every admitted continuation settles, and returns the reply. This uses selectors, not screenshot-based AI computer use.

Ctrl-C in the launcher, closing its browser, `persona end`, or the foreground agent exiting stops the resources the launcher created; other services are left alone. After `end` the agent's Herdr pane stays open so it can report to you; after Ctrl-C the launcher closes it. When the agent shares the launcher's terminal, Ctrl-C belongs to the agent; quit the agent to stop the run. Do not submit browser turns concurrently with the persona.

## What is shared

The agent's session and Brunch's interview are different conversations. The browser and the helper share **one Brunch conversation** and document binding; Brunch's canonical history remains authoritative. The persona sees only Brunch's reply prose, not the tool trace.

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

### Resume the Brunch conversation

Use `yarn brunch:persona --resume <run-directory>` with the original `BRUNCH_PANEL_PORT` and an unused `BRUNCH_CHAT_PORT`. Resume reuses the saved Chrome profile, database and settings; it does not replay the opening or import a snapshot. It starts a **fresh** persona agent (the original agent and model unless you pass agent options) with `resume-brief.md`, which points back to the original brief and tells it to read `persona transcript` first. The earlier agent's own session is not resumed, so a resumed run is one Brunch conversation played by successive persona sessions, possibly on different models; `bridge-log.jsonl` records which agent settings wrote each persona utterance. Fresh-run options, including `--objective`, are rejected.

The panel opens first and the launcher waits for recording readiness **before starting backend recovery or the agent**. After Enter, Flue settles the prior admitted submission; the launcher checks it against the last admitted utterance in `bridge-log.jsonl` and refuses mismatches or unanswered browser calls. The interrupted utterance is never resent. Runs made with the earlier Pi extension launcher have no bridge log and cannot be resumed.

## Retained data

Each launch prints its directory under `apps/brunch-agent/.data-wipe-me/persona-runs/`:

- `run.json`: case and configuration paths, effective Brunch model settings, the selected persona agent, the bridge socket path and owned process/pane identifiers; no credentials.
- `configuration-preflight.json`: request-free Brunch configuration checks.
- `conversation.db`: this run's local Flue database, including conversation history, including the Ledger's commits, and provider usage records.
- `session.json`: private native browser attachment, not a reusable template or public artifact.
- `persona-brief.md`, `resume-brief.md` and `bin/persona`: the agent's private brief, latest resume notice and bridge helper.
- `bridge-log.jsonl`: every utterance Brunch admitted, with the persona agent settings that wrote each persona utterance (empty when you started the agent yourself), used to reconcile resume.
- `evidence/`: canonical snapshot and derived transcript, tool trace, compiled `ledger.md` with its `ledger.json` commits, and bound `net.json`; refreshed after completed turns and on shutdown.
- Service logs, only for services this launch started.

The persistent Chrome profile lives outside the checkout; its path is in `run.json`. Older runs may also contain `pi/`, `persona-input.md`, `usage-ledger.json` or `attempt-ledger.md`; leave them untouched as historical evidence.

## Verification

The unit tests cover the JSONL framing, the bridge and helper round trip, agent command construction, the brief and resume reconciliation inputs:

```sh
yarn workspace @apps/brunch-agent test:unit
```

For Anthropic schema acceptance after a tool, schema, or adapter change, run `yarn workspace @apps/brunch-agent test:anthropic-tools`. It checks the captured Brunch tool catalogues through Anthropic's free token-counting API and performs no generation.
