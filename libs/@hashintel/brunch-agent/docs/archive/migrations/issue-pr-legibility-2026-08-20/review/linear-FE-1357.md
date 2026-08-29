# Linear migration review: FE-1357

Generated `2026-08-20T09:04:00.141915Z` from `data/linear-source.json`. Selected 29 Lu Nelson-authored issues whose ultimate ancestor is FE-1357.

## FE-1357

**Title:** Plan the September elicitation demo and the plugin spec behind it (wayfinder map) → **Plan the September elicitation demo and plugin specification**

**Current outer**

In mid-September HASH demos to the ARIA research community. On stage, an AI interviewer holds a conversation with someone who knows how a real-world operation works — a truck fleet, a cold chain, a schedule — and turns what they say into a process model: a diagram of the operation that can be opened, inspected, and _run_ in Petrinaut, HASH's process-modelling tool. Along the way the interviewer keeps a record of exactly who said what (so every part of the model can be traced back to a statement), knows what it still hasn't asked about, and produces a model file anyone can open — three things no current tool in the stack does.

This issue is the planning map for that demo: each decision that must be made before serious building starts is a sub-issue below, and the sections after the divider index what's decided and what's still open. Status: the groundwork research is done, and three big decisions have landed — the demo will be a purpose-built demo app that uses a new interviewing library and Petrinaut's existing libraries side by side, passing a model file between them, rather than building the interviewer into Petrinaut itself (2026-08-12); the demo's reference use case is truck-fleet predictive maintenance (recommended to the team, ratification expected ~18 August), with the interviewee played from a prepared briefing rather than requiring a live domain expert (2026-08-12); and the form interview knowledge is stored in is settled (2026-08-13) — the store is the set of recorded, source-traceable statements the expert made, and the runnable diagram is one view generated from it, so everything an expert says that has no place in a diagram (reasons, policies, unwritten rules) is kept rather than lost. Next: pressure-test that storage definition against more plugin kinds, then write the plugin spec once the team ratifies the use case. Planning documents live in the brunch-lite repo under `docs/planning/process-model-elicitation/`.

**Proposed outer**

This map coordinates the decisions and evidence required for the 17–18 September demo and the process-model elicitation plugin behind it. Research, baseline work, the intermediate representation, and the original demo architecture have been decided, while later records replace the separate demo application with a remote elicitor inside Petrinaut’s chat panel. The current work is to validate plugin payloads, complete the plugin specification, and deliver the revised integration graph without losing source traceability or completion accounting.

**Extraction:** `standalone-divider`
**Inner:** 16644 characters; `aae3d23e453ffdad8853d49f9a56a927fb65e66950beaf0edbeb949cab26a33f`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1358

**Title:** Survey Petrinaut — architecture, dependencies, assistant implementation → **Survey Petrinaut for the September integration**

**Current outer**

Before deciding how the September demo would be built, we needed a clear picture of Petrinaut — HASH's process-modelling tool — and of the AI assistant it already ships. The survey found that Petrinaut is published as two reusable libraries; that it already has a production-ready way to import a model from a file (currently hidden in HASH's embedding of it); and that its existing assistant can interview a user but keeps no record of who said what, cannot run outside the browser, and produces models that need a separate "scenario" before they can run. These facts became the backbone of the demo-vehicle decision (FE-1362). Full findings: `docs/planning/process-model-elicitation/research/petrinaut-survey.md` (brunch-lite repo); conclusions in the resolution comment.

**Proposed outer**

Document Petrinaut’s architecture, dependencies, assistant, persistence, and model-file boundary so the demo can choose between embedding brunch in Petrinaut and embedding Petrinaut in a separate elicitation application. The completed survey found reusable libraries and a production model import path, but no provenance, headless execution, or directly runnable assistant output. Those findings informed FE-1362’s original demo choice and the later integration decision.

**Extraction:** `standalone-divider`
**Inner:** 1135 characters; `84fd8a05e509600d08ac36ed506cf7a1c3c6b278690717ed45ea64ef658faac2`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1359

**Title:** Voice interviewing — bolt-on adapter or architectural rewrite? → **Decide whether voice changes the elicitor architecture**

