# Linear migration review: FE-1366

Generated: 2026-08-20T09:03:27.215678Z
Issues: 14
Banned-word scan: no exact matches in any proposed title or outer section.

## FE-1366

**Title:** Spec the elicitation harness architecture (archived wayfinder map) → Document the elicitation harness architecture

**Current outer**

This is the completed planning map for the **elicitation harness**: the architecture that generalizes brunch's AI interviewer into a reusable library, able to interview people about different kinds of subject matter through pluggable target definitions — so the same interviewing machinery can produce, say, software specs in one setting and process models in another. Planning finished on 2026-08-10; the outcome is a reviewable specification, in the brunch-lite repo at `docs/planning/elicitation-kernel/spec.md`, alongside a plain-language product description. The build, and the September demo that motivates it, are planned on the successor map FE-1357.

Everything below the divider is a verbatim mirror of the map as it was worked in repo markdown, kept for team visibility.

**Proposed outer**

This completed planning map defines an elicitation harness that turns the existing AI interviewer into a reusable library for different subject areas. Planning finished on 2026-08-10 and produced `docs/planning/elicitation-kernel/spec.md` plus a plain-language product description. FE-1357 plans the build and the September demo that depends on it.

**Extraction:** `first-standalone-divider`
**Inner record:** 21791 characters; SHA-256 `5dc0886da2a1b3b2373a1e3f0e172b2adb805003a15aa782200015be298fbd56`
**Ambiguity:** None

## FE-1367

**Title:** Flue architecture deep-read [archive] → Define how the elicitation harness uses Flue

**Current outer**

Read Flue — the web/agent framework the interviewing library runs on — closely enough to know how the library should ship on it. Conclusion: embed as a library inside a host-authored app, which is Flue's natural grain; Flue has no built-in "pause and ask the user" facility, so the library owns its own turn-taking mechanism. Resolved 2026-08-06; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This research determined how the interviewing library should run on Flue. The library belongs inside a host-authored app, and it must manage conversational turn-taking because Flue does not provide a built-in way to pause and ask the user. The research was resolved on 2026-08-06 as part of the completed elicitation-harness plan.

**Extraction:** `first-standalone-divider`
**Inner record:** 19780 characters; SHA-256 `6d565c7365ebc78f76a053a624703acd07ac03cb40a6c8cb3c127bc0de30a087`
**Ambiguity:** None

## FE-1368

**Title:** zil-lean survey [archive] → Assess zil-lean as an elicitation subject

**Current outer**

Examined zil-lean, a prototype claim-graph system, as a candidate second practice subject for the interviewing architecture. Conclusion: it contains no interviewing itself, but it is a working proof of the claim-graph idea; a smaller "assurance argument" slice was chosen as the second subject instead of the full system. Resolved 2026-08-06; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This research assessed zil-lean, a prototype claim-graph system, as the second subject for testing the interviewing architecture. zil-lean does not include interviewing, but it demonstrates the claim-graph model. The plan therefore chose a smaller assurance-argument subject instead of the full system and resolved the research on 2026-08-06.

**Extraction:** `first-standalone-divider`
**Inner record:** 18905 characters; SHA-256 `ae5914e467433c3a0002f56350c81322249cc6eb04ab971cf4371f994ab35d26`
**Ambiguity:** None

## FE-1369

**Title:** Brunch exchange-schema audit [archive] → Classify Brunch exchange structures for reuse

**Current outer**

Catalogued how the existing brunch app structures its question-and-answer exchanges, sorting every part into keep / adapt / leave behind for the new library. The generic asking machinery survives; brunch-specific vocabulary and review structures do not. Resolved 2026-08-06; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This audit classified each part of the existing Brunch question-and-answer exchanges by whether the new library should keep, adapt, or leave it behind. The generic asking machinery remains useful, while Brunch-specific vocabulary and review structures do not carry forward. The audit was resolved on 2026-08-06.

**Extraction:** `first-standalone-divider`
**Inner record:** 24404 characters; SHA-256 `09086b43d756206ba140c9019b0a1b0d89cb74d9783bfede2317e047e884e130`
**Ambiguity:** None

## FE-1370

**Title:** Contract decomposition: kernel / host / plugin / pack boundary [archive] → Define the harness and plugin responsibilities

**Current outer**

