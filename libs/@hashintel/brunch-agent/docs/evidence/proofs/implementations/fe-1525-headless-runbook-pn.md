# FE-1525 / Mission 3 — structurally typed runbook to headless PN

**Date:** 2026-08-28
**Source:** `ln/fe-1525-headless-runbook-pn`
**Mission:** `MISSION.md` still live — archive only on acceptance.
**Runs:**
- hermetic: `apps/brunch-agent/test/runbook-headless.test.ts`
- real-model 1: `docs/evidence/evaluations/process-model-elicitation/runbook-headless/runbook-headless-2026-08-28T10-56-59-351Z.*`
- real-model 2 (one edit cycle): `…/runbook-headless-2026-08-28T11-03-53-683Z.*`
- side quest, validated construction from Run 2 IR:
  `…/runbook-validated-construction-2026-08-28T13-02-51-095Z.*`

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
| 1 | One runbook skill; catalog + always-on route the lifecycle | Catalog line in `SKILL.md` frontmatter. Faux `petrinaut-chat` and all real runs call `activate_skill` with `{ name: "sdcpn-modelling" }`. The side quest replaced the source-relative wrapper with Flue's bare static `SKILL.md` import. |
| 2 | Activation yields procedure; resources readable | Activation briefing lists the four files. Both real runs `read_skill_resource` elicitation + IR during interview and construction + checks at construct. |
| 3 | Universal + SDCPN teaching; no scenario facts in resources | Authored files tagged `provenance: universal` / `sdcpn`. Grep: no Vestera / truck fleet / fab. Scenario lives in the situation pack, conversation, and filled IR. |
| 4 | Interview in expert vocabulary | Real runs talk washdowns, TC-17, Meridian, Line 2 — not places/transitions to the expert. Construction resources read at construct, not to frame the first questions. |
| 5 | Recoverable Markdown IR | `runbook-ir` fence scraped from `history()`. Both real IRs have unknowns / not-yet-asked / assumptions / omissions. |
| 6 | Construction yields a net `parseSDCPNFile` accepts with semantic fidelity | Hermetic validated-tool throughline: `ok: true`, including one rejected and corrected zero-weight arc. Real run 1: invented `label`/`arcs` schema, `ok: false`. Real run 2: closer schema, still `ok: false`. Side-quest run: file parse `ok: true` only because the document remained empty; nine rejected `addType` calls prevented construction, so semantic fidelity is false and this proof remains open. |
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
8. **Packaging.** The earlier `defineSkill` verdict was falsified by the emitted bundle's `ENOENT`: its runtime reads looked beside `dist`, where no resources existed. The corrected path is one bare static `SKILL.md` import, with hermetic proofs loading `dist/app.mjs`; a clean build now starts, activates the production skill, and reads packaged resources without source-relative files.
9. **Model / latency.** Interviewer `claude-sonnet-4-5` (script default; panel still defaults to haiku). Interview turns ~5–23s. Construct turns 162s then 271s — one model call emitting a large net, not a sweep/extract call. Ordinary teaching turns did not return to minute-scale. Construct emission did.

## Edit cycle (one)

**Miss class:** construction / target-formalism (PN JSON field contract).
**Home edited:** `pn-construction.md` (minimal Petrinaut object; `checks.md` got a matching one-liner).
**Driver fix (tool-runtime, not teaching):** latest assistant *text*, skipping tool-only messages, so the interview no longer aborts on empty last message.
**Rerun:** IR richer; schema closer; parse still false on weight-0 exclusive outputs. No second teaching rerun.

## Stop lines not fired

No typed kernel, no capture join, no plugin runtime, no extra skills/agents, no
panel canvas integration, no TUI, no adapter→core leak. Mission not archived.

## Side quest outcome — canonical packaging and validated construction

### Packaging closed

The production `ChatAgent` now imports
`src/skills/sdcpn-modelling/SKILL.md` directly. Flue validates the frontmatter
and emits one `createSkillReference` carrying the complete directory. Both
hermetic throughlines load the documented non-listening `dist/app.mjs`
application instead of importing the skill-bearing source module through raw
Node. The clean-build smoke activated that same production skill and read all
four resources. The old frontmatter parser, hand-enumerated resource list, and
source-relative `readFileSync` wrapper are gone.

### No-cost construction pins passed

- A core-only `createJsonDocHandle` → `createPetrinaut` round trip applied
  `addType`, `addParameter`, `addPlace`, `addTransition`, and `addArc`, then
  passed `parseSDCPNFile({ title, ...definition })`.
- The faux built-application throughline used the saved Run 2 IR, exposed the
  exact six-tool subset only through immutable construct-mode `initialData`,
  rejected a zero-weight arc through the canonical Petrinaut Zod schema,
  corrected it in-loop, and parsed the resulting non-empty document.
- An ordinary `/api/chat` conversation did not mount the construction subset.
  No panel or transport integration moved forward from Mission 5.

### Paid run found the schema bridge insufficient

The one budgeted run,
`runbook-validated-construction-2026-08-28T13-02-51-095Z`, used
`claude-sonnet-4-5`, cost **$0.24699**, and made no elicitation turn, capture
write, or free-form `pn-json` emission. It activated the packaged skill, read
`pn-construction.md` and `checks.md`, and called
`getLatestNetDefinition`.

The bounded bridge gave Flue a Valibot open-object carrier, delegated runtime
validation to Petrinaut's canonical Zod schema, and placed mechanically
generated JSON Schema in each tool description. Runtime validation was
faithful, but the provider-facing schema was not: the model encoded
`addType.elements` as a string nine times. Every attempt was correctly rejected
(`expected array, received string`), none was corrected, and the run never
advanced to parameters, places, transitions, or arcs. It finished after two
client rounds with 0 places, 0 transitions, 9 schema rejections, and no client
callback rejection.

`parseSDCPNFile` returned `ok: true` for that empty legacy document. That is a
file-shape result, not construction success; the semantic proof failed
vacuously. There were no line modes, changeover-crew reservation, product
restrictions, directional washdowns, arcs, or delivered loss review to compare
against the IR.

### Decision

Do not extend the open-object carrier or copy Petrinaut payload fields into
Valibot. The next construction path needs either Flue support for Standard
Schema / supplied JSON Schema, or a mechanical shape-preserving Zod-to-Valibot
conversion whose provider schema exposes arrays and nested properties. It must
also require a non-empty, semantically inspected net in addition to parser
acceptance. This is Mission 5 design input. The paid budget is spent; there is
no rerun on this side quest.

## How to watch

```sh
yarn exec turbo run test:unit --filter=@apps/brunch-agent
```

The real-model command is intentionally omitted: the side quest's single paid
run has been spent.