**Current outer**

Could the September demo be voice-driven — the expert speaking rather than typing — without rebuilding the interviewer's architecture? Answer: yes, as a bolt-on. Buy speech-to-text and text-to-speech as separate services and attach them where the app takes turns with the user; an all-in-one "voice conversation" provider would take over parts of the system we need to own. Three tiers were scoped, from push-to-talk (days of work) to hands-free with a live results panel (weeks). Voice was later demoted to a conditional nice-to-have for September (FE-1362). Full findings: `docs/planning/process-model-elicitation/research/voice-feasibility.md`; conclusions in the resolution comment.

**Proposed outer**

Determine whether voice can attach to the text-and-event elicitor as speech recognition and synthesis, or whether interruption, live transcription, and structured questions require architectural changes. The completed research found a constrained add-on approach viable and scoped three levels from push-to-talk to hands-free interaction. FE-1362 later made voice a conditional September addition.

**Extraction:** `standalone-divider`
**Inner:** 1062 characters; `4cb05fb2319afdb541a245bdc4d881b63b460c287135d9826c09266e3bc14432`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1360

**Title:** Ground elicitation strategy in the literature → **Derive elicitation guidance from published research**

**Current outer**

What does the research literature on interviewing experts — from simulation modelling, knowledge acquisition, and requirements engineering — say about how an AI interviewer should work? The strongest findings: start by eliciting the questions the model must answer, because they define both scope and "done"; structured interviews vastly outperform unstructured ones; ask for quantities as "how many out of 100…" rather than typical/fastest/slowest, which is measurably biased; and several published question catalogues can be imported wholesale. These findings shape the interviewer's design and back most of our recommendations on the PM checklist (PRO-98). Full findings: `docs/planning/process-model-elicitation/research/elicitation-strategy-literature.md`; conclusions in the resolution comment.

**Proposed outer**

Review expert interviewing, knowledge acquisition, requirements engineering, simulation modeling, and related literature for guidance that can become elicitor pack content. The completed research supports objectives-first interviews, structured question sets, less biased quantity prompts, and several reusable question catalogues. Its findings inform the interviewer design and recommendations on PRO-98.

**Extraction:** `standalone-divider`
**Inner:** 985 characters; `875e27ee8fcb11c912719fd097bab2cd09845c692b04b5f0e7f5cb23ce098a96`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1361

**Title:** Baseline control — what does one-shot AI elicitation already achieve? → **Measure the one-shot AI elicitation baseline**

**Current outer**

Before claiming the new interviewer beats a plain AI chat, we need to measure what a plain AI chat already achieves. This prototype runs a one-shot "interview me and generate a model" baseline and catalogues the mistakes it makes. The result is both the demo's honest comparison point and a check that our design fixes the failures it claims to fix. Not yet started; the experiment design is below.

**Proposed outer**

The completed baseline measured what one-shot and lightly prompted AI elicitation already achieve before adding new interviewer machinery. A plain model already asked about objectives, probed unwritten rules, and kept an assumptions register, but neither tested condition could end the engagement: one deferred the deliverable and the other exhausted its budget. The transcripts and scored results now provide the comparison baseline and identify the remaining requirements for completion, durable capture, evidence status, provenance, coverage, projection, and explicit absence.

**Extraction:** `standalone-divider`
**Inner:** 820 characters; `9f35d242e30ca2005412e9e7a4e17828a9bdd9fc53a8c83774ba0e09895ab0a5`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1362

**Title:** Decide the September demo vehicle → **Decide the September demo architecture**

**Current outer**

This ticket decided what the September demo actually is (resolved 2026-08-12): a purpose-built, throwaway demo app that uses a new interviewing library and Petrinaut's existing libraries side by side, passing a runnable model file between them — rather than building the interviewer into Petrinaut itself. The decision also set what must be visible on stage (traceable statements, the interviewer knowing what it hasn't asked, a live results panel, the model file opening and running) and demoted voice to a conditional extra. Reasons and evidence: `docs/planning/process-model-elicitation/recommendation-demo-vehicle.md` (brunch-lite repo); full record in the resolution comment.