Decided how responsibility splits between the generic interviewing engine and the pluggable subject-matter definitions. The engine owns a domain-free envelope around whatever a plugin stores — with evidence links, confidence, and explicit "no answer" states — and typed issues as its feedback channel; there is deliberately no universal data model. Resolved 2026-08-07; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This decision assigns responsibilities between the generic interviewing engine and the subject-matter plugins. The engine owns a domain-free envelope for plugin data, including evidence links, confidence, explicit absence states, and typed issues for feedback. The design does not impose one universal data model and was resolved on 2026-08-07.

**Extraction:** `first-standalone-divider`
**Inner record:** 10944 characters; SHA-256 `a8617883eff469f2b9a5dce712067f072907d7ca666141998a19d46323477384`
**Ambiguity:** None

## FE-1371

**Title:** Questioning-UX contract [archive] → Define structured questions within conversation

**Current outer**

Decided how structured questions live inside a free-flowing conversation: the conversation stays primary, forms and choice strips are dropped into it as interactive elements, and captured knowledge is extracted afterwards in repeatable sweeps rather than question-by-question. Also fixed the system's four-layer naming (substrate / ui / harness / plugin). Resolved 2026-08-06; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This decision keeps free-flowing conversation primary while placing forms and choices within it as interactive elements. The system extracts captured knowledge through repeatable range sweeps after the conversation rather than after each question. It also establishes the four component names: platform, UI, harness, and plugin. The decision was resolved on 2026-08-06.

**Extraction:** `first-standalone-divider`
**Inner record:** 9887 characters; SHA-256 `6abd613018b32d1ce53af2ef93b056e10c3c89ad68f43950a792f102edfb5db3`
**Ambiguity:** None

## FE-1372

**Title:** Shipping shape: kernel library vs. Flue agent [archive] → Choose how the elicitation harness ships

**Current outer**

Decided what actually ships: a harness library inside a thin host-authored agent — not a standalone product — organized as a workspace monorepo with the plugin SDK as its public surface, and tested by generated, replayable interview fixtures rather than live model calls. Resolved 2026-08-08; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This decision makes the deliverable a harness library inside a thin host-authored agent rather than a standalone product. A workspace monorepo exposes the plugin SDK, and generated replayable interview fixtures test the system without live model calls. The decision was resolved on 2026-08-08.

**Extraction:** `first-standalone-divider`
**Inner record:** 12470 characters; SHA-256 `92eed4355aa2a82a0ba5d4e65d53ac27de767087bbce2f98c387b70f0d9e3478`
**Ambiguity:** None

## FE-1373

**Title:** Dev-target portfolio confirmation [archive] → Choose the initial elicitation subjects

**Current outer**

Confirmed the two practice subjects the architecture is built against — Gherkin scenarios and assurance arguments (BPMN third) — because building two very different subjects at once forces the plugin model to stay genuinely general. Resolved 2026-08-07; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This decision selects Gherkin scenarios and assurance arguments as the two initial subjects, with BPMN third. Developing two different subjects together tests whether the plugin model remains general. The decision was resolved on 2026-08-07.

**Extraction:** `first-standalone-divider`
**Inner record:** 4404 characters; SHA-256 `af4bb40e8c7c41c4f1c03c942e33f45a93b4934d3850af95029ff474e268a702`
**Ambiguity:** None

## FE-1374

**Title:** Assemble the spec [archive] → Assemble the elicitation harness specification

**Current outer**

The destination of the whole planning effort: assembled the full specification from every resolved ticket — fourteen sections plus an appendix of adjudicated contradictions. The spec lives at `docs/planning/elicitation-kernel/spec.md` (brunch-lite repo), with a companion plain-language product description. Resolved 2026-08-10; this closed the parent map.

**Proposed outer**

This task assembled the completed planning decisions into a fourteen-section specification with an appendix that resolves prior contradictions. The specification is at `docs/planning/elicitation-kernel/spec.md`, with a companion plain-language product description. It was completed on 2026-08-10 and closed the parent map.

**Extraction:** `first-standalone-divider`
**Inner record:** 9377 characters; SHA-256 `4f36c5012d06ba284886145fb9fec5c92aa650338986366b9c619ef383874030`
**Ambiguity:** None

## FE-1375

**Title:** Formal-verification canon survey [archive] → Align the assurance subject with verification practice

**Current outer**

