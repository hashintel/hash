# Passage-policy draft — false-green oracle withheld

## Observed counterexample

The integration owner reviewed draft `apps/brunch-agent/test/passage-policy.integration.ts` in the dedicated worktree based on `b5a8b6224d`. Source SHA-256 was `75acd84f923db46e72dc61bbc7003cf603819d1598c82d42073591658b866f1a`. The importer uses the built ownership-guarded ChatAgent, native synthetic SDK responses, actual core source/locator/revision tools, fresh TEST conversations and original-store runtime reload. No browser/listener or positive browser outcome is supplied; fixture binding is labelled solely as a mount prerequisite.

The owner ran the original, then a copy changing only `assert.equal(settled.currentWorkpiece.ordinal, 1)` to expect `999`. **Both exited zero, printed `PASSAGE_POLICY_MATRIX_PARTIAL`, returned 56 rows / 209 synthetic requests, and retained actual seed ordinal 1.** Thus this draft's presence checks do not prove that all required callback assertions passed. The child's original source remained byte-identical; the owner's temporary same-package mutant was removed afterward, preserving both sources and outputs under `/tmp/m7-passage-owner.0y3RT4` and this packet.

The existing `nativeSchemaProvider` helper converts the faux result into normal native end-turn/tool-use framing based on content, without carrying the faux error stop reason. A response-factory assertion can therefore become a successful empty native response. The draft assigns `settled`, `actual` or `reopened` before asserting; later presence checks can pass despite the earlier assertion's failure. This is a test-oracle defect, not evidence that current production carry or ordinal semantics failed.

## Commands and limits

Both runs executed from the passage worktree's `apps/brunch-agent`, with the previously verified `native-local-delivery/deny-network.sb`, explicit fresh `PASSAGE_POLICY_OUTPUT` directories and `node --experimental-strip-types`. The original used `test/passage-policy.integration.ts`; the mutant used an owner-created temporary `.ts` file in that same test directory to preserve exact module resolution. No runtime dependency, production source, real ledger or credential was changed. No paid request occurred.

`original.ts.gz` and `mutant.ts.gz` preserve the sole changed assertion; `control/result.json.gz` and `mutant/result.json.gz` preserve actual mounted results, with exact logs/exit codes. Artifact hashes retain the original source bytes. The local full context/history captures remain diagnostic artifacts, not state import authority.

## Disposition and authorized next step

The hermetic importer and optional package script were admitted separately in owner commit `a45f9b2777`, directly on the worker branch. That admits its execution surface, **not the matrix's correctness or Partial verdict**. Matrix credit remains withheld until the exact impossible-ordinal mutant fails and a later carry/lookup comparison also demonstrates that the fix is not seed-only.

Correct the focused test locally: move required comparisons outside the swallowed response-factory boundary or independently verify complete/error-free callback execution after SDK completion. Do not weaken assertions, add production fields/semantics or edit the shared native helper during the concurrently frozen construction review. The trailing comparisons against deliberately different objects are ordinary assertion checks, not independent mutations of the actual matrix oracle; strengthen or label them accordingly.

The separate observed acceptance of an explicitly declared, in-bounds old numeric span over changed text is not itself a production identity defect: evidence relations are interpreted in the submitted current Markdown and do not authenticate the origin of a lookup or semantic relevance. Preserve that limit rather than invent a hash field or promote structural validity into meaning. Existing revision-local fallback remains the candidate policy outcome, pending reliable proof; genuine passage-policy, relevance and owner utility verdicts remain unearned.
