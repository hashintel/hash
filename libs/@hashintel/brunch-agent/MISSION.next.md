# Next concerns

Scratchpad, not a mission. [`MISSION.md`](MISSION.md) remains execution authority. Do not
implement from this file. Clusters are ordered; they are not a second concurrent mission.
When a focus is cut into a new `MISSION.md`, leave everything that did not make the cut here.

Capture (archived Mission 2) and the live runbook/IR path (Mission 3) are **independent**.
Whether they converge, and if so where, when, and in what form, is an open later question. Do
not wire them in order to tidy the list.

## Host trunk

Later cut. Does not need the capture pipe. Does not need a runbook.

- **Two brains, same panel.** Stock modeller and Brunch selectable without relaunching. Today
  the switch is `yarn dev` vs `yarn dev:brunch`. Locked: Brunch is not the new Petrinaut
  assistant; panel stays `useChat` / `onToolCall`; do not splice conversations; stock must work
  with brunch-agent down; HASH embed stays stock unless opted in. Open: origin sharing, picker
  location, mid-net vs start-only switch.
- **Net create/save/load is the session lifecycle.** Working assumption: Petrinaut net id
  discriminates one Flue conversation per principal. Prove save/load keeps the same conversation;
  a new net id mints a new one. If net ids are unstable, drop the assumption and rekey (Mission 2
  stores by Flue conversation identity until then).
- **Compaction.** Prove panel and transcript reconstruct across a real Flue compaction boundary
  (`compaction-vs-durable-history` / FE-1386). Product control to compact or to show a summarized
  range only after that pin.

Voice is a git parent on `kostandin/h-6763-openai-canonical-speech`, not a cluster here. Same
`POST /api/chat` dock Mission 1 named. Resolve UUID-per-net vs `petrinaut-preview:${netId}` and
stolen vs configured `/api/chat` on that stack. Brunch owns no provider audio.

## Elicitation ladder

Mission 3 holds the prompting experiment (runbook, template, headless drive, off-canvas PN).
Remaining order after that: typed map plus canvas I/O, then capture improvement. Watch for the
strain threshold (condition 5: typed mapping, in-loop LLM judgment, ~2 min question turns).

### Typed map and Petrinaut read/write

FE: minimal typing — what maps to what — so generation can reject a vague shape. Brunch agent
read/write of the live net via existing panel `onToolCall`, not by absorbing the stock modeller
or its 46-tool set. Agent generates a PN on the canvas from an IR. Which tools, when: not
decided.

### Capture improvement

Token-threshold observer: arm after N tokens (no model call), fire on next turn settle. Maybe
typed payloads that match the FE map; maybe not, if the runbook path is winning. Subagents /
micro-cognitive tasks: undecided. This is where latency and judgment re-enter on purpose, so
the threshold is visible.

## Later / parallel

Not sequenced on the elicitation ladder. May ride along a live mission if the throughline
already has the hook.

- **Observability / eval / tracing.** Node OTel SDK → HASH collector/Tempo; Flue
  `instrument(...)` already in `app.ts` but nothing exports. `dispatch()` does not propagate
  `traceparent`. Content capture off until a privacy policy. FE-1505 / FE-1423 stay production
  gates.
- **Watch simulated conversations.** Driver: `@flue/sdk` JSON (`send` / `wait` / `history`),
  not PTY poll. Human observer: same conversation URL on `:4321` (render `dynamic-tool` /
  `data-*` / skill activation). Herdr panes are terminals; at most open that URL or tail the
  transcript CLI. `HarnessAgent` is not this surface.
- **AI SDK 7 `HarnessAgent`.** Converse of the current door (resume a harness session by chat
  id). Flue already owns that session; `transport-aisdk` is the UI adapter. A Pi/Claude Code
  harness would be another substrate — what `binding-flue` isolates — or a Flue replacement.
  Undecided.

## Locked, not a mission

- Keep the AI SDK adapter. Do not rewrite the Petrinaut panel onto `@flue/react`.
- `@flue/react` stays appropriate for brunch-agent's local debug UI.
- `binding-flue` stays a package even if it is the only binding.
- Exploded-view net prototypes belong on petrinaut-website host routes, not on `:4321`.
- When `ChatAgent` leaves the app: `packages/<chat-agent>/` in libs; app remains the shell.

## Out of scope

- A HASH embed path that talks to Brunch.