**Proposed outer**

This issue originally chose a separate throwaway demo application that combined a new interviewing library with Petrinaut libraries through a runnable model file. It also set the required stage-visible behavior and made voice conditional. ADR-0004 and FE-1433 later replaced that staging choice with integration inside Petrinaut’s existing chat panel, so the historical decision remains authoritative only as the earlier record.

**Extraction:** `standalone-divider`
**Inner:** 1001 characters; `43811604f679479aa4fb89ac0155eaf6c6a0c6a4f15c57b709090574523a8aa2`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1363

**Title:** Choose the reference use case; settle the SDCPN-showcase criterion → **Choose the demo use case and modelling criteria**

**Current outer**

Which real-world operation should the September demo model — a truck fleet, a cold chain, a scheduling problem? The choice needs a story a live audience can follow in minutes, a willing expert to interview, and enough substance to show off what makes the approach special (timing, quantities, and randomness where the model genuinely earns them). Needs input from Dora and Yannis. This is the next open decision on the map, and it unblocks the data-representation question (FE-1364).

**Proposed outer**

Truck Fleet Predictive Maintenance is the engineering recommendation for the September demo because it supports timing, quantities, randomness, and dynamic colouring in a story the audience can follow. The selection criterion now requires each formal feature to answer a real modelling question. Pharmaceutical cold chain is the runner-up pending a source-sharing check, while production scheduling remains a baseline rather than the showcase. Team agreement from Dora and Yannis remains the final condition.

**Extraction:** `standalone-divider`
**Inner:** 1023 characters; `27839c0e9cfe911dcc85bf70997c89f7405812e2679eb1ce25812227e90177b1`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1364

**Title:** Define the intermediate representation for process-model elicitation → **Define the process-model elicitation representation**

**Current outer**

The interviewer doesn't write straight into the model file. It accumulates what it learns in an intermediate representation — the knowledge store the final model is generated from — because much of what an expert says (reasons, unwritten rules, references, policies) has no place in the diagram itself but must not be lost. This ticket decides what that representation is. Blocked until the reference use case (FE-1363) is chosen, since the use case stresses what the representation must hold.

**Proposed outer**

The representation is conditionally defined as the active captures interpreted through each plugin's declared payload types. Consolidated views, including the Petrinaut net, are projections rather than a second store, so source-traceable statements, reasons, policies, and unwritten rules remain available even when the diagram cannot hold them. The definition covers ten process-model assertion kinds and keeps quantities, rationale, and prescribed-versus-practiced distinctions with the evidence. FE-1397 now owns validation against worked payloads before ratification.

**Extraction:** `standalone-divider`
**Inner:** 921 characters; `173130b0bec025f2e42d4f80764355fedea1872503d21afec834a0ea2738d585`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1382

**Title:** Source dossier: published fleet-maintenance models + operational data for the truck-fleet case → **Compile the truck-fleet source dossier**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Find published fleet-maintenance models, public operational data, and practitioner evidence sufficient to author the truck-fleet situation pack, reference net, and answer key without a live expert. Record licenses and granularity, and pay particular attention to models of per-vehicle degradation. The dossier resolves the sourcing part of FE-1363; situation-pack authoring waits for team feedback on PRO-99.

**Extraction:** `heading-first`
**Inner:** 1777 characters; `98a2f626e1fc039a1f81b0d0fa6ecdf6a39c1fa525a4494097e78c3fb3688c34`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1397

**Title:** Validate the generic IR definition against worked payload designs (Gherkin, CPS, +1) → **Validate the generic IR against worked plugin payloads**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Test the generic intermediate-representation properties against payload designs for Gherkin, CPS, and a third plugin target. Record which properties survive, require amendment, or belong in guidance, including cases where domain content should move into the harness. Apply the resulting changes to `ir-design.md`; working-harness validation remains later September work.

**Extraction:** `heading-first`
**Inner:** 1397 characters; `676e3faa8b8d4801db351f8c82bdf8899036df30c8a5b2789d9a3f3e2b2ca534`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1402

