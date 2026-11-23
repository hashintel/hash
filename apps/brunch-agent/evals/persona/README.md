# Browser-visible persona testing

A coding agent plays a simulated person who talks with Brunch through the real browser composer, in the Petrinaut website or in the HASH app. Brunch chooses tools; the panel executes them and shows the growing net and Ledger. The agent never touches the browser: it runs a small command, the launcher types the message into the panel, waits for Brunch to finish, and prints the reply. You watch the whole conversation in Chrome.

From the HASH root on macOS:

```sh
yarn brunch:persona --list-cases
yarn brunch:persona --case inventory-purchasing --agent claude
```

Replace the case name with any listed case. `--help` lists every option without starting services or inference. Each run takes two free ports, so it runs beside other slots' servers. To choose them yourself, set both, for example `BRUNCH_CHAT_PORT=4332 BRUNCH_PANEL_PORT=4926 yarn brunch:persona --case truck-fleet-maintenance --agent codex`. When [portless](https://portless.sh) is installed, the launcher also names the run's panel in `portless list` as `https://<run>.persona.localhost` (for example `run-p1wuhd.persona.localhost`) and removes the name when the run stops. That address is a separate origin from the launcher's Chrome window, so it shows the website without the run's staged net and settings: use it to find a run, and drive the run in the launcher's window.

The command uses the app's normal development configuration for Brunch: `apps/brunch-agent/.env*`, with process environment taking precedence. Google Chrome in `/Applications` and installed workspace dependencies are required, plus the agent you select. Brunch defaults to its own default model (`openai/gpt-6.1-sol` at medium thinking); override it with `--brunch-model` and `--brunch-thinking`.

## Hosts

`--host` chooses the app whose page the persona types into. The launcher owns everything else (the persona agent, the bridge, each turn, stopping, evidence and the run packet), and a host ([`host.ts`](host.ts)) owns what differs between apps: the services the run starts, how its page reaches a shown assistant, and what the app holds that evidence keeps.

- `website` (the default, [`hosts/website.ts`](hosts/website.ts)) starts its own Brunch chat and panel servers on free ports and talks to the Petrinaut agent. The website keeps its nets and settings in the panel origin's `localStorage`. `--route` and `--interview-length` are its options.
- `hash` ([`hosts/hash.ts`](hosts/hash.ts)) talks to the HASH agent in the HASH app's process editor. The HASH stack is shared across the machine, so the launcher only checks it: start `yarn compose up`, `yarn start:graph`, `yarn dev:backend:api` and `HASH_BRUNCH_AGENT_ORIGIN=http://localhost:4321 yarn dev:frontend` yourself. The frontend fixes that Brunch origin when it starts, so the run starts its own Brunch server there and refuses when one is already answering: one HASH run uses the machine at a time. The launcher signs in the seeded user `alice@example.com` through the sign-in form, saves a new process in their web (empty, or from `--initial-net`) and opens it. Each run leaves that process behind, named for its case and run (`inventory-purchasing · persona run-p1WuHd`), with every version the agent saved; `run.json` records its `entityUuid`.

```sh
yarn brunch:persona --host hash --case inventory-purchasing --agent claude
```

The launcher reads Brunch's conversation with the identity the page used. The website sends its actor in a header; HASH names the actor from the session cookie, so the launcher sends the cookies of the browser's latest submission, and on resume those the profile holds. They are kept in memory and never written to the run.

## The persona

The persona is a naive domain expert. It knows its own work, as its case's situation pack describes it, and it wants the conversation to help, but it knows nothing about Brunch's aims or how an interview should go. It answers the question it was asked, briefly, in the way the pack says the person talks. Its rules are in [`launch/brief/system.md`](launch/brief/system.md).

Brunch sees only what the persona types. The pack is legitimately the persona's own knowledge, so the persona needs no sandbox; the agent starts in a temporary directory only so that the repository's development `AGENTS.md` and `CLAUDE.md` files stay out of its context.

## Choose the persona driver

Use at most one of `--agent`, `--agent-command`, or `--script`:

- `--agent claude|codex|cursor-agent|pi` starts that agent with a one-line launch prompt pointing at the private persona brief. `--persona-model` goes to the agent's own model flag; `--persona-thinking` goes to `pi --thinking` and is accepted only with `--agent pi`.
- `--agent-command '<shell command>'` starts any other agent. Every `{prompt}` in the template becomes the quoted launch prompt, for example `--agent-command 'opencode run {prompt}'`.
- `--script <file>` drives turns non-interactively from a declarative JSON script without launching an LLM persona, writing a persona brief, or requiring a TTY or Herdr. Use it for deterministic smoke tests and reproducible bug repros on either host:

