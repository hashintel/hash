# Mission 8 — Propose and run a Ledger-derived experiment, the user pressing Run (FE-1745)

## Status

Live, not accepted, on `kostandin/fe-1745-ledger-derived-experiment`, forked from Lu's `ln/fe-1573-mission-7e-express` head ([PR #9761](https://github.com/hashintel/hash/pull/9761)). Lu authorized this second live mission on its own branch, the Linear issue [FE-1745](https://linear.app/hash/issue/FE-1745), and the merge posture against the 7e branch on 2026-09-16. Mission 7e remains live on Lu's branch and is neither consumed nor accepted here; this branch carries exactly one live mission, and its `MISSION.md` replaces 7e's only on this branch.

**Established base.** Mission 7d/7e provide a settled Markdown Ledger with evidence-validated `mutate_workpiece` settlements, fresh-base `read_petrinaut_net` observations with verified identity, browser-executed construction tools through the website wrappers with a durability barrier, and the batched-construction skill flow. Chris's execution host (FE-1666, FE-1667, FE-1668) provides `petrinautExperimentRequestSchema`, `PetrinautExperimentHost.runExperiment`, `ExperimentsProvider` records, progress and cancellation, the Simulate → Experiments view, and the top-bar active-experiments indicator with navigation to details. The [Mission 8 draft](docs/mission-drafts/8-experiment-configuration-from-the-ledger.md) holds the terrain read, the Ledger-to-experiment correspondence table and the accepted design A in its refined form; every terrain claim there was re-verified at this fork.

**Observed gap.** Nothing in Brunch turns a settled decision, measure, tunable quantity and regime into an experiment. `createExperiment` is a stock-assistant tool, not in Brunch's catalogue; `prepareExperiment` is pure and separable but not exported from `@hashintel/petrinaut/react`; the mounted `mutate_petrinaut_net` union has no scenario or metric operations, so Brunch cannot construct the saved scenario and saved metric every experiment binds to; the skill has no readiness guidance, so the model waits for the words "experiment" or "optimize". The 2026-09-16 demo feedback asked for Brunch to recognise the opportunity itself.

**Next authorized move.** Work package A (scenario and metric operations) needs no upstream change and starts now. The one upstream delta — canonical preparation exposed without execution — rides on this branch provisionally as a named `prepareExperiment` export with a patch changeset, in its own commit, pending Chris's boundary preference; nothing else in Chris's package changes. Paid persona observation of the support-desk case needs separate spend authorization from Lu and is not requested here.

### Owner decisions

