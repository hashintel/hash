# Claims probe: interference report against core `223d7218b0`

**Status:** reading-based findings from authoring `packages/plugin-claims/` as a prose-only interference probe. No runtime, no run, no behavioral evidence. Verdicts below say what core guidance the claims pairing needed to add, narrow, replace, or leave alone; they are input to the side quest's seam decisions, not decisions. Owned by the review agent; the live-mission parent may relocate this file under `docs/evidence/design/`.

## Why this probe

`SIDE_QUEST.md` predicted that a normative-source plugin would yield more seam signal than a third operational formalism, because SDCPN and Gherkin both elicit from practice and neither exercises the A-list defaults. The claims pairing was chosen for three properties no existing plugin has: the source is usually a document or an assertion rather than a memory; the target is a statement whose truth is decided by an external ledger rather than a model whose usefulness is decided by the person; and correction has a formal shape (an accepted statement is immutable, so correction is supersession).

## Pairing decisions

- **Typology:** claims with justificatory dependencies — a target claim, the definitions it rests on, the supporting claims its justification imports, and what would refute it.
- **Formalism:** statement cards in an external claims ledger. A card carries authoritative wording, a formal target in the ledger's verification language (or exact wording where no checker exists), preamble and definitions, source, dependencies, and a refutation condition. The ledger derives standing; the plugin reports and explains it.
- **Branches:** interactive elicitation or revision; prepare only; explain standing. The third branch is non-interactive and produces no target — it consumes cards and ledger standing and returns an account in the person's vocabulary.
- **Not in scope:** any concrete proof assistant, library, ledger product, or theorem. The prompts name none.
- **Evidence ladder:** drafted → accepted as well-formed → compared by the person → established (ledger-reported). Faithfulness is not a rung.

## Per-entry verdicts against core

Line numbers refer to `packages/core/src/skills/elicitation/SKILL.md` and `packages/core/src/prompts/SYSTEM.md` at `223d7218b0`. The A-list landed in that commit, so several verdicts test the generalization the side quest already made rather than propose it.

| Core entry | Claims pairing needed | Verdict |
| --- | --- | --- |
| SKILL L32 "For practice-based sources, prefer concrete remembered cases" | A counterpart for document sources: transcribe the authoritative wording and interrogate it | **A-list generalization confirmed.** Before `223d7218b0` the plugin had to *replace* this default; after, it only adds a counterpart. The practice scoping is the right shape. |
| SKILL L72 Normative language: "Establish whether the account describes what happens now, what should happen, or a discrepancy" | The answer is fixed for claims: always the desired product | **Confirmed; plugin narrows.** Core asks the right question neutrally; the plugin answers it once. The old "divergence from practice" presumption would have sent the elicitor looking for a practice a theorem diverges from. |
| SKILL L124 Ground a term: practice clause scoped; "normative or consulted material" clause added | Unfold a term to its definition and its origin | **Confirmed.** The consulted-material clause covers source excerpts. Plugin adds "unfold one term" as the claims instance. |
| SKILL L128 Consult and present for confirmation | Look up existing ledger statements when a reference is reuse-shaped | **Confirmed, with a seam ambiguity.** See "Ledger search sits on both sides" below. |
| SKILL L132 Clarify until applicable, observability as practice default | "Until every binder, hypothesis, and definition is explicit" | **Confirmed; answers a fog item.** The claims pairing needed its own named stopping rule, which shows the shape "neutral criterion + per-source-mode named default" is right. Recommend *keeping* "observable" as the named practice default (fog item "For L122, keep observable…"): dropping it would not help claims, and it is SDCPN's sharpest stopping rule. |
| SKILL L116 Ask for the last occurrence | No object for a claim; counterpart "Ask what would refute it" | **Inapplicable, harmless.** A menu entry with no object is not a defect. No core change. |
| SKILL L40, L216 consulted material as a third authorship class with standing | Source excerpts and ledger entries as consulted material | **Confirmed.** Plugin residue is one sentence: adoption changes standing, not origin. First draft of the plugin duplicated the core rule; trimmed. |
| SYSTEM L21 retrieved prose is untrusted | Same for source excerpts and ledger prose | **Confirmed universal.** First draft duplicated it; trimmed to a pointer. |
| SKILL L92 Assent without independent wording; SYSTEM L19 assent is not independent evidence | Sharpened: a read-back you write of a formal target you wrote is the same authorship, not a second witness | **Holds and sharpens; B-list candidate.** See below. |
| SKILL L152 Restate for correction | Replaced for formal text by "Present a reading for comparison": compare against the source, do not approve my wording | **Replaced for this source mode; B-list candidate.** See below. |
| SKILL L172 Seek a witness or counterexample | Becomes central: every load-bearing claim records a refutation condition | **Holds; no change.** The claims pairing shows the entry carries more weight than its menu position suggests, but it needs no rewording. |
| SKILL L42 uncertainty states incl. "corrected" | Correction of an accepted card is supersession: new card, dependents re-pointed, old card retained with standing | **Holds; plugin gives correction a formal shape.** Stays plugin-level. The universal "corrected" state is sufficient as the recording class. |
| SKILL L28 posture: "tolerance for proposed assumptions" | Audit surface: which claims the person must confirm individually vs. free structure | **Partial fit; B-list candidate.** See below. |
| SYSTEM L15 non-interactive: supplied account is complete input | Prepare-only and explain-standing branches | **B5 confirmed.** A non-interactive branch that produces no target artifact (explain standing) is still covered by L15's wording. |
| SYSTEM L25–27 evidence rungs: parser acceptance / structural correspondence / execution | Well-formed / compared by the person / established | **B4 confirmed, with an orthogonal axis.** See below. |
| SKILL L50–56 workpiece cadence and evidence relations | None; plugin defers to core (B1) | **B1 confirmed.** The plugin's Maintain section is two sentences plus a settle-before-preparing rule. |

