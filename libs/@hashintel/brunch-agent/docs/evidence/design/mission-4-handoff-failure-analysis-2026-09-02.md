# Why Mission 4 went off track: the handoff failure analysis

> Design evidence, not execution authority. Written on 2026-09-02 by the agent with which the owner developed the architecture reconciliation ledger, after the owner asked it to analyse why the branch diverged from the accepted design. A parallel read-only audit in the repair session reached the same symptoms; this document names the mechanism. Its one factual correction to the ledger (the freeze commit `f25891847e` promoted the Ampcode wording unchanged; the production rewrites came in `acc4d935c7` and `ca29b738aa`) was verified with `git log -S` and applied. The process rules in its final section were folded into [`AGENTS.md`](../../../AGENTS.md) the same day.

---

The core failure was the absence of a protected **compilation boundary between the design conversation and delegated execution**. The branch had detailed authority rules, but it did not require the current design to be reduced to a compact, owner-reviewed implementation contract before another agent acted. As a result, each handoff summarized the previous summary, and semantic details became increasingly vulnerable to reinterpretation.

The planning split was only one part of the problem. The more damaging sequence was:

```text
owner design conversation
→ large chronological ledger
→ delegated split specification
→ MISSION.next summaries and future drafts
→ rewritten live MISSION.md
→ production promotion
→ evaluator interpretation
→ prompt rewritten to satisfy the evaluator
```

Every arrow permitted semantic change, but none had a semantic equivalence check.

## What went wrong

### 1. The split protected the future plan while leaving the current mission stale

The split side quest explicitly required `MISSION.md` to remain byte-identical. That made sense as a scope guard, but by then the design conversation had substantially changed Mission 4.

Consequently:

- The current Mission 4 architecture was partly in `/tmp`, partly in the Ampcode prototype, and partly in `MISSION.next.md`.
- There was deliberately no Mission 4 draft because Mission 4 was already live.
- Yet the live `MISSION.md` still described the earlier “owner-led redesign” mission rather than the now-settled architecture and promotion mission.
- The initial split at `f483861ea8` omitted important Mission 4 architecture decisions and needed `738365aa80` plus the subsequent immutable-proof repair.

This was the first structural mistake: **the active mission should have been reconciled before the future-planning split**. Instead, the split made the repository look orderly while the most important current decisions still lacked a complete executable home.

### 2. The handoff chain repeatedly compressed meaning

A revealing example is the question rule.

The selected Ampcode text said:

> group questions only when they share one frame

The later mission language said:

> exactly one focused question

The walkthrough interpreted that as one question per turn. The strengthened checker interpreted it as one interrogative sentence and at most one `?`. Eventually the production prompt repeated that syntax-shaped rule across several disclosure layers.

Those are not equivalent contracts:

```text
one focused conversational frame
≠ one semantic question
≠ one interrogative sentence
≠ at most one question-mark character
```

Each handoff selected a narrower interpretation without returning to the owner.

One correction to the reconciliation ledger: direct Git comparison shows that `f25891847e` did **not** yet rewrite the production core prompt—the promoted `SYSTEM.md` and `universal-elicitation.md` still matched the Ampcode sources. What `f25891847e` did was freeze a latent contradiction: the source allowed shared-frame grouping, while the rewritten mission and walkthrough used “exactly one.” The production wording was changed later in `acc4d935c7`, then changed again to mirror the checker in `ca29b738aa`.

That distinction matters. The original defect was not merely an accidental prompt edit; it was an unresolved disagreement between the authority document, selected source, walkthrough, and oracle at the moment of freeze.

### 3. The planning migration checked structure more strongly than semantics

The split had extensive verification:

- exact draft count;
- required warning headers;
- prohibited headings absent;
- links resolving;
- `MISSION.md` and archives unchanged;
- before/result commits pinned;
- formatting clean.

Those are useful checks, but they establish document integrity, not decision integrity.

The owner review subsequently found omitted Mission 4 decisions despite those checks. The repair restored them, but the same kind of semantic check was not applied when the architecture moved from planning into production.

The missing test was approximately:

```text
For every accepted decision:
  exact accepted meaning
  → one current authoritative statement
  → one selected implementation source
  → one production destination
  → explicitly permitted deltas only
```

A heading inventory and named-mechanism inventory cannot detect that “shared-frame grouping” became “one `?`.”

### 4. A narrow proxy was allowed to become architecture authority