**Title:** Decide when an elicitation is complete or should stop → **Define and rehearse the elicitation completion contract**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

The baseline could report coverage but could neither decide that an engagement was complete nor stop when progress stalled. Draft the completion computation, then replay it exchange by exchange over both baseline transcripts to test whether it catches the observed deferral loop, open-ended continuation, and missing coverage. Keep model completion distinct from a user choosing the best useful partial result within the available session.

**Extraction:** `heading-first`
**Inner:** 2620 characters; `0443796ebe3de81af985a3621799610618b8f020b26ee7e4558e237ea1752df1`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1403

**Title:** Assemble the CPS pack's interviewing guidance and desk-test it where the baseline was weak → **Assemble and test the CPS interview guidance**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Turn the imported interviewing research into CPS question guidance and clarification hints that target the payload fields from FE-1405. Compare every item with the baseline transcripts and retain guidance that addresses observed weaknesses rather than repeating behavior the model already performs. Tag domain-specific and envelope-wide guidance separately so FE-1406 can later adopt reusable items.

**Extraction:** `heading-first`
**Inner:** 2864 characters; `0f8b52a00cb0756e5a5175f053ee2911bca209347466334d61f9f7607f78ccdc`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1404

**Title:** Run the armed baseline (condition 3): completion contract and pack guidance against the simulated expert → **Run the third baseline with completion and interview guidance**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Run a third simulated-expert baseline using the drafted completion contract, the surviving interview guidance, and the three corrections identified by the earlier readout. Score it against the same measures as conditions one and two to test whether the interviewer ends, reprioritizes, and refuses unproductive deferral before the harness exists. Durable capture, enforced epistemic status, and provenance remain expected implementation work outside this experiment.

**Extraction:** `heading-first`
**Inner:** 1958 characters; `f88abfbaa37d65613194b26c3c52b12356af84b1bd39e5b8b062b86d03fefd85`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1405

**Title:** Draft the CPS payload interiors: annotated shapes for the ten kinds, worked from baseline utterances → **Draft and test the CPS payload schemas**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

The generic intermediate-representation work names ten CPS capture kinds but does not define their fields or worked instances. Draft annotated payload schemas for all ten kinds and test them against real baseline utterances, including absence values, quantity ranges, operating-regime distinctions, and multiple captures from one utterance. Fields must match answers an expert can give rather than Petrinaut’s model format, because FE-1402 and FE-1403 depend on field-level gaps.

**Extraction:** `heading-first`
**Inner:** 2708 characters; `42b2be3331cc53b8d4f319769fc410edee6afe23b96111e1f79cc3adf9c59785`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1407

**Title:** Catalogue the frontier-elicitor failure modes the published instruments cannot see → **Catalogue elicitor failures that published measures miss**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Published measures built around human novice errors scored the baseline almost clean while missing the failures the frontier-model elicitor produced. Build a typed catalogue from both baseline transcripts and relevant literature, with each failure’s mechanism, detection signature, accountable layer, and prevention claim. Distinguish useful deferral that deposits durable state from evasive deferral that loses work, so later scoring does not punish correct multi-session behavior.

**Extraction:** `heading-first`
**Inner:** 3707 characters; `147f3f51d5bb84c4d365fcbeb62793a602f48218bcfa36358fb2179f38e737cd`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1423

**Title:** The demo shell is safe to expose beyond localhost → **Require safe remote access to the elicitor server**

**Current outer**

The mounted Flue agent route is public today: anyone who can reach the server can open or continue conversations under any conversation id. That is fine on localhost and disqualifying the moment the URL leaves the machine. This ticket carries the gates that must hold before the demo shell is exposed beyond localhost. It blocks remote exposure, not the demo itself.

Origin: the Flue-vs-tilde analysis's recommended course (`docs/reference/amp-analysis-flue-vs-tilde.md`), carried through the architecture cheatsheet's reconciliation section (`docs/planning/_shared/flue-architecture-cheatsheet.md`) and the routing table's pre-remote row (`docs/agents/flue-routing.md`), and tracked as Ledger A10 in `docs/planning/legibility-sweep/remediation-plan-2026-08-17.md`. On 2026-08-17 Lu ratified these as **requirements**, not recommendations — a demo deployment conversation with infra is already underway, so the gates are schedule-relevant now.

