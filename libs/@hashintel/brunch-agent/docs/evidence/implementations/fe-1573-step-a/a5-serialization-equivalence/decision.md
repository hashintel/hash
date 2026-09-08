# A5 reopened serialization-equivalence decision

The in-flight A5 browser tracer reached a refused reopened explanation after a real local-storage reload. The worker retained the original transition result, reopened observation and failure under `/tmp/m7-a5-explanation.ih0VgfEQ/browser-second/`; lossless copies are beside this record. They are synthetic prepared-tracer evidence, not real expert testimony or utility acceptance.

The integration owner independently parsed both files, ran `verifyArcTransitionAttempt` on the recorded applied attempt, recomputed SHA-256 over `JSON.stringify` for both complete definitions, compared them with the existing `canonicalContent`, and separately recursively checked every field, value, type and array position. Both raw hashes verified; complete content matched. The sole object-key-order difference was `/transitions/0/inputArcs/1`: recorded keys `[type, placeId, weight]`, reopened keys `[placeId, weight, type]`.

- Recorded post hash: `3c47961d02296c00131644d1aea0dac16a017f470a66aea919fcf324a2bc9e37`.
- Independently observed reopened hash: `2b705b74a18df8e780ec7e28e0b4243fd0d1ff303b03ceaec114d251caec301d`.
- Recorded attempt outcome: `applied`; raw hashes differ; full `canonicalContent` is equal.

Lu explicitly authorized a reconciliation-only exception after this check. Two full, independently hash-verified JSON observations in the same authorized conversation/document/incarnation may be reported as serialization-equivalent when they differ only in object-key order. Both raw hashes and observation/record references remain visible. Exact hash identity is not claimed, and this establishes neither an actor/cause of reserialization nor absence of intervening edits.

The exception does not change workpiece citation identity, issued mutation/base hashes, transition/effect verification, conflicting-result policy or historical records. It does not authorize hash aliases, field/default normalization, array sorting or queried-element-only comparison. Invalid hashes, missing complete observations, actual field/value/type/presence/array-order changes and different bindings must fail the exception. The A5 worker must retain negative controls and a successful reopened witness before claiming the implementation. The separately committed `MISSION.md` amendment is the execution authority; this record is the evidence and rationale, not a product implementation or acceptance.