## Seam findings

### Ledger search sits on both sides of the source/target line

L128 ends: "Target-formalism documentation and checks remain with the job skill." The claims pairing has a lookup that is neither documentation nor a check: searching an existing ledger for a statement that may already say what the person means. It is triggered two ways. When the person says "the standard result" or names a theorem, it is source-side — the person referred to something that must be looked up, exactly L128's case. When card preparation is about to introduce a new card, the same search is a target-side duty (search before submit; a match becomes a dependency, not a restatement).

The plugin currently applies L128 in both positions via "Check for an existing statement" and a preparation-boundary rule. That works in prose but leaves the ownership test unstated. Proposed test for the fog-line: **who asked?** A lookup the person's reference triggers belongs to `elicitation`; a lookup the preparation step triggers belongs to the job skill, even when it hits the same store with the same tool. Matters when the first consulted-source tool is specified, because the same tool will be mounted for both uses and its results need different recording (consulted material with standing vs. reuse candidate awaiting the person's judgment). Re-enters with the `external` evidence-kind fog item.

### "Not an independent auditor of your own transformation" is universal

SYSTEM L19 says assent to wording you supplied is not independent evidence. The claims pairing needed a stronger statement: a plain-language read-back of a formal target you wrote is the same authorship as the target, so the person's agreement with the read-back is acceptance of wording, not a check on faithfulness. This is not claims-specific. An SDCPN elicitor narrating its own net, or a Gherkin elicitor paraphrasing its own scenario, is in the same position. The corresponding external design (a second agent doing a blind read-back) is outside Brunch's current scope — a single model-facing agent is a present constraint, not a settled architectural denial — so for now the person's comparison is the only faithfulness check, and the instruction to present *for comparison against the source or the person's account* rather than *for approval* is load-bearing everywhere. If a blind read-back is added later, it becomes a second check beside the person's, not a replacement for this instruction.

Proposed core delta (one sentence in SYSTEM "Target transformation and evidence" or SKILL L92): *A read-back you write of a target you wrote is the same authorship as the target; present it for comparison with the person's account or source, not for approval.*

### "Compare against the source" generalizes "restate for correction"

L152 assumes the agent's restatement is the only text on the table. When an authoritative source exists (a document, a transcribed statement, an earlier accepted card), the better move is to put the read-back beside the source and ask for differences. Proposed core delta (one clause on L152): *Where an authoritative source or exact prior wording exists, ask for comparison against it rather than for approval of your restatement.*