**Proposed outer**

The mounted Flue agent route currently lets any caller open or continue any conversation ID, which is acceptable only on localhost. Before remote exposure, require authentication and conversation authorization, runtime telemetry, persisted-state versioning and backup expectations, and restart durability. Lu ratified these requirements on 2026-08-17, and the deployment discussion makes them schedule-relevant.

**Extraction:** `manual-summary-before-heading`
**Inner:** 1378 characters; `079839429dcfb3258dbbfe9fea16433185391f7444d7cd2b14a58dd720e5c06b`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1431

**Title:** Plugin authoring becomes declarative: a domain is two schemas and two tables → **Define declarative plugin authoring**

**Current outer**

Today every new elicitation domain looks like an engineering project: the capture store says how evidence is kept, but nothing says what a domain author must write down to make the machinery elicit _their_ domain, and nothing turns a pile of typed captures into the thing the user wants — a model of their plant, their feature, their system. Completion questions ("is this model good enough to answer my objective?") have no model to be asked of, and semantic judgments risk hiding inside read paths where nobody can audit them.

The FE-1405 shapes work settled an answer, now written up as a provisional spec: a plugin is **two schemas and two small tables** — declare your domain's node kinds and slots, declare the typed proposals that fill them (annotated with how to elicit each), and say what your completion anchors demand; fold rules mostly derive. The elicited model is derived from captures by a pure fold (ADR-0003), all interpretation happens at write time as contestable captures, and model gaps mechanically cue grounded follow-up candidates. Interviewing strategy decides whether to ask, propose a likely structure for correction, or leave a visible gap. The spec is desk-validated on the baseline transcripts and cross-plugin thumbnails (Gherkin, formal verification, CPS); its ratification condition is a full worked pass across three plugin targets, and its open questions are carried as first-class sections with owning tickets rather than folded into the design.

**Proposed outer**

New elicitation domains currently require bespoke engineering, and the system lacks a declared path from source-traceable captures to a useful domain model and completion judgment. The provisional plugin contract reduces authoring to two schemas and two small tables, with interpretation recorded when captures are written and model views derived later. Ratification still requires a full worked pass across three plugin targets, and named tickets own the remaining questions.

**Extraction:** `standalone-divider`
**Inner:** 1766 characters; `b083c6e46567b897ac8923940a7badd8c37ffd70b3c8fde9b8bfde724ac54432`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1433

**Title:** The elicitor serves demo.petrinaut.org's chat panel from a remote brunch-agent server → **Deliver the remote Petrinaut elicitor integration**

**Current outer**

The 2026-08-18 integration meeting settled the September demo's staging: the elicitor is presented inside [demo.petrinaut.org](http://demo.petrinaut.org)'s existing chat panel, not in a separate demo application. The brunch elicitor therefore runs as a remote server that Petrinaut's chat UI talks to through its host-pluggable transport, with the elicitor's sessions, captures, and IRs persisted server-side and keyed to the visitor's browser. The library is renamed `@hashintel/brunch-agent` and will be imported (with git history) into the `hashintel/hash` monorepo as a sibling of `@hashintel/petrinaut` once the currently open PRs merge.

This issue carries the integration spec for that architecture. The decision itself is recorded in ADR-0004 (`docs/adr/0004-in-petrinaut-staging-and-the-monorepo-import.md`), which supersedes the demo-shell recommendation (`docs/planning/process-model-elicitation/recommendation-demo-vehicle.md`). The spec document is at `docs/planning/process-model-elicitation/petrinaut-integration-spec.md` — seams, user stories, implementation and testing decisions, and the spike-gated questions.

The two original spikes have now reported. Flue carries batched suspension through a non-user signal (FE-1434), and the AI SDK v6 wire shape drives Petrinaut's real panel (FE-1435). A third seam surfaced before implementation: Petrinaut's internal interactive-tool registry is not host-extensible, and a human answer returned through an AI SDK tool-output-shaped message must not be confused with a machine tool result. FE-1448 adds the generic host component mechanism; FE-1449 is the durable, visibly inspectable prototype that proves the actual brunch ask suspends and resumes without laundering provenance.

