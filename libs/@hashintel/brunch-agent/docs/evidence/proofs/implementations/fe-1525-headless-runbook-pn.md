# FE-1525 / Mission 3 — structurally typed runbook to headless PN

**Date:** 2026-08-28
**Source:** `ln/fe-1525-headless-runbook-pn`
**Mission:** `MISSION.md` still live — archive only on acceptance.
**Runs:**
- hermetic: `apps/brunch-agent/test/runbook-headless.test.ts`
- real-model 1: `docs/evidence/evaluations/process-model-elicitation/runbook-headless/runbook-headless-2026-08-28T10-56-59-351Z.*`
- real-model 2 (one edit cycle): `…/runbook-headless-2026-08-28T11-03-53-683Z.*`

## What landed

One `ChatAgent`, one runbook skill `sdcpn-modelling`, four supporting Markdown
resources. Mounted with `defineSkill({ files })` and `readFileSync` so the
existing `node --experimental-strip-types` proof runner stays honest. Vite
`SKILL.md` import was not used (fog 8). Always-on instruction is a short router.
`confirm-path` is gone.

Headless drive: `createFlueClient` → `send` → `wait` → `history()` against the
production agent. Simulated Marta answers as ordinary user messages. No
`brunch_ask`, no sweep, no capture-store write on this path.

Inbox JSON fixtures under `docs/inbox/sdcpn-examples-to-validate/` all
`parseSDCPNFile` with `ok: true`.

## Proof checklist

| # | Claim | Observed |
| --- | --- | --- |
| 1 | One runbook skill; catalog + always-on route the lifecycle | Catalog line in `SKILL.md` frontmatter. Faux `petrinaut-chat` and both real runs call `activate_skill` with `{ name: "sdcpn-modelling" }`. |
| 2 | Activation yields procedure; resources readable | Activation briefing lists the four files. Both real runs `read_skill_resource` elicitation + IR during interview and construction + checks at construct. |
| 3 | Universal + SDCPN teaching; no scenario facts in resources | Authored files tagged `provenance: universal` / `sdcpn`. Grep: no Vestera / truck fleet / fab. Scenario lives in the situation pack, conversation, and filled IR. |
| 4 | Interview in expert vocabulary | Real runs talk washdowns, TC-17, Meridian, Line 2 — not places/transitions to the expert. Construction resources read at construct, not to frame the first questions. |
| 5 | Recoverable Markdown IR | `runbook-ir` fence scraped from `history()`. Both real IRs have unknowns / not-yet-asked / assumptions / omissions. |
| 6 | Construction yields PN JSON `parseSDCPNFile` accepts | Hermetic throughline: `ok: true`. Real run 1: invented `label`/`arcs` schema, `ok: false`. Real run 2 (after one construction-resource edit): Petrinaut `name`/`inputArcs`/`lambdaType`, still `ok: false` (weight 0 exclusive-mode arcs + malformed `types`/`parameters`). Stripping those extras locally parses: 18 places, 24 transitions, missing positions allowed. |
| 7 | Losses named | Run 2 IR and construct prose name inferences, unknowns, unrepresentable commercial weights, VW-02 dark-tint loss. |
| 8 | No sweep; no capture-store write | Tool names: `activate_skill`, `read_skill_resource` only. `wroteCaptureStore: false`. |

## Fog answers

1. **Headings.** First-cut tree was enough to file a construction-ready IR. No schema validator added. Opening batteries of 4–10 numbered questions appeared (universal smell: opening overload) — not a heading-catalogue failure.
2. **Resource split.** Four files worked. Construction was not required to ask ordinary questions. `Transform to PN` lines remain in elicitation as typology children; they did not cause PN-shaped interviewing on these runs.
3. **Skill name / always-on.** `sdcpn-modelling` plus a 6-line router activated on the modelling request without a faux script for the real runs.
4. **IR recovery.** Last `runbook-ir` fence in assistant text. No `usePersistentState`, no capture store. The model sometimes omits the closing fence before `pn-json`; scrape still finds a block.
5. **Construction-gap return.** Unexercised as a loop. Construction named gaps and delivered `partial-with-named-gaps` instead of asking the smallest next question. No HITL contradiction injected.
6. **`parseSDCPNFile` as Petrinaut-accepts.** Strict enough. Inbox fixtures pin the oracle. The remaining real-model miss is schema detail (positive arc weights; omit or correctly shape `types`/`parameters`), not a second validator.
7. **Universal vs SDCPN migration.** Provenance tags are in the files. Lines that actually steered the run: universal slice-then-story and assumption marks; SDCPN changeover / contended-crew typologies. Not automated.
8. **Packaging.** `defineSkill` + on-disk Markdown + `readFileSync` keeps hermetic tests and `yarn dev` on the same ChatAgent. `SKILL.md` Vite import would break `node --experimental-strip-types`.
9. **Model / latency.** Interviewer `claude-sonnet-4-5` (script default; panel still defaults to haiku). Interview turns ~5–23s. Construct turns 162s then 271s — one model call emitting a large net, not a sweep/extract call. Ordinary teaching turns did not return to minute-scale. Construct emission did.

## Edit cycle (one)

**Miss class:** construction / target-formalism (PN JSON field contract).
**Home edited:** `pn-construction.md` (minimal Petrinaut object; `checks.md` got a matching one-liner).
**Driver fix (tool-runtime, not teaching):** latest assistant *text*, skipping tool-only messages, so the interview no longer aborts on empty last message.
**Rerun:** IR richer; schema closer; parse still false on weight-0 exclusive outputs. No second teaching rerun.

## Stop lines not fired

No typed kernel, no capture join, no plugin runtime, no extra skills/agents/loaders, no canvas tools, no TUI, no adapter→core leak. Mission not archived.

## How to watch

```sh
yarn workspace @apps/brunch-agent test:unit
yarn workspace @apps/brunch-agent runbook:headless
```
