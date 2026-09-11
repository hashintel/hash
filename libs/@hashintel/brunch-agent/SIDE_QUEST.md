# Side quest — Ground ordinary Brunch turns in the current Petrinaut net

## Status

Active inside live [Mission 7b](MISSION.md) on `ln/fe-1653-alternate`, a child of `ln/fe-1573-mission-7b`. Authorized by Lu on 2026-09-11 as the replacement for the retired FE-1653 branch `kostandin/fe-1653-ground-brunch-current-net` ([PR #9637](https://github.com/hashintel/hash/pull/9637)), whose once-per-turn tool withdrawal assumed ordinary Brunch had no read tool and contradicts the batched construction protocol this stack depends on. This quest grants no concurrent work and no paid allocation; every proof below runs on the repository faux provider.

The tracked Linear issue is [FE-1653](https://linear.app/hash/issue/FE-1653/ground-every-brunch-conversation-in-the-current-petrinaut-net). Its imperative stands; its retired constraint that ordinary conversations mount no mutation tool does not survive Mission 7b and is not re-adopted here.

## Relationship to the live mission

Mission 7b mounts `getLatestNetDefinition` and `mutate_petrinet` on every ordinary configured conversation and gates every mutation on a cited, server-verified earlier read. That freshness discipline is write-path only. Nothing tells the model, at the start of a user turn, whether the net it last saw is still the net on screen, and nothing tells it on first contact that it has never looked. The residual failure is the FE-1653 symptom: Brunch can explain, review or begin interviewing about a visible net from memory or from nothing, or ask for an upload the browser already holds.

The ledger that answers "what has the model seen" already exists in Flue history: each verified `getLatestNetDefinition` result carries `metadata.observation.observed.sha256`, and each `mutate_petrinet` result carries verified attempts with `post.sha256`. This quest derives freshness from that log and tells the model when to read. It adds no state store, no tool withdrawal, no browser-to-server side channel and no change to any construction mode. It does not alter the mission's imperative, throughline or proof; it removes a false-confidence path from the product the mission's product-manager script runs through.

## Imperative

At the start of every user turn on a browser-bound conversation, the model must know whether the most recent net it observed is the most recent net the conversation has recorded, and must read before relying on the model when it is not. A first user turn is always such a turn.

## Throughline

```text
SIDE_QUEST.md committed alone
→ user delivery (typed or completed Voice transcript; one shared submission path)
→ ChatAgent useAgentStart fetches history()
→ deriveNetFreshness folds verified reads and applied mutation post hashes in order
→ never-read | stale → append signal brunch.net-stale into the same response
→ current → append nothing
→ instruction: read getLatestNetDefinition in its own proposal when the signal is present
→ browser answers through the existing client-tool-result path with its observation sidecar
→ next user turn folds the new read; remove this file at close
```

## Proof

| Result | Oracle |
| --- | --- |
| Freshness is derived from history alone | `apps/brunch-agent/test/net-freshness.test.ts`: empty history is `never-read`; one verified read is `current`; a verified read followed by an applied browser mutation whose verified post hash differs is `stale`; a matching re-read returns `current`; verified no-op, failed and stale batches retain their unchanged post as current; a mutation without a verifiable record, with effects that do not support its declared outcome, or from another document incarnation is `stale` with the current net unrecorded; an observation whose hash does not re-verify, or that belongs to another document incarnation, is not a read. |
| The marker reaches the model before its first turn | `apps/brunch-agent/test/integration/net-freshness.test.ts` (faux provider, headless Petrinaut host, no browser, built application): in `batched-construction` mode the first user turn records `brunch.net-stale` ahead of the model's first assistant message and the model's captured context contains exactly one marker; the correlated verified read continuation adds none; the next user turn adds none; each user turn is recorded once; the UI projection of that history contains no marker. The post-mutation leg is proven at the fold, not through the batched `mutate_petrinet` path, which requires a settled workpiece and browser-derived effects that Mission 7b's own browser integrations already exercise. |
| Hydration stays clean | `apps/petrinaut-website/.../use-flue-chat-history.test.ts`: a `brunch.net-stale` dispatch record between a user and an assistant message projects no UI message. |
| Package gates | `turbo run lint:tsc lint:eslint test:unit --filter @apps/brunch-agent --filter @apps/petrinaut-website`. |

This quest does not claim provider compliance, hand-edit detection, Voice-specific behaviour, or a paid witness. It changes what the model is told, not what it is allowed to call.

## Constraints

- Flue history is the only ledger. No `usePersistentState`, no app table, no browser-side record of what was delivered.
- The read tool is never withdrawn or re-mounted by this quest; Mission 7b's multi-read construction loop is untouched.
- Net JSON is never injected into a prompt; the marker carries hashes and a reason, never a definition.
- The marker only ever asks for more reading. A malformed or unverifiable record makes the state conservative (stale), never confident.
- No browser-to-server side channel: Flue `kind: "user"` deliveries carry no metadata, and a separate signal runs its own model turn, so the browser's live hash is not transported in this quest.
- No change to `initialData` modes, mode instructions in `plugin-sdcpn`, `APPEND_SYSTEM.md`, Voice, or the stock Petrinaut `/api/chat` fallback.
- Existing verification primitives (`recordedBrowserObservation`, `verifyMutationAttempt`, `parseClientToolResultMetadata`) are reused, not reimplemented. The why tool's own history walk stays why-specific; the fold lives beside it in `apps/brunch-agent/src/conversation/net-freshness.ts`.
- The marker is app-owned: `ChatAgent` appends it and `ChatAgent`'s instruction explains it. Plugin guidance is unchanged.

## Fog-line

- **Hand edits between turns.** A user who edits the net by hand between turns changes the browser hash without any record reaching Flue history; the fold reports `current` and the model may answer from a stale snapshot. The candidate closure is an app-owned revision report the website POSTs before each Flue send, read in `useAgentStart` by instance id. It re-enters when a product observation shows a hand edit producing a wrong grounded answer, or when Mission 7c's worked-model correction path needs it.
- **Enforcement.** The marker is an instruction, not a gate. A `useAgentFinish` continuation that re-appends when a stale turn made no read would enforce it at the cost of one extra model turn; whether the browser-executed read's `terminate: true` splits the response so that the finish hook can see the read is unverified. Spike before designing around it.

## Stop or reorient

- Stop if the marker requires withdrawing or re-mounting a tool, or changing a construction-mode instruction.
- Stop if deriving freshness requires a second store or a browser-side ledger.
- Stop if the deterministic proof shows the appended signal does not precede the model's first turn on the user delivery; the design depends on Flue's `useAgentStart` append joining the same response.
