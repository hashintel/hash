# Linear migration review: FE-1383

Generated: 2026-08-20T09:04:03.710797Z
Issues: 19

## FE-1383

**Title:** Build the elicitation harness to milestone one — an interview that produces a validated artifact with per-value provenance → **Build the first complete elicitation interview**

**Current outer**

The [elicitation kernel spec](<https://github.com/hashintel/brunch-lite/blob/main/docs/planning/elicitation-kernel/spec.md>) is finished and reviewed, but nothing has been built — the repo holds planning documents and no code at all. Until that changes, the September demo has no library to consume: FE-1362 committed the demo to a purpose-built shell driving a new interviewing library, and this is that library.

Milestone one is the walking version of the whole architecture. A person is interviewed in ordinary conversation; the agent captures what they said as evidence-anchored structured meaning; a plugin turns those captures into a real artifact — a Gherkin feature file for the first target — in which every value traces back to a verbatim quote, corrections never erase history, and anything that could not be represented is reported rather than dropped. The sub-issues below are vertical slices of that path, each one demoable or verifiable on its own.

One capability is deliberately absent. The spec requires a second, harder target to stress the plugin contract before that contract is declared stable, and which target that should be depends on decisions still being resolved on FE-1357 — so the plugin interface stays explicitly unfrozen through this batch, and the last four tickets are a working plan rather than a settled one.

**Proposed outer**

The elicitation kernel is specified and reviewed, but the repository has no implementation. The September demo depends on this library to interview a person, preserve evidence and corrections, and produce a Gherkin artifact whose values trace to verbatim quotes.

This milestone builds that complete path through independently verifiable sub-issues. The plugin interface remains unstable until FE-1357 resolves the harder second target, so the final four sub-issues remain a working plan.

**Extraction:** `first-standalone-divider`
**Inner record:** 1289 characters; `dc692280cc915bda482146be207015d0dcdd034d4ad8fbd09d37c40b2b4897ee`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1384

**Title:** Generative test corpus over the replay driver → **Generate replay tests for the harness rules**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

Earlier work has accumulated hand-written replay tests, while the ten harness rules are stated as properties. This task will derive generated conversations and values from plugin declarations, run the rules against those sequences without a model or runtime dependency, and retain reduced failures as regression cases.

The amount of generation needed for milestone one, the role of offline model-generated fixtures, and the fixture refresh process still need decisions.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 1849 characters; `dc23151710c724730fd5e28460cf1e18ad96ee9b6faf63acf4c4385c7b963ab8`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1385

**Title:** Dev app — target gallery and diagnostic probe surface → **Expand the dev app into a target gallery and diagnostic view**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

The dev app currently serves as a test UI. This task will make it support local development, side-by-side target demonstrations, and a diagnostic view of session state, tool traffic, suspensions, and injected signals.

The required diagnostic depth, the timing of a gallery before a second target exists, and the actions a colleague must perform without help remain unsettled.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 1674 characters; `1bd36079855c694a19c2c16781b8fe79cb03ea9ed3cd3bbce9b31f3ba0993cb4`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1386

**Title:** Verify compaction leaves the durable entry projection intact → **Test durable history across transcript compaction**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

The specification says transcript compaction may reduce model context without removing entries that evidence references resolve, but no test has crossed a real compaction boundary. This investigation will determine whether old evidence pointers and session state survive, then record either confirmation or the exact archive work the binding must perform.

The test design depends in part on whether Flue provides a compaction definition.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 1525 characters; `b032d11e90f77e094632a0437a00a3b19ba43f3b74d851fda5f9983d7059a675`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1387

**Title:** Author the second pack and freeze the plugin contract → **Choose a second target and stabilize the plugin interface**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

Gherkin alone cannot establish a stable plugin interface because it does not exercise evidence grading, graph-shaped payloads, or derived domain labels. This task will build a harder second target through the same harness, record the interface changes it requires, and then judge the interface against the specified proof obligations.

FE-1364 must first choose between the specified assurance-argument target and the demo's process-model target; that choice also determines whether this work is demo-critical.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 2091 characters; `0e246edd61bf61e1ca4ca67103d4f396f0d7b1d11611474727197431788ca94b`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1388

**Title:** Scaffold the Bun workspace and prove the CI smoke → **Create the Bun workspace and enforce dependency boundaries**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

The repository needs a Bun workspace that builds and tests from a clean checkout before feature work begins. This task will create the specified core, Flue binding, Gherkin plugin, and dev-app boundaries, then enforce their dependency direction in CI without model credentials or network access.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 1419 characters; `5b79a1a15bf83d384bc11b114188db2252eeec734c0299f196f56f83c59a4d94`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1389

**Title:** Walking skeleton — the harness asks a free-text question and binds the reply → **Implement the first suspended free-text question**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

The harness needs to ask a free-text question, suspend the turn, receive a typed answer, and continue a real dev-app conversation. This task will move the proven prototype mechanism into the main workspace while keeping the question out of instructions and binding replies mechanically to the single pending affordance.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 1681 characters; `3623852992eec05f9567c745d0d253773713feb486dbef929fc28db16f7a317c`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1390

**Title:** Capture envelope, storage port, and the local capture store → **Implement capture history and local persistence**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

The harness needs a local store for captures, corrections, contradictions, retractions, and resolution records that never overwrites history. This task will define the capture envelope and persistence port, derive status when reading, reject invalid lifecycle changes, and apply each sweep atomically without requiring a model or runtime.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 1859 characters; `dce103e6c13f999a39d866e51e61826185cc97f34dd221baa2a8b8f55bf77826`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1391

**Title:** Durable entry projection, harness-resolved anchoring, and the session-log archive → **Resolve evidence quotes to durable conversation entries**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

Captures must cite durable user entries, but the model is reliable with verbatim quotes rather than entry numbers. This task will resolve each quote against true user entries, reject missing or invalid evidence, retain every read entry in the archive, and keep cited entries retrievable independently of runtime history retention.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 1778 characters; `464a7faf1c52aa7bbc16b542aee5d1085fff78cd671575e61dd832e2ec6295d0`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1392

**Title:** Settlement trigger and sweep — the first captured statement → **Capture settled conversation statements safely**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

The harness can ask questions but cannot yet turn a completed topic into stored meaning. This task will detect an unswept conversation range, let the agent judge whether it has settled, and store quote-anchored captures through an atomic operation that is safe to repeat. It will also preserve the high-water mark and report unanswered asks without blocking capture.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 1623 characters; `7a58e8a4d7e8960c3b41b0b0a91396e7c14f002f3fbf68ec63aa3dfdc8e46b3b`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1393

**Title:** Plugin SDK and the gherkin plugin — the first projected artifact → **Produce the first Gherkin artifact through the plugin SDK**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

The first complete artifact should turn an interview about a feature into a valid Gherkin file and a typed report of information Gherkin cannot represent. This task will implement the pure plugin operations, injected harness context, authoring packs, validation, and failure atomicity needed for that path.

The SDK remains unstable until a harder second target tests the interface.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 2214 characters; `eb4be2fba6a05bdbcdace930230c21ca24be097e2d707bcbf8441cebeb1367c8`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1394

**Title:** Conflict, supersession, and the interpretation render → **Preserve conflicts until the user resolves them**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

When a person contradicts an earlier statement, both interpretations must remain visible until the person resolves the conflict. This task will store the alternatives and resolution evidence, distinguish correction paths, and render the harness's interpretation with uncertainty intact. It will also keep interactive questions separate from informational renders and distinguish answered, redirected, and unanswered outcomes.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 1847 characters; `59342c6a55a213c528d8566c757ac6a85af9a08819e19af57664798e93b8d2ef`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1395

**Title:** The full affordance set — choices, questionnaire chaining, and the absence strip → **Add choices, questionnaires, and explicit absence replies**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

The harness currently has only free-text questions. This task will add single-choice, multi-choice, and locally chained questionnaires, plus explicit replies for unknown, inapplicable, and deferred answers.

Because inbound replies are strings, the transport must distinguish a UI action from identical typed prose; clients that only render markdown will continue to produce honestly inferred absences.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 2031 characters; `2a5426c3cda4bfd5d3b5e7451880acfb2000efd8f906ae9512651fa23aa94d01`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1396

**Title:** Re-entry briefing, resume reconciliation, and restart durability → **Restore interview context after resume and restart**

**Current outer**

_None; the source body starts with a heading and is preserved as the inner record._

**Proposed outer**

A returning interview must reflect captures, conflicts, unswept conversation, and a pending question that changed while the agent was away. This task will compute and inject that briefing, preserve all session state through restart, and prevent injected system facts from being cited as user evidence. Completion remains derived when reading, so a later correction follows the normal path.

**Extraction:** `heading-first-whole-body-as-inner`
**Inner record:** 2123 characters; `a107fcbcc646a6054c66bd208141252bda7298308546c689e1fcf9d0ff79d797`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1399

**Title:** Make the CI gates and dev app fail loudly where review found they fail silently → **Fix verified silent failures in CI and the dev app**

**Current outer**

The FE-1361 code review swept the whole repo and verified five findings that fall outside that ticket's scope. Three sit in the merge gates themselves: the checks that are supposed to keep workspace boundaries honest can currently go red on an innocent comment-only edit, silently skip any newly added workspace group, and let a misspelled tool operation name compile — so the gates either cry wolf or pass vacuously, which matters most in a repo whose gates are its main safety net. The other two are silent-failure seams in the dev app: a route path duplicates the one identifier the codebase pins as never-drifting, and the production asset route serves a narrower set of files than the client build can emit, so the first added font or image would break production only. All five have verified failure scenarios; each fix is small and none blocks current work.

**Proposed outer**

The FE-1361 review confirmed five small failures outside that issue's scope. Three CI checks can reject harmless text, omit new workspace groups, or accept misspelled tool operations; two dev-app routes duplicate a pinned identifier or fail on asset types the client build may emit.

This task will make those checks and routes report the verified failures without changing unrelated behavior; none currently blocks other work.

**Extraction:** `first-standalone-divider`
**Inner record:** 1969 characters; `e7bbd746c9bcb2d4c9922968d638266edff9b833de4e22b655d8ac0ee22f3456`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1400

**Title:** Close the review-found gaps where the gates, dev app, and baseline runner still fail silently → **Strengthen verification, dev storage, and the baseline runner**

**Current outer**

During the FE-1397 tie-off, a full adversarially-verified review of the branch stack's diff against main surfaced ten confirmed correctness findings plus a handful of cleanups — none in the FE-1397 docs themselves, all in earlier branches' work. The common thread is uncomfortable: several of the checks FE-1399 added *to make silent failures loud* can themselves pass vacuously (a build-artifact witness matched by bootstrap code regardless of what got bundled, nested `test/` directories escaping every boundary invariant, a CI-gate check satisfied by commented-out gates, known-gap predicates that an empty stub file flips). Alongside those: the dev app's durable conversation store resolves its default path against the launch directory — the exact restart-durability failure the file's own comment says it exists to prevent — and the baseline runner can silently drop or truncate its main deliverable and dies on a single network blip hours into a paid run. The always-loaded agent instructions also still describe the triage roles as five verbatim labels, contradicting the rewritten triage doc's state/label mapping.

This ticket bundles all fixes as one refactor, executed as small always-green commits: documentation truth first, then the test-integrity fixes (each proven by temporarily breaking the guarded property and watching the gate go red), then the one behavioral dev-app fix, then baseline-runner robustness, then the cleanup tail. Filed from the FE-1397 thread's review output; to be claimed and run in a follow-up session.

**Proposed outer**

The FE-1397 review confirmed ten correctness problems and several smaller cleanups in earlier branches. Verification checks can pass without testing the claimed property, the dev store can appear empty after launch from another directory, and the baseline runner can omit or truncate its artifact or stop after a transient network failure. The always-loaded triage guidance also contradicts the current state-and-label mapping.

This task will fix those areas through small green commits, proving each strengthened check by making the guarded property fail temporarily. The official Anthropic SDK is preferred for runner retries and usage accounting, but a local retry implementation remains an acceptable fallback if the dependency is rejected.

**Extraction:** `first-standalone-divider`
**Inner record:** 8174 characters; `aa47cdaca48abf4436fbda2ab03d226e6c93c97f1dc3d4ee6bf0e1ad66e92f29`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1419

**Title:** Close the seams where the capture store and verification gates claim more than they enforce → **Align capture-store rules and verification claims**

**Current outer**

An inductive review of the open PR comments (2026-08-14) found two seams that still claim more than their implementations support. The capture store applies different rule sets at command time, persisted-parse time, and lifecycle-transition time — so a command can return success for a snapshot the next read rejects, and an open conflict can end up with no legal way to close. And the verification layer still infers runtime facts from source text: substring and regex proxies stand in for "the gap closed", "CI ran this gate", "this test is hermetic". Until these close, green gates and successful commands overstate what is actually guaranteed — the same silent-failure family the FE-1399/FE-1400 sweeps addressed, one level deeper (two of the queue's commits replace countermeasures FE-1400 itself introduced).

The plan is a nine-commit queue that gives each contract one owner and makes negative results precise; it is authored and ready to execute.

**Proposed outer**

A review of open PR comments found that the capture store applies different rules when accepting commands, parsing persisted data, and changing lifecycle state. A successful command can therefore create data that the next read rejects or leave a conflict with no legal resolution. Verification checks also infer runtime behavior from source text, so green checks can overstate what ran.

The prepared nine-commit plan assigns each rule one owner and replaces these proxies with precise negative results after FE-1390 and FE-1400 land.

**Extraction:** `first-standalone-divider`
**Inner record:** 609 characters; `d5eac9c8540f56560f6533189b2bc55fd99ee58d3e3b9babb0cf7a1407f917d3`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1420

**Title:** The affordance protocol survives retries, unknown forms, and abandoned asks → **Make affordance handling safe under retries and abandonment**

**Current outer**

The FE-1389 deep-read (notes/deep-read-fe-1389.md, from the FE-1401 remediation sweep) found three places where the new ask/affordance protocol fails unsafely rather than safely. Flue re-executes tools at-least-once, and a re-executed ask mints the identical affordance — but the pending-slot guard checks only that the slot is occupied, so a benign retry is refused as if the model had asked a second question. The dev UI validates the whole concrete free-text form and renders nothing on a parse failure, so the first affordance of any other form will blank instead of falling back to the markdown floor the spec requires (§7.2/§7.7 — the envelope needs its own schema with the payload opaque). And an ask whose reply never arrives occupies the slot forever: nothing records an `unanswered` outcome (§7.5) and no advisory reports the stuck state (§8.6), so every later ask is refused silently.

None of these blocks the walking skeleton — they are the hardening it deliberately deferred — but the retry refusal will start firing as soon as anything (like the settlement trigger) makes re-execution common, and the markdown floor breaks the moment a second affordance form lands.

**Proposed outer**

The FE-1389 review found three unsafe cases in the ask protocol. A retry of the same ask is rejected as a second question, an unknown form can blank the UI instead of showing markdown, and an abandoned ask can occupy the pending position forever.

These defects do not block the first free-text flow, but retries will become common with settlement and new forms will require the fallback. This task will make identical retries idempotent, parse the envelope separately from its opaque payload, and record unanswered outcomes so later asks can proceed.

**Extraction:** `first-standalone-divider`
**Inner record:** 985 characters; `8d0fad5ee0201cf6c7e62778cd97d219beee824653bbfd520bdae507714c5392`
**Ambiguity:** None
**Banned-word concerns:** None

## FE-1422

**Title:** The ask protocol is substrate-portable: mechanism moves from the Flue binding into core → **Move the portable ask protocol into core**

**Current outer**

The walking skeleton put the whole ask/suspension protocol inside the Flue binding: the affordance id scheme, the one-live-affordance rule, the reply-binding signal payload, and the elicitation instruction text all live interleaved with hook wiring in binding-flue/src/index.ts, while packages/core exports only schemas and naming. That is the spec's second-binding test failing in spirit (§14.2): a second binding would have to re-implement the protocol rather than reuse it, and every slice that adds mechanism the same way deepens the debt — the sweep work (FE-1392) is the next one that would.

The fix is an extraction, not a redesign: a pure ask-protocol module in core (mint an affordance from question + call id, the one-live guard as a pure decision, the signal payload builder, the instruction fragments), with useElicitation reduced to hook wiring — hooks in, protocol calls out. Scheduled ahead of FE-1392 so sweep mechanism can start in core the same way (sweep-protocol) from day one.

**Proposed outer**

The walking skeleton placed reusable ask behavior inside the Flue binding, including identity, the one-live rule, reply signals, and instruction text. A second runtime binding would have to reproduce that behavior, and settlement work would deepen the duplication.

This task will extract pure ask decisions and builders into core while leaving only Flue hook translation in the binding. It is scheduled before FE-1392 so new settlement behavior begins in the portable module.

**Extraction:** `first-standalone-divider`
**Inner record:** 663 characters; `301dbadb8c2872e43533c31fcfa09671e4f425b015f1407526a856406f701fcb`
**Ambiguity:** None
**Banned-word concerns:** None