Related: FE-1333 (the integration-definition ticket this spec answers; closes on the ADR), FE-1357 (parent map).

**Proposed outer**

The September demo will present the elicitor inside demo.petrinaut.org’s existing chat panel, with a remote brunch-agent server holding browser-keyed sessions, captures, and intermediate representations. ADR-0004 records this decision and replaces the earlier separate demo application recommendation. The two original feasibility tests passed, while FE-1448 and FE-1449 now own the newly discovered host-component and human-answer provenance work.

**Extraction:** `standalone-divider`
**Inner:** 2951 characters; `efbb2e84cf944b655703e32a9805677f250dee50e840d19aaa6c199300bc07fc`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1434

**Title:** Spike: does Flue turn suspension carry batched client-tool round-trips? → **Test whether Flue resumes batched client-tool results**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Determine whether Flue can end a turn with pending client tools and later resume the same session with batched outputs recorded as non-user entries. The verdict will shape both the external-tool protocol and FE-1395’s questionnaire chaining. If Flue cannot carry this form, select the document-handle fallback for the demo and record evidence for a second binding.

**Extraction:** `heading-first`
**Inner:** 1855 characters; `fac188333116b05f6764814ccb6ed97bd003e182bc45132c2d39c932440b5bb2`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1435

**Title:** Spike: does a harness-driven stream drive Petrinaut's real chat panel? → **Test whether the elicitor stream drives Petrinaut’s chat panel**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Test whether a server that translates harness output into the AI SDK v6 stream protocol can drive Petrinaut’s real panel, including text, reasoning, tool summaries, client tool calls, and diagnostics. This is a throwaway integration test against a local hash checkout, with no commits there. Preserve the full request and stream transcript as fixtures for later contract tests.

**Extraction:** `heading-first`
**Inner:** 1561 characters; `a157fa152e18f4783339cc49e56ac61a608e57ce097cac34502e7a3acec17698`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1436

**Title:** The elicitor answers conversation turns in Petrinaut's real chat panel → **Connect the elicitor to Petrinaut’s real chat panel**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Build the first durable integration in which a local Petrinaut panel holds a text-and-reasoning conversation with the actual elicitor. Commit the server route, launch path, AI SDK transport, contract fixtures, and runtime diagnostics as production-intent code that later question and editor-tool work can reuse. Diagnostics must expose request and turn boundaries, part kinds, stable IDs, and completion state without becoming user evidence.

**Extraction:** `heading-first`
**Inner:** 2438 characters; `b07965244f137a1844adffb0b30dce5130cd4e8555f2e139579a6bc8456d0e69`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1437

**Title:** @hashintel/brunch-agent lives in hashintel/hash with its history preserved → **Move brunch-agent into hashintel/hash with its history**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Rename the library to `@hashintel/brunch-agent` and import it into `hashintel/hash` with history preserved, as a sibling of `@hashintel/petrinaut`. The move waits for FE-1434 and FE-1435 to report and for the open FE-1388/89/90/99 review stack to merge. The imported package must adopt the hash toolchain while preserving the boundary between brunch-agent, Petrinaut, and their host applications.

**Extraction:** `heading-first`
**Inner:** 1493 characters; `cbe7b6d050e3486f8e1649848516b240c282e85f601a56f693f095059902a476`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1438

**Title:** The elicitor builds and repairs the net through Petrinaut's client-executed tools → **Build and repair Petrinaut nets through client tools**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Answers in the elicitor must create and change the net on Petrinaut’s canvas through Petrinaut’s existing client-executed tools. Add an external-tool round-trip protocol beside the question protocol, generate tool definitions from Petrinaut’s exported schemas, and keep returned outputs mechanically excluded from user evidence. FE-1434 determines the batching shape, and this work must coordinate with FE-1395 because both change the same pending-response rules.

**Extraction:** `heading-first`
**Inner:** 2252 characters; `4b1de406e41f3b22fd6fa75888723caa04bceb2fd97bf01d359a4f52cb9a8c0f`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1439