Checked the second practice subject against the formal-verification literature. Verdict: "proof obligations" was the wrong name — a category error to verification readers — so the subject was renamed to the assurance argument, aligned to the GSN standard with vocabulary borrowed from Dafny. Resolved 2026-08-10; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This research compared the second practice subject with formal-verification literature. It found that “proof obligations” named the wrong concept for verification readers, so the plan renamed the subject “assurance argument” and aligned it with GSN and Dafny vocabulary. The research was resolved on 2026-08-10.

**Extraction:** `first-standalone-divider`
**Inner record:** 19571 characters; SHA-256 `b3522ac5372aa5e91bac588fead9e7603c59d5fd669f256d1bc627d68a7e4b7a`
**Ambiguity:** None

## FE-1376

**Title:** Walking skeleton: Flue question round-trip [archive] → Prove a Flue question round trip

**Current outer**

Built a working skeleton on real Flue proving a structured question can travel from the agent to the user and the answer back — with the discovered constraint that only one live question can be pending at a time, which became a rule in the spec. Code on branch `prototype/10-flue-roundtrip` (brunch-lite repo). Resolved 2026-08-09; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This prototype demonstrated that a structured question can travel from the agent to the user and return with an answer on Flue. It also found that only one live question can remain pending, which became a specification rule. The code is on branch `prototype/10-flue-roundtrip`, and the task was resolved on 2026-08-09.

**Extraction:** `first-standalone-divider`
**Inner record:** 7972 characters; SHA-256 `c211016d13a5e46835dddd71c1c611027dc47df950221d50117a51e06622b450`
**Ambiguity:** None

## FE-1377

**Title:** Logic-prototype: capture sweep & settlement [archive] → Prove repeatable conversation capture

**Current outer**

Built an isolated prototype proving the knowledge-capture mechanics: deciding when a stretch of conversation is ready to harvest, harvesting it repeatably without double-counting, recording "no answer" as real information, and correcting earlier captures without erasing history. Code on branch `prototype/11-capture-sweep` (brunch-lite repo). Resolved 2026-08-09; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This prototype demonstrated the knowledge-capture mechanics: deciding when conversation is ready to collect, collecting it repeatedly without duplicate records, treating an absent answer as information, and correcting prior captures without deleting history. The code is on branch `prototype/11-capture-sweep`, and the task was resolved on 2026-08-09.

**Extraction:** `first-standalone-divider`
**Inner record:** 11032 characters; SHA-256 `98d7b96fd075a96786c314905d3c2fe3bcf5661d0f18ee234b167f21a7c02dbc`
**Ambiguity:** None

## FE-1378

**Title:** Multi-session elicitation & durable target state [archive] → Define durable state across elicitation sessions

**Current outer**

Decided how work survives across conversations: a durable target-document holds all captured knowledge and the full session logs; individual chat sessions are transient, never formally close, and can always resume against the current state. Storage went to the platform adapter, not the plugin — flipping an earlier hypothesis. Resolved 2026-08-10; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This decision makes the target document durable, including captured knowledge and complete session logs, while individual chat sessions remain temporary and resumable. It assigns storage to the platform adapter rather than the plugin, reversing the earlier hypothesis. The decision was resolved on 2026-08-10.

**Extraction:** `first-standalone-divider`
**Inner record:** 7774 characters; SHA-256 `9c8b6e6bcc99322400c0c25629d1f0e4939e8496ba3dfb43cafe064b8144a4a2`
**Ambiguity:** None

## FE-1379

**Title:** Walking skeleton: sweep seam on Flue [archive] → Prove the remaining Flue capabilities

**Current outer**

Built the second walking skeleton on Flue, proving the four remaining platform capabilities the spec depends on (knowing when to harvest, reading conversation history, injecting system notes, and safe storage under retries) — completing the evidence base for the spec. Code on branch `prototype/13-sweep-seam` (brunch-lite repo). Resolved 2026-08-10; part of the completed elicitation-harness planning (see parent map).

**Proposed outer**

This prototype demonstrated the four remaining Flue capabilities required by the specification: detecting when to collect knowledge, reading conversation history, injecting system notes, and storing data safely during retries. This completed the specification’s evidence base. The code is on branch `prototype/13-sweep-seam`, and the task was resolved on 2026-08-10.

**Extraction:** `first-standalone-divider`
**Inner record:** 16760 characters; SHA-256 `6a1ed589c55484beda4a01d588643c6d5835b60653166b164c6a2cd13dc2f728`
**Ambiguity:** None