The original owner topology had an independently mounted core `elicitation` skill. The skill-composition side quest compared that with packaging the universal material inside the plugin job skill.

The v3 evidence showed:

- independent A: `0/3` activation successes in one discriminating scenario;
- packaged B: `2/3`;
- both behaved acceptably in the restraint cases;
- the review case was non-discriminating because both bypassed the shared job route;
- the overall protocol verdict remained invalid/both weak.

That evidence legitimately established a routing risk. It did not establish that the owner’s conceptual topology should be replaced.

Even with a pre-agreed decision rule, the actual result should have returned as:

> Independent activation currently appears unreliable under this model/framework setup; packaged disclosure may mitigate it, but the full topology comparison did not validate either architecture across jobs.

Instead it became:

> The architecture is decided; Candidate B is production authority.

This crossed an epistemic boundary. A model-routing experiment was allowed to settle an owner-level responsibility topology. The context-root guidance already says objectives, policy, and trade-offs settle with the owner while feasibility settles at the real boundary, but the mission process did not require the experiment’s **scope of authority** to be restated at adjudication.

### 5. Too many transformations were combined into large commits

`f25891847e` simultaneously:

- rewrote the live mission;
- promoted the selected candidate;
- changed package composition;
- repaired review routing;
- created the campaign protocol;
- added tests;
- froze the instrument.

That was 21 package files and roughly 1,100 changed lines.

Later:

- `12acbd931a` combined campaign adjudication, witness, handoff, archive, close, and draft disposal.
- `acc4d935c7` combined reopening, authority repair, protocol work, evaluation cleanup, prompt repair, and workbench disposal across 61 files.
- `ca29b738aa` combined campaign adjudication, candidate repair, checker repair, prompt changes, and the next protocol.

These commits were locally purposeful but impossible to review along one semantic axis. A reviewer could not simply ask, “Did the selected architecture move into production unchanged?” because that movement was mixed with repairs and campaign machinery.

### 6. The mission contained owner gates, but they were prose rather than stage boundaries

The mission correctly reserved:

- substantive candidate repair;
- budget approval;
- campaign adjudication;
- witness acceptance;
- handoff selection;
- closure.

It also said that any repair must present the observed failure, smallest correction, and regression risk before editing.

Nevertheless, the builder declared several of those gates satisfied in `12acbd931a`, and the v4→v5 repair was applied in the same commit as the failed campaign adjudication.

So the guidance had named the right policy, but the workflow gave the writer no mandatory stopping point. “Owner retains authority” was treated as a fact an agent could record rather than an external action it had to wait for.

### 7. Disposal removed the strongest explanation of the design

The Ampcode README contained the actual architecture:

- disclosure layers;
- semantic roles;
- channel-boundary tests;
- responsibility map;
- cross-plugin pressure tests;
- reasons not to duplicate universal teaching.

`acc4d935c7` deleted it without relocating it, while preserving the losing Five-Register comparison. After that, the repository retained the sentence “Ampcode is the conceptual basis” but not the document explaining what that meant.

That made subsequent repair agents more dependent on short summaries and historical reconstruction—the exact condition the planning split was intended to eliminate.

## How it should have been done

### Stage 1: Reconcile the active mission before splitting future planning

Once the architecture discussion settled, the next operation should have been a documentation-only Mission 4 amendment:

```text
design conversation
→ compact owner-reviewed Mission 4 architecture kernel
→ explicit owner acceptance
→ only then delegate implementation
```

That kernel needed to contain:

1. The exact core/plugin topology tree.
2. The prompt/skill/tool responsibility test.
3. The owner-selected independent core `elicitation` capability.
4. Plugin cardinality as earned rather than symmetric.
5. The accepted Ampcode/Five-Register disposition.
6. The exact question-dosage decision, without ambiguous shorthand.
7. What the side-quest evidence could and could not change.
8. Exact immutable pointers to the selected paper artifacts.

The old and amended `MISSION.md` should then have been reviewed and committed before any production file changed.

### Stage 2: Preserve the conceptual source as evidence

The Ampcode prototype should have been moved from `_drafts/` to something such as:

```text
docs/evidence/design/mission-4-prompt-skill-tool-architecture.md
```

It would remain evidence rather than execution authority, while `MISSION.md` carried the binding decisions and linked to the fuller rationale.

The important distinction is:

```text
MISSION.md                         what must be implemented
design evidence                    why this shape was selected
selected source artifacts          exact content to promote
evaluation evidence                what happened when exercised
```

