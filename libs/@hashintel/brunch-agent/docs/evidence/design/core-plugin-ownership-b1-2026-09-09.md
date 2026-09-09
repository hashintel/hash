# Core/plugin ownership audit — B1 review checkpoint

## Scope and authority

Lu authorized the side quest in `fba9bb2`, then requested a pause immediately after B1 so another agent can review it before proceeding with a separately designed plugin in the same checkout. This checkpoint implements B1 only. A-list re-marking, B2–B5, Gherkin realignment, plugin alignment markers and standing freshness policy remain pending. No new plugin, source-consultation tool, evidence-schema change or paid run is included.

## Observed pressure and diagnosis limit

The retained private `vestera-persona-20260909-r2/accounting-stop-history.json` has 36 messages: two `activate_skill` calls naming `sdcpn-modelling` and `elicitation`, resource reads for the SDCPN profile and workpiece template, 11 `brunch_mark_question` calls, and no `update_workpiece` or `brunch_workpiece` call. This rules out absence of the skill-activation calls as the explanation for this run. It does not establish trigger wording as the sole cause. The old always-on instruction did not name the update tool, and the plugin/template instructions deferred settlement until substantial change. Earlier history and testimony remain unchanged and private.

## Ownership decision and implementation

Apply the side quest's ownership test: guidance that holds independently of target formalism belongs in core; domain-specific recording shape and construction consequences stay in the plugin.

| B1 responsibility | Production home | Disposition |
| --- | --- | --- |
| First partial revision after one consequential distinction; subsequent useful stretches/corrections; full-account settlement before delivery | Core `src/prompts/SYSTEM.md`, executable tool description in `src/flue.ts` | Always available, not conditional on SDCPN activation |
| Revision/hash settlement, optional six-kind evidence relations, authorized source IDs, candidate/current locator lookup, duplicate/omitted matches, unique unchanged-span carry and its limits | Core `src/skills/elicitation/SKILL.md` | Graduated from SDCPN; skill introduction and routing no longer disclaim shared workpiece ownership |
| Readback after settlement when `brunch_workpiece` is available | Core system/skill/tool guidance | Calls the existing read surface used by presentation; no second current-state authority or UI code change |
| Settle before construction, separate browser proposal, settled revision/hash and current spans for basis, prepared/legacy distinction | SDCPN `src/skills/sdcpn-modelling/SKILL.md` | Retained explicitly |
| Operational recording shape | SDCPN `templates/workpiece.md` | Retained; replaced its competing substantial-change trigger with the core pointer |

No tool implementation logic or validation changed; `flue.ts` changes only the tool description. The six evidence kinds, native revision semantics and browser-construction separation remain intact. The Gherkin fenced-authority fork is still present deliberately at this B1-only pause; P1 is not earned yet.

## Verification

Command from HASH root:

```sh
turbo run test:unit lint:tsc lint:eslint --filter @hashintel/brunch-agent --filter @hashintel/brunch-agent-plugin-sdcpn --filter @hashintel/brunch-agent-plugin-gherkin
```

Result: **12/12 tasks successful**, one cached prerequisite; **233 tests passed** (core 129, SDCPN 102, Gherkin 2). Type and lint checks passed. The attempted `yarn turbo` command did not run because this checkout does not expose that Yarn script; the installed `turbo` command above succeeded. Transient full output: `/tmp/brunch-b1-checks.log`.

- Core `elicitation-skill.test.ts` now asserts settlement/cadence, all six evidence kinds, locator/source vocabulary and continuity limits in the core activation payload.
- Core `update-workpiece.test.ts` checks that `useBrunchAgent()` actually returns the cadence/readback prompt and mounts the corresponding tool description; existing settlement, rejection and state tests remain unchanged.
- SDCPN `sdcpn-modelling-skill.test.ts` adds the core delegation and retained construction-handoff assertions; existing activation, packaged-resource and evidence-rung assertions remain intact. No assertion was removed.
- `sem diff` confirms the product change is confined to the tool description and workpiece guidance; `git diff --check` checks patch whitespace. Existing ledger changes are excluded from this checkpoint.

These checks establish instruction placement and preserved mechanical contracts, not model compliance, useful elicitation or semantic fidelity. **P7 remains pending**: the persona was not resumed and no app restart or browser submission was performed. Lu's normative-source witness also remains pending, after the relevant A-list changes. The retained conversation already contains 11 question markers; it cannot retrospectively earn a first-revision-before-most-questions claim for its complete history. Define the intended continuation window with Lu before treating a suffix measurement as P7 acceptance.

## Review handoff

Review this checkpoint against `SIDE_QUEST.md` B1 and the protected pre-change guidance in `fba9bb2`. The next plugin may consume core's shared protocol; it should not copy the protocol into another job skill. Later source-neutral authorship and trust teaching is not present yet. This note records an implementation checkpoint, not side-quest closure or authorization to expand it.