- **2026-09-16 — Lu, design:** design A in its refined form (Brunch drafts, Petrinaut's own preparation validates and holds, the user presses Run) is the practical approach now. Experiments are routine modelling entities for the user and therefore for the agent — a prompt and skill principle, not a document-model change. Design E is an option to open with Chris, not a destination.
- **2026-09-16 — Kostandin, A1 submission shape:** the prepared proposal auto-submits so Brunch can continue the turn; the session-only widget stays available for Run or Dismiss. The widget does not navigate; the stock indicator and its navigation are reused.
- **2026-09-16 — Kostandin, constraint scope:** the first demo is constraint-free. Restrictions land in `unsupported`; an observed metric beside them is optional and must be labelled "reported, not enforced". A hard restriction is never weakened or encoded as a penalty.
- **2026-09-16 — Kostandin, widget scope:** a minimal website-owned "Drafted — not run" widget is authorized. No persistence, draft list, draft status, drawer prefill or broader experiment lifecycle.
- **2026-09-16 — Kostandin, demo:** the support-desk staffing scenario is the first demo case.
- **2026-09-16 — Chris, upstream delta:** canonical experiment preparation is exposed without execution; no constraint carriage or UI change is requested in this cut. The boundary — a named `prepareExperiment` export from `@hashintel/petrinaut/react` or `prepareExperiment(request)` on `PetrinautExperimentHost` — is pending Chris's preference. This branch carries the named export provisionally because it is the smaller change and the widget can move to the host method without changing anything else; the commit is dropped or replaced if Chris prefers the host method.
- **2026-09-16 — Lu, lifecycle:** second live mission on a separate branch; issue FE-1745; PR base is the 7e branch until it merges, and the `MISSION.md` conflict at that point is Lu's call. The consumed draft stays in place as the residual home for material this cut does not admit (constraints, the Inventory example, design E, drawer prefill), because those items have no other home yet; it remains a non-authority draft.

## Imperative

During ordinary modelling — not after the user asks for optimization — when the Ledger settles a decision, a measure with direction, a tunable quantity with a user-stated range and unit, and an operating regime and horizon, and the net carries the saved scenario, typed scenario parameter and saved metric those need, Brunch proposes the experiment that measures them in the same breath as it proposes a place or a scenario. The proposal is prepared by Petrinaut against the live model, shown unrun in the panel, and started only when the user presses Run. Missing scenarios and metrics are constructed, not invented; missing operational facts are asked for; restrictions the request cannot carry are listed, not dropped.

Why now: the execution substrate exists and works from the stock assistant; the demo failed only on the Brunch side, where the user had to know to ask. Another demo without proactive recognition would repeat the known gap.

## Throughline

```text
user discusses an operational decision
→ Brunch settles the Ledger; the settlement that completes readiness carries
  the decision, measure + direction, tunable + range + unit, regime + horizon,
  restrictions and what the result must not claim
→ read_petrinaut_net confirms scenario, scenario-parameter and metric identities
→ mutate_petrinaut_net adds the missing saved scenario / metric (new operations)
→ draft_petrinaut_experiment: server tool awaits the client; payload keeps the
  core PetrinautExperimentRequest separable from Brunch's declarations, basis
  and unsupported envelope
→ website dynamic interactive tool renders the widget inside the Petrinaut tree
→ widget calls prepareExperiment(request, liveDefinition, title); auto-submits
  {status: drafted | invalid, summary, diagnostics}; Brunch's turn continues
→ widget shows "Drafted — not run · not saved with the document", declarations,
  unsupported list, Run and Dismiss; a later draft supersedes the earlier card
→ user presses Run → re-prepare against the model now, show any difference,
  experimentHost.runExperiment(request)
→ stock ExperimentsProvider record, progress, Cancel; "N active" indicator;
  Simulate → Experiments updates live; completion clears the indicator and
  leaves the result
```

### Cold-start reads

Paths are relative to this context root unless prefixed `../../../`.

- **Planning record:** [Mission 8 draft](docs/mission-drafts/8-experiment-configuration-from-the-ledger.md) — terrain at HEAD, the correspondence table, the design assessment and the implementer's entry. [Draft Mission 11](docs/mission-drafts/11-optimisation-handoff.md) owns anything a consumer runs, receives or judges; this mission ends at one user-started run.
- **Petrinaut experiment terrain:** [`prepare-experiment.ts`](../../petrinaut/src/react/experiment-host/prepare-experiment.ts), [`run-experiment.ts`](../../petrinaut/src/react/experiment-host/run-experiment.ts), [`experiment-host/provider.tsx`](../../petrinaut/src/react/experiment-host/provider.tsx), [`react/index.ts`](../../petrinaut/src/react/index.ts), core [`experiments/host.ts`](../petrinaut-core/src/experiments/host.ts), and the interactive-widget extension [`ai-interactive-tool.ts`](../../petrinaut/src/ui/types/ai-interactive-tool.ts) with its rendering in the assistant panel's tool list.
- **Brunch tool carriage:** [`packages/plugin-sdcpn/src/flue.ts`](packages/plugin-sdcpn/src/flue.ts), [`construction-tool-names.ts`](packages/plugin-sdcpn/src/construction-tool-names.ts), [`mutate-petrinet.ts`](packages/plugin-sdcpn/src/mutate-petrinet.ts) (operation union), [`tools/mutate-petrinet.ts`](packages/plugin-sdcpn/src/tools/mutate-petrinet.ts), [`mutation-record.ts`](packages/plugin-sdcpn/src/mutation-record.ts), and the app catalogue [`tool-catalogue.ts`](../../../apps/brunch-agent/src/agents/chat-agent/tool-catalogue.ts) with its carriage check `yarn test:native-schema`.
- **Website execution:** [`brunch-client-tools.ts`](../../../apps/petrinaut-website/src/main/app/local-storage-demo/brunch-client-tools.ts), [`brunch-panel-transport.ts`](../../../apps/petrinaut-website/src/main/app/local-storage-demo/brunch-panel-transport.ts), [`brunch-petrinaut-tools.ts`](../../../apps/petrinaut-website/src/main/app/local-storage-demo/brunch-petrinaut-tools.ts), [`mutate-petrinet-tool.ts`](../../../apps/petrinaut-website/src/main/app/local-storage-demo/mutate-petrinet-tool.ts), the widget precedent [`brunch-ask-interactive-tool.tsx`](../../../apps/petrinaut-website/src/main/app/local-storage-demo/brunch-ask-interactive-tool.tsx), and the mount in `local-storage-demo-app.tsx`.
- **Guidance:** [`sdcpn-modelling/SKILL.md`](packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md) (Construct disposition is the readiness hook), its [`references/`](packages/plugin-sdcpn/src/skills/sdcpn-modelling/references/), [`templates/workpiece.md`](packages/plugin-sdcpn/src/skills/sdcpn-modelling/templates/workpiece.md), and the packaging test [`sdcpn-modelling-skill.test.ts`](packages/plugin-sdcpn/test/sdcpn-modelling-skill.test.ts).
- **Evaluation:** persona cases under [`evaluations/cases/`](evaluations/cases/) (Inventory is the existing case); the launcher in [`persona/launch.ts`](../../../apps/brunch-agent/src/evaluations/persona/launch.ts). Read [execution safety](evaluations/README.md#execution-safety) before any paid run; none is authorized by this document.

### Work packages

#### WP-A — Scenario and metric construction

Add `addScenario`, `updateScenario`, `removeScenario`, `addMetric`, `updateMetric` and `removeMetric` to the `mutate_petrinaut_net` operation union, the server mutation record and the website executor, each carrying the same declared basis as existing operations. Scenario parameters carry their declared `type`, because the sweep domain derives from it; a count is an integer-typed parameter, never a rounded real. The skill teaches scenarios and metrics as ordinary construction, so the experiment's prerequisites are built when the Ledger's conditions are settled, not when the experiment is proposed.

#### WP-B — Readiness guidance

One skill reference (`experiment-configuration.md`) carrying the correspondence table, the routine-entity principle with its honesty rule ("drafted for this session", not "added to the model"), the readiness rule, the mandatory declarations, the refusals and the shape of the one-sentence proposal. Readiness is Ledger meaning and model executability together: the Ledger states the decision, the measure and its direction, the tunable quantity with a user-stated range and unit, and the regime and horizon; the model has the saved scenario, an integer- or real-typed scenario parameter for the tunable, and a saved metric for the measure. Structure alone never triggers; the model alone never supplies the objective. Propose once when readiness is first reached or when its meaningful configuration changes; a declined or completed proposal is not re-proposed unchanged. When a fact is missing, ask the smallest focused question. Restrictions the request cannot carry go to `unsupported`, stated to the user before Run is offered.

#### WP-C — The draft tool and its carriage

One Brunch client tool, `draft_petrinaut_experiment`, mounted in batched-construction mode and awaiting the client like the existing five. Its payload is `{ experiment: PetrinautExperimentRequest, declarations, basis, unsupported }`: core's request schema unchanged and separable; Brunch adds only provenance and disclosure. It is named in the website's dynamic and batched-construction client tool sets, the plugin's construction tool names and the app catalogue, so native schema carriage is checked by the existing test.

#### WP-D — The website-owned widget

One `definePetrinautAiInteractiveTool` definition. On mount it calls `prepareExperiment` against the live definition and auto-submits `{status, summary, diagnostics}` so the model's turn continues. It renders the prepared proposal as "Drafted — not run · not saved with the document" with declarations, the unsupported list, Run and Dismiss. One current proposal exists per session; an earlier card shows "Superseded". Run re-prepares, surfaces any material difference, then calls `experimentHost.runExperiment` and shows the stock progress and Cancel. It does not navigate, persist, list, or resolve identities itself.

#### WP-E — The support-desk demo

A support-desk staffing case (`evaluations/cases/support-desk-staffing/`): agents 2–8 as an integer scenario parameter on a saved "Peak demand" scenario, average waiting time as a saved metric, two-hour horizon, minimize. The persona never says "experiment" or "optimize". One agent-browser recording of the flow from proposal through Run to completion is the reviewable artifact.

## Proof

### Claim discipline

A drafted proposal proves configuration correspondence, not experiment credibility or optimizer results. Reusing the stock indicator, records and Experiments view proves integration, not their correctness. A passing persona run proves one case, not portfolio breadth. This mission does not claim constraint enforcement of any kind, persistence of proposals, Mission 11's consumer handoff, or any change to the meaning of Petrinaut's optimizer.

### Visible product advance

**Release-note sentence:** While you model a decision with Brunch, it notices when the question can be tested, drafts the experiment for you, and runs it when you say so.

**Product-manager script:** open the website demo with Brunch, say "Help me model our support operation; we need to decide how many agents to schedule while keeping waiting times low at peak," answer Brunch's questions about the range, the measure and the peak period without using the word "experiment", watch Brunch add the scenario and metric, then see a card saying it has drafted an experiment varying agents 2–8 on Peak demand to minimize average waiting time — not run. Press Run. The top bar shows "1 active"; Simulate → Experiments shows the run progressing; on completion the indicator clears and the result stays.

What was impossible before: the user had to know that an experiment existed, leave the conversation, create the scenario and metric by hand and author the experiment in the drawer.

### Proof obligations and dispositions

| Required result | Oracle | Current disposition |
| --- | --- | --- |
| Scenario and metric operations construct, update and remove with declared basis and persist through the durability barrier | `mutate-petrinet.test.ts` and `root-state.test.ts` extended with one fixture per operation, including an integer-typed scenario parameter; website `mutate-petrinet-tool.test.ts` executes each; one loopback case shows the saved scenario and metric present in the next `read_petrinaut_net` | Met on this branch. Plugin admits `addScenario`, `updateScenario`, `removeScenario`, `addMetric`, `updateMetric`, `removeMetric` (union 22 → 28); core `selectedMutationOperationSchema` mirrors them; the website executor applies each and the recorder classifies each `applied`; `brunch-petrinaut-tools.test.ts` loopback reads both back with an advanced observation hash. Caveat: the positional JSON diff attributes only a final-index array removal as a direct deletion, so an earlier-index `removeScenario`/`removeMetric` (like `removeParameter` before it) shows as derived shifts; the outcome still classifies `applied`. |
| Readiness is Ledger-driven | Skill packaging test asserts the reference is mounted and names the readiness conjunction and refusals; a fixture Ledger with parameters and metrics but no stated decision yields no proposal in a deterministic guidance check; the support-desk persona transcript contains no "experiment"/"optimi" token in persona lines yet Brunch proposes | Guidance half met on this branch: `references/experiment-configuration.md` is packaged, hooked into the Construct disposition of `SKILL.md`, and `sdcpn-modelling-skill.test.ts` asserts the conjunction, the workpiece sections it reads, the request fields it teaches, the no-constraint disclosure, the once-only rule and the refusals as text. The "no stated decision → no proposal" rule is asserted as guidance text, not as observed model behaviour; the behavioural half waits on the WP-E persona transcript. |
| Tool payload validates and carries natively | Schema fixture test: one fixture per correspondence row validates or lands in `unsupported` with the expected reason; `yarn test:native-schema` passes with the new tool in the ordinary catalogue | Open. |
| No execution before Run | Website integration: the tool call completes, the widget renders the drafted state, the experiments context holds no record, and the durability-barrier trace shows no `runExperiment` | Open. |
| Second draft supersedes | Website integration: two tool calls leave one current proposal; the earlier card reads "Superseded" | Open. |
| Run starts exactly one experiment with the approved request against the model at that moment | Website integration: pressing Run creates one record whose request equals the approved request; editing the metric or parameter type between draft and Run surfaces the difference before any call | Open. Depends on the `prepareExperiment` export on this branch. |
| Restrictions are disclosed, never enforced by claim | Fixture test: a restriction lands in `unsupported`; widget render shows it under "Not carried into execution"; any observed metric is labelled "reported, not enforced" | Open. |
| Stock indicator, live Experiments update and completion behave as shipped | Observed in the agent-browser recording of the demo; not re-tested as this mission's code | Open. |
| Mission readiness | Kostandin's and Lu's witness of the support-desk demo: proposal without a request for one, unrun card, one run on Run, indicator appears and clears, result remains, no restriction dropped | Open. |

## Constraints

- No Brunch experiment schema; core's `PetrinautExperimentRequest` is used unchanged and stays separable from the envelope.
- No persistence of proposals, no draft list, no draft status, no drawer prefill, no navigation from the widget, no change to the optimizer, indicator, result presentation or experiment card.
- Never encode a hard restriction as an objective penalty; never state that a constraint is enforced when it does not reach execution.
- Never infer the objective from model structure alone; never invent bounds, units or thresholds; never trigger on the presence of parameters or metrics.
- Never call the draft tool as a way to run: execution begins only on the user's Run.
- The website wrapper and widget do not resolve identities or check types themselves; that is `prepareExperiment`'s job.
- The only change in Chris's package is the approved named export and its changeset.
- Every Linear write needs Lu's explicit approval; every paid run needs explicit spend authorization.
- Do not edit or duplicate the Mission 8 draft's content here beyond the pointers this document needs.

## Fog-line

- Whether the model recognises readiness reliably from the Markdown Ledger sections without typed condition slots (the spine's rule: types only after repeated retrieval failure).
- Whether auto-submit plus a persisting widget reads clearly in the panel, or the card needs an explicit "waiting for you" state.
- How one more construction step interacts with the settlement-cost pressure Mission 7e is measuring.
- Run's failure modes when the scenario or metric changes between draft and Run: what the difference display must say, and whether re-drafting is the right recovery.

## Stop or reorient

- Stop WP-C/WP-D if the client-tool path cannot complete a tool call before the user acts; check the panel's interactive-tool submission path first.
- Stop the demo case if its load-bearing restriction cannot be stated honestly as unsupported and the user's meaning would be misrepresented.
- Stop if the wrapper or widget starts resolving ids, checking types or holding experiment semantics; that belongs upstream.
- Stop and return to Lu if anything beyond the one export is needed in Chris's package.
- If Chris lands a first-class experiment definition (design E) in this window, drop the session store and make the payload a `mutate_petrinaut_net` operation; guidance and WP-A survive.

## Deferred

- **Constraint carriage:** request-schema and preparation support for parameter and state constraints, the α policy and the faithful-run leaf remain in the [Mission 8 draft](docs/mission-drafts/8-experiment-configuration-from-the-ledger.md) as its `ORACLE GAP`; this cut states the limitation and does not resolve it.
- **Inventory example and avoid-state proof:** the draft's Inventory objective and avoid-state throughline remain there at full fidelity; the support-desk case does not replace them.
- **Design E and drawer prefill:** remain options in the draft's design assessment, selected only by its reversal evidence.
- **Reading results back into conversation and any consumer handoff:** [Draft Mission 11](docs/mission-drafts/11-optimisation-handoff.md).
- **Mission 7e's own Deferred items** remain with Lu's branch and the [future spine](MISSION.next.md); this mission neither adopts nor discards them.