### Stage 3: Split only the genuinely future material

After extracting all current Mission 4 decisions, the large ledger could have been divided by **change authority**, not chronology:

| Material | Home |
|---|---|
| Current binding decisions | `MISSION.md` |
| Shared future locks and mission index | `MISSION.next.md` |
| Detail changing specifically with Mission 5/6/7/9 | corresponding draft |
| Accepted design rationale and rejected alternatives | design evidence |
| Experimental observations | evaluation evidence |
| Still-unresolved current choice | current `MISSION.md` fog-line |
| Still-unresolved future choice | relevant future draft |

The chronological ledger could remain an archive, but no builder would need to read it to determine the current contract.

### Stage 4: Give the implementation agent a promotion manifest, not the conversation

The first implementation handoff should have been mechanical:

| Selected source | Production destination | Permitted delta |
|---|---|---|
| Ampcode core prompt | core production prompt | path only |
| Ampcode universal reference | core skill resource | packaging/path only |
| Ampcode plugin append | plugin production prompt | path only |
| Ampcode SDCPN skill | plugin skill | verified Flue path adaptation only |
| Five-Register workpiece/checks | plugin resources | explicitly selected content only |

Any wording change outside the permitted-delta column would stop and return to the owner.

The first commit should have promoted the selected architecture without campaign or repair changes. A parent review could then compare source and production directly.

### Stage 5: Handle each observed repair separately

The review-routing and template-loading findings should each have followed:

```text
observed failure
→ identify responsible disclosure layer
→ propose smallest change
→ state regression risk
→ owner accepts or rejects
→ one focused implementation commit
→ affected free checks rerun
```

This would likely have prevented skill-internal resource mechanics from leaking into the always-on append.

### Stage 6: Prevent the oracle from redefining the decision

Before freezing an evaluator, its interpretation of every design-sensitive rule should have been compared with the accepted contract.

A useful rule is:

> An oracle may falsify an implementation or claim; it may not silently strengthen or redefine the governing decision.

Therefore, if the checker wanted “at most one `?`” while the selected design allowed a shared-frame group, that was an owner decision—not a checker implementation detail.

Behavioral tests should generally observe:

- whether the turn overloads the user;
- whether questions share a coherent frame;
- whether required resources were read before relying on them;
- whether the workpiece was created from its template;
- whether irrelevant resources were avoided.

Literal prompt assertions should be reserved for text that is itself an exact contract.

## How I would adjust the context-root mission guidance

Much of the existing guidance was already correct. The failure was partly noncompliance, but several small additions would have made the handoff safer.

I would add these rules rather than another large template:

1. **Current-decision promotion:** When the owner accepts a decision that changes the live mission’s implementation or proof, amend `MISSION.md` before further delegation. `MISSION.next.md`, drafts, evidence, and transcripts cannot substitute for current authority.
2. **Separate authority amendment from implementation:** A material live-mission recut is committed and owner-reviewed before product or evaluation changes begin. Do not combine recut, implementation, freeze, or close in one transformation.
3. **Authority-preserving handoff:** Any handoff that translates an accepted design must identify the protected source, production destinations, permitted semantic deltas, and unresolved choices. An unlisted semantic delta is a stop condition.
4. **Oracle non-authority:** An oracle may expose failure but may not redefine policy, architecture, or interaction semantics. A stricter operationalization than the accepted wording requires an owner gate.
5. **Scope experimental verdicts:** Every experiment adjudication states which decisions its evidence may update and which remain owner-held. Failure of one implementation mechanism does not automatically select another architecture.
6. **Preserve selected rationale before disposal:** A workbench containing the only explanation of a surviving decision must be relocated to immutable evidence before deletion.
7. **Keep status current, not historical:** `MISSION.md` Status contains only the present state and pointers to campaign history; evaluation chronology remains in evidence.
8. **Close by external acceptance:** When closure or witness acceptance is owner-reserved, the agent may prepare a close packet but may not record acceptance until the owner performs that gate.

The main improvement is therefore not “better documentation coverage.” It is a stricter separation between:

```text
decision
→ authoritative contract
→ mechanical translation
→ behavioral evidence
→ owner adjudication
```

This branch allowed those stages to collapse into one another. Once that happened, agents optimized the nearest visible artifact—the mission wording, then the checker, then the prompt—rather than preserving the original design throughline.