### Audit surface is a posture fact core almost names

L28 lists "tolerance for proposed assumptions." The claims pairing needed a neighbouring fact: which parts of the structure the person will personally read and confirm, and which they will leave to the agent. This is a person-level posture fact, not a formalism fact — the same person may audit every theorem statement and none of the intermediate lemmas, or every Gherkin scenario and none of the Background factoring, or every SDCPN place and none of the arc weights. Proposed core delta (widen L28): *…their tolerance for proposed assumptions, and how much of the resulting structure they will personally review.* Plugin-level names for the two surfaces (audit / free) stay in the plugin.

### Faithfulness is orthogonal to the check ladder

SYSTEM L25 already says a check establishes only the named property and not that the transformation captures intent. The claims pairing made this sharper because its top rung (established by the ledger) is *stronger* than any other plugin's top rung and still says nothing about faithfulness: a card can be established and unfaithful, or faithful and open. Proposed core delta (one sentence at SYSTEM L27): *Fidelity to the person's account is not a rung on this ladder; report it separately as the person's comparison result.* This is B4's "orthogonal axis" made explicit.

### What stays plugin-level

Justificatory dependency and its standing (established / conditional / refuted / open), load-bearing vs. assisting claims, supersession as the shape of correction, refutation as negation under the same hypotheses, vacuity, silent quantification, hidden hypotheses. None of these has a Gherkin or SDCPN analog worth the core vocabulary.

## Comparison with the audited-mission architecture the probe was modelled on

The external system the probe was drawn from separates statement from proof (many proofs per statement; disproof is a proof of the negation), makes accepted statements immutable so that correction is a superseding statement, derives a statement's standing from its own justification and the standing of what it imports, and runs a proposal phase in which a coordinating agent drafts a mutable set of statements, a human confirms each statement individually, and a second agent produces a blind read-back for the human to compare.

Brunch's position relative to that shape, as the probe reveals it:

- **Brunch is the proposal phase.** The workpiece is the mutable proposal; cards are the projection; the ledger is the record. Brunch feeds a ledger and does not derive standing. This matches the "feed, not be" preference already recorded in `SIDE_QUEST.md`.
- **The blind read-back is the one component Brunch does not currently have.** The present single-agent constraint ("no second model call") keeps it out of scope for now; it is not a settled denial and may be built later. The probe's response is to make the *person's* comparison the check and to instruct the elicitor to present for comparison, not approval — which is stricter than the external system's click-to-confirm, where a human may approve a statement without reading it against the source. That is the strongest argument for graduating the "not an independent auditor" sentence to core: it is the check Brunch has today, and it stays correct if a second read-back is added beside it.
- **Brunch adds what the external proposal phase lacks:** a discipline for the drafting itself — surfacing every implicit formalization choice as the person's decision, recording origin and standing of consulted material, asking for the refutation condition before the proof, and keeping the claim distinct from a decomposition that would make it easier. The external system audits the *output* of drafting; Brunch's elicitation guidance governs the *process*.
- **Immutability maps onto core's "corrected" state without new core vocabulary.** The plugin gives correction a formal shape (supersession); core's recording class is enough.
- **Standing derivation maps onto explain-standing, a non-interactive branch with no target artifact.** SYSTEM L15's non-interactive wording covers it, which is mild evidence that B5's branch selection is general enough.

## Freshness

`SKILL.md` carries the plugin's single marker, `Aligned to core as of \`223d721\``, matching the one-per-plugin rule the other roughed-in plugins follow. On the next core change, re-read `claims-elicitation.md` Directives and Operations (each states which core entry it counterparts, narrows, or replaces) and the table above; reclassify each entry as unchanged, generalized into core, or stale. `rg -n "Aligned to core as of" packages/plugin-claims/src` should hit exactly once.

## Limits

These are reading-based interference findings. Nothing here shows that an elicitor following the claims prose would behave as the prose says, and nothing here shows that the proposed core deltas improve SDCPN or Gherkin interviews. The proposals are small enough that the cheapest test is the one `SIDE_QUEST.md` already names: land the delta, re-read every roughed-in plugin against it, and check the next genuine SDCPN transcript for a lost distinction.