```json
{
  "steps": [
    { "type": "open" },
    { "type": "say", "message": "We run two shifts, 40 hours each." },
    { "type": "end", "reason": "Smoke complete" }
  ]
}
```

  Supported step types are `open` (sends the case's opening; requires `--case`), `say` (`message`, nonblank), and `end` (optional `reason`). `--case` may be omitted when the script has no `open` step; `--objective` is rejected with `--script`. The runner sends each step in order over the browser bridge without reading or adapting to Brunch's replies. If any step fails, the run stops immediately, logs `script-step-failed` in `bridge-log.jsonl`, writes the run packet, and exits non-zero.

- With none of those options (`external` driver), the launcher prints the launch prompt and the helper path. Start any agent yourself, in any terminal, and give it that prompt.

Agents (`--agent` / `--agent-command`) run in a sibling Herdr pane when the launcher runs inside Herdr (`HERDR_ENV=1`); otherwise they take over the launcher's terminal. They start in a fresh directory under the system temporary directory, outside the repository, keeping your normal shell environment so they use their own login, credentials and user-level instructions. Their permission prompts are their own: approve reading the brief and running the helper command when asked, or allow them in the agent's settings.

## How the agent talks to Brunch

Each run writes `<run>/bin/persona`, a helper bound to that run's bridge socket:

```sh
persona open                # sends the case's opening; prints it and Brunch's reply
persona say "We lose about a day a week to expediting."   # prints Brunch's reply
persona say <<'EOF'
A longer message, typed as one chat turn.
EOF
persona answer "Stays open" "" "About nine days."   # one answer per docked question
persona transcript          # the visible conversation so far
persona state               # run and turn state as JSON
persona end "Goal reached"  # ends the conversation and closes the run
persona rpc '{"type":"get_state"}'   # one raw record in, JSONL records out
```

The persona starts the conversation itself with `open`, which sends the case's opening exactly as written, so the opening exchange is in its own context and the time before its second message is its own. The bridge refuses `say` until `open` has been admitted, and refuses `open` after that and on resume. `open` and `say` block until Brunch has completely finished, including browser-tool continuations; a turn can take several minutes. Interrupting the command (or a shell-tool timeout) stops Brunch's turn. Errors go to stderr with exit status 1, and the persona is told never to resend a failed message: it may already have been admitted.

The helper speaks a Pi-style JSONL protocol to the bridge. Commands are `{ "id"?, "type", ... }` records: `open`, `prompt` (with `message`), `answer` (with `answers`), `get_state`, `get_transcript` and `end` (with optional `reason`). Each command gets one `response` record with `success` and `data` or `error`. An accepted `open` or `prompt` is followed by `turn_start`, `assistant_message` and `turn_settled` events (`replied`, `failed` or `aborted`). Records are framed on LF only. New interaction types are added as new command and event types.

### Questions docked on the composer

When a reply offers quick answers, the panel docks its questions on the composer one at a time, and the composer's Send moves to the next question rather than sending. So the persona gets the whole set at once and answers it at once:

- The `assistant_message` event carries `questions`: each question's label, wording and kind, with its options (label and fuller value) or its value fields. The helper prints them as a numbered list after the reply.
- `answer` (with `answers`, one string per question in order) drives the dock as a person would: it clicks the option an answer names by its label, types any other answer, presses Send between questions, and sends them all from the last. A blank answer skips its question with the dock's arrow. The number of answers must match the number of docked questions.
- `say` still answers a single docked question, since the composer's text is that question's answer. With several docked it is refused before anything is typed.

`bridge-log.jsonl` records the text Brunch received, which for `answer` is the one message the panel composed.

## Stopping

The persona stops by its own rule: when the person has what they came for, when the conversation is going nowhere, or when they run out of patience. It then runs `persona end` and tells you why it stopped. You, or an agent supervising the run, can force a stop at any point, for example after a chosen number of turns, with `<run>/bin/persona end`, or with Ctrl-C in the launcher when the agent runs in its own pane.

**Persona runs have no automatic accounting cutoff.** The launcher disables the campaign accounting wrapper for Brunch even if `BRUNCH_STEP_A_ACCOUNTING` was inherited. `--max-messages <n>` stops the run once Brunch has replied to the persona's nth message; the case's opening is not counted, and the run packet is written as on any other stop. With `--hold`, the persona stopping, whether at that limit, by `persona end` or by its agent exiting, closes nothing: the bridge refuses any further persona messages and you carry on in the same Chrome window and conversation. Ctrl-C in the launcher (once a foreground agent has exited) or closing Chrome then stops the run as usual. A live-provider run requires explicit model and spend authorization; the existence of this command grants none.

## Guidance provenance

`run.json` records a fingerprint of the agent's guidance and Ledger sources (`guidance-manifest.ts`), the case hash and the model settings. Guidance drift is checked before each subsequent persona turn, and a resume refuses changed guidance. These are source fingerprints, not a complete environment snapshot.

For a matched comparison keep the case, objective, initial net, Brunch model and thinking, and persona model and thinking identical. Every run gets a fresh database, browser profile and conversation.

Inspect the retained dialogue, Ledger and net together. Tool and skill tests establish wiring only; a live run must establish any behavioural improvement.

## Supply a context pack

`--case` accepts a name under `apps/brunch-agent/evals/petrinaut/cases/` or an absolute or caller-relative directory. That directory supplies exactly two launcher inputs:

- `situation-pack.md`: the person's background: who they are, what they know about their work, what they want and how they talk.
- `opening-message.md`: the person's first message, sent as the whole file, trimmed.

Other files in the directory are not loaded. A case may keep a `key.md` beside them for scoring a run: what the person believes, where the pack puts that under pressure, what should change in Brunch's work when it is caught, and what must stay unknown. A key grades what Brunch tells apart, respects or keeps conditional, not the order in which it builds. The persona never sees it. An optional `--objective "…"` gives the person a private aim for this run without editing the pack. Phrase it as the person would think of it (for example "find out whether a second night shift would clear the backlog"), not as interview steps. Without it, the person's goal comes from the pack. The objective is written into the run's private brief but not into `run.json`, and the launcher does not reapply it on resume.

## One operation

The [launcher](launch.ts):

1. Starts the host's own local services (on the website, Brunch's chat and panel servers; in HASH, Brunch's server) with a fresh run-local SQLite database. Occupied ports refuse rather than reuse unverified services.
2. Opens a separate, headed Chrome window on the host's real AI panel. On an interactive terminal it prints the URL and profile and **waits for Enter before starting the agent**, so you can start screen recording. `--skip-recording-pause` skips the wait; it is skipped automatically when stdin is not a terminal, for example when an agent runs the launcher. On the website the default route is `/` with no preloaded net; in HASH the process starts empty. `--initial-net` is optional staging, not a from-scratch run; it takes a Petrinaut file or a retained run's `evidence/net.json`. `--interview-length quick|standard|thorough|deep` turns on the website's Interview length at that level, so every turn carries its question allowance; `run.json` records the level, and a resumed run keeps it because the browser profile keeps the setting.
3. Opens the browser bridge, writes `bin/persona` and the private `persona-brief.md` (role, command guide, any objective, the opening message to send and the situation pack), then starts the agent.
4. The agent's `persona open` sends the opening, and the launcher waits through browser-tool continuations for the completed reply.
5. Types each `say` message into the ordinary composer, waits until every admitted continuation settles, and returns the reply. This uses selectors, not screenshot-based AI computer use.
6. Clicks **Allow** on each approval panel during a turn: a destructive edit (any `remove*` net tool) and, in HASH, the agent's save of a new process version. The persona sees only reply prose and cannot answer either, and an unanswered panel holds the turn indefinitely. Each allowed approval is recorded in `bridge-log.jsonl`. It clicks Allow rather than Always allow so every request is recorded.

Chrome comes to the front only at the recording pause; after that it stays where you put it, so keystrokes meant for another window don't land in the composer. A reply Brunch gave reaches the persona even when the run's evidence could not be refreshed; the launcher reports that failure instead.

Ctrl-C in the launcher, closing its browser, `persona end`, or the foreground agent exiting stops the resources the launcher created; other services are left alone. After `end` the agent's Herdr pane stays open so it can report to you; after Ctrl-C the launcher closes it. When the agent shares the launcher's terminal, Ctrl-C belongs to the agent; quit the agent to stop the run. Do not submit browser turns concurrently with the persona.

## What is shared

The agent's session and Brunch's interview are different conversations. The browser and the helper share **one Brunch conversation** and document binding; Brunch's canonical history remains authoritative. The persona sees only Brunch's reply prose, not the tool trace.

The bridge only submits text, allows destructive-edit approvals, and observes completion. It neither fabricates results nor executes mutations independently, and it refuses to overwrite a nonempty composer draft. The panel's history-replay guard remains intact.

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

Use `yarn brunch:persona --resume <run-directory>`; the run's host comes from `run.json`. A website run returns to the panel port recorded there, since the browser keeps the run's net and settings under that origin, and takes a free chat port. A HASH run reopens its process, signing in again if the profile's session has lapsed. The HASH editor opens a process as last saved, so before Brunch recovers anything a HASH resume refuses when the process is gone or archived, when the run never captured its live net, when its last capture failed, or when the reopened net differs from `evidence/net.json`: in each case edits the conversation relies on may not be in the editor. Resume reuses the saved Chrome profile, database and settings; it does not replay the opening or import a snapshot. For agent runs it starts a **fresh** persona agent (the original agent and model unless you pass driver options) with `resume-brief.md`, which points back to the original brief and tells it to read `persona transcript` first. For scripted runs, resume requires an explicit driver option (`--script <continuation.json>` with no `open` step, `--agent`, or `--agent-command`) so the original script is never silently replayed from step 0. The earlier agent's own session is not resumed, so a resumed run is one Brunch conversation played by successive persona sessions, possibly on different drivers; `bridge-log.jsonl` records `personaDriver` on every admitted utterance. Fresh-run options, including `--objective`, are rejected.

The panel opens first and the launcher waits for recording readiness **before starting backend recovery or the agent**. After Enter, Flue settles the prior admitted submission; the launcher checks it against the last admitted utterance in `bridge-log.jsonl` and refuses mismatches or unanswered browser calls. The interrupted utterance is never resent. Runs made with the earlier Pi extension launcher have no bridge log and cannot be resumed.

## Retained data

Each launch prints its directory under `apps/brunch-agent/.data-wipe-me/persona-runs/`:

- `run.json`: case and configuration paths, effective Brunch model settings, `personaDriver` (tagged union: `agent`, `command`, `scripted` with `scriptPath` and `scriptSha256`, or `external`), the bridge socket path and owned process/pane identifiers; no credentials.
- `configuration-preflight.json`: request-free Brunch configuration checks.
- `conversation.db`: this run's local Flue database, including conversation history, including the Ledger's commits, and provider usage records.
- `session.json`: private native browser attachment, not a reusable template or public artifact.
- `persona-brief.md`, `resume-brief.md` and `bin/persona`: the agent's private brief, latest resume notice and bridge helper (brief files are omitted on `--script` runs).
- `bridge-log.jsonl`: every utterance Brunch admitted, with `personaDriver` on each admitted utterance, used to reconcile resume; every destructive edit or save the launcher allowed, with what its approval panel showed; and any `script-step-failed` record if a scripted driver halted on an error.
- `net-capture-failed.json` (HASH only): written when capturing the editor's net fails and removed by the next capture that succeeds; while it stands, `evidence/net.json` may be out of date and resume refuses.
- `evidence/`: canonical snapshot and derived transcript, tool trace, compiled `ledger.md` with its `ledger.json` commits, and `net.json`; refreshed after completed turns and on shutdown. On the website `net.json` is the bound document as the browser stores it. In HASH it is the net the editor holds, saved or not, taken through the editor's own **Export → JSON** (a download, so nothing the agent sees changes), and `saved-net.json` beside it is the process's latest saved version. Both have the website's shape, which the run packet reads.
- `evidence/packet.json` and `packet.md`: the run packet, written on shutdown (see [Run packets](../petrinaut/README.md#run-packets)).
- Service logs, only for services this launch started.

The persistent Chrome profile lives outside the checkout; its path is in `run.json`. Older runs may also contain `pi/`, `persona-input.md`, `usage-ledger.json` or `attempt-ledger.md`; leave them untouched as historical evidence.

## Verification

The unit tests cover the JSONL framing, the bridge and helper round trip, agent command construction, the brief and resume reconciliation inputs:

```sh
yarn workspace @apps/brunch-agent test:unit
```

For Anthropic schema acceptance after a tool, schema, or adapter change, run `yarn workspace @apps/brunch-agent test:anthropic-tools`. It checks the captured Brunch tool catalogues through Anthropic's free token-counting API and performs no generation.
