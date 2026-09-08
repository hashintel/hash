# A3 review and dispositions

A read-only background review examined the transition semantics, bound adapter and synchronous host seam. Its findings were source-derived counterexamples, not independent browser results. All five findings were checked against the implementation before committing; no paid provider witness was involved.

| Finding | Disposition and discriminator |
| --- | --- |
| A callback returning `applied: true` could coexist with an observed no-op record | Corrected: return/cache a declined output when observation disproves that success. The adapter test asserts both initial and duplicate outputs are `applied: false`. Real canonical helper outputs otherwise remain unchanged. |
| Diff coverage alone could accept an incorrect weight or an existing arc update as an applied insertion | Corrected with shared `observedArcOutcome`: only the exact newly inserted requested root arc earns applied; other effects are unknown. Plugin test changes the observed weight, recomputes its hash/effects, and still sees rejection. |
| External outcomes could introduce an unissued call ID | Corrected: external delivery must match `requestFor(toolCallId)` and the recorder's captured binding. The unissued-call test rejects it. Canonical input and file-format validation are imported from Petrinaut; no entity schema was copied. |
| Caller mutation during async hash verification could change the checked content | Corrected: verifier clones synchronously and returns the verified clone; the receiver retains that returned value. Test mutates the submitted definition immediately after admission starts and asserts the detached original is retained. |
| Caller mutation could change the supposedly fixed binding | Corrected: clone the binding at construction. Test mutates the supplied incarnation and sees refusal without execution. |

The review found no additional concrete synchronous-hook lifetime defect. The guard closes in `finally`, limits execution to once, and preserves the panel's existing output/continuation lifecycle.

Additional local checks retain a missing post observation as `unknown` without a post hash; preserve the first actual post snapshot even if later derivation fails; and reject a stale base caused by a real hand edit between request preparation and execution. Unmapped residual effects retain full diff content but are not declared causal or given request basis.

The refusal record intentionally distinguishes requested binding from observed bound identity. A failed mismatched-binding attempt may record both identities without granting causal attribution; an applied record cannot. Hash/diff verification is integrity checking, not authentication or proof that an untrusted caller actually controls the claimed browser. The integration owner must enforce request/principal/conversation authorization at ingress.

No broader conclusion follows: the browser registration, canonical record carriage, joined Voice payload checks and real browser witness are still blocked. The candidate has no production headless parity or general operation/effect engine.
