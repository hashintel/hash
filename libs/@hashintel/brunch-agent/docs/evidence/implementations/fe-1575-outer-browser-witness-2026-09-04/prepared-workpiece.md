# Final inspection and dispatch workpiece

## Purpose and posture
Maintain the narrow batch path from final inspection to dispatch readiness and test one evidence-backed correction against the live Petrinaut document.

## Operational account
- A batch that is ready enters final inspection.
- Final inspection reserves the sole available dispatch crew.
- Sign-off releases that crew and makes the batch ready for dispatch.

## Quantity and resource policy
Exactly one dispatch crew is available in this fixture. Starting final inspection consumes that one available crew; sign-off returns it.

## Current Petrinaut correspondence
The prepared non-empty net contains the batch path and the crew return from sign-off. It deliberately lacks the standard weight-1 input arc from `Dispatch crew available` to `Start final inspection`.

## Explicit unknowns
Inspection and sign-off timing, failure modes, and recovery behavior remain unresolved.

## Claim boundary
This prepared revision is test-authored diagnostic material. It is not model-produced evidence and does not establish capture provenance, behavioral execution, or broad projection quality.