**Title:** Elicitation sessions are private per browser and survive a reload → **Keep elicitation sessions private and durable per browser**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

An elicitation must survive a reload while remaining inaccessible to another browser. The demo site will send a random browser identifier, the server will resolve it to sessions, and storage will enforce an opaque owner key without adding principals to the harness core. This identification is sufficient for the accepted demo threat model, while deployment separately owns rate limits and the origin allowlist.

**Extraction:** `heading-first`
**Inner:** 1644 characters; `c98a5d0620887f1d30a07eb63f16d2d76d7dace03784a3b3d11e63f3874a8d5f`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1440

**Title:** demo.petrinaut.org ships the elicitor behind its chat panel → **Ship the elicitor in demo.petrinaut.org’s chat panel**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Add a real elicitor mode to demo.petrinaut.org by committing the local integration wiring, browser identifier setup, and remote transport to hashintel/hash. Keep brunch-specific code at application level and leave the stock assistant unchanged when the mode is off. The process-model plugin supplies later demo content, but this wiring can be completed and verified independently.

**Extraction:** `heading-first`
**Inner:** 1646 characters; `697595134f5edfbfb98ca3046f039abca72047f4bf214916d4abcff9d41f04e5`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1441

**Title:** The elicitor server runs on HASH infrastructure behind the pre-remote gates → **Deploy the elicitor server behind the remote-release checks**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Run the elicitor server on HASH infrastructure with Postgres storage, per-principal and per-IP rate limits, and an origin allowlist. Infrastructure has confirmed that Postgres is available, but the server must remain private until FE-1423’s authentication, durability, telemetry, state-versioning, and backup requirements hold. Record the deployment host, CI, and backup expectations with the infrastructure work.

**Extraction:** `heading-first`
**Inner:** 1601 characters; `2ddc691ac9f44ccc31fab6071cefa9c67942c94a358e3f4805da80d61fc19eb0`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1442

**Title:** Captures and completion accounting render live in the demo site → **Show live captures and completion accounting in the demo**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

The demo must show the elicitor’s source-traceable captures and completion accounting while an interview runs, because the existing prompt-in-a-panel experience cannot show either claim. Decide whether this UI belongs beside the panel or in a generic Petrinaut extension once the wiring exists. The process-model plugin will deepen the accounting later, but harness captures and derived completion already support this task.

**Extraction:** `heading-first`
**Inner:** 1355 characters; `864ae481d518556b75611b62baf28fb2de7df4d8db340d87de86942ccea9130f`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1448

**Title:** Petrinaut hosts render their own interactive chat tools → **Let Petrinaut hosts render interactive chat tools**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

Petrinaut’s chat panel can render its own interactive tool, but hosts cannot register equivalent tools because the registry is private and fixed. Add a typed public extension for host-provided parsers, components, and submitted outputs, and prove it with tests and a runnable example. Existing tools must retain their behavior, unknown tools must still fail loudly, and the product code must remain free of brunch-specific details.

**Extraction:** `heading-first`
**Inner:** 1998 characters; `d3722991fd835760a4d8a24c5822e68439a3860fb2308a354812cfafea0bf73e`
**Ambiguity:** None
**Banned-word matches:** None

## FE-1449

**Title:** A structured brunch question suspends and resumes visibly in Petrinaut → **Prove a structured brunch question suspends and resumes in Petrinaut**

**Current outer**

_None; the source body is retained as the inner record._

**Proposed outer**

The next working prototype must connect the actual brunch agent to Petrinaut’s chat panel through the existing structured question flow. A correlated human answer must resume the same Flue conversation, while stale, forged, duplicate, unrelated, and machine-generated outputs remain excluded from user evidence. The committed prototype must also make question state, correlation IDs, suspension, return, and resumption visible without feeding diagnostics into evidence.

**Extraction:** `heading-first`
**Inner:** 2980 characters; `acd7ce7b5b6bf664d57404bd478ac63a98039fa232ad5832d2706f11a3a4dbd0`
**Ambiguity:** None
**Banned-word matches:** None
