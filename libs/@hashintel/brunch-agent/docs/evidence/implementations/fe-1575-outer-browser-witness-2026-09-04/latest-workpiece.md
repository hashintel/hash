# Final inspection and dispatch workpiece — Revised

## Purpose and posture
Model the batch path from final inspection to dispatch readiness with explicit crew resource management. This revision adds the missing crew-consumption arc to enforce the resource constraint.

## Operational account
- A batch that is ready enters final inspection.
- Starting final inspection requires both a ready batch AND the sole available dispatch crew.
- Starting final inspection consumes that crew token.
- Sign-off releases that crew and makes the batch ready for dispatch.

## Quantity and resource policy
Exactly one dispatch crew is available. Starting final inspection consumes that one available crew; sign-off returns it. No transition fires without sufficient tokens in all input places.

## Petrinaut correspondence
The net contains four places:
- `batch-ready`: batches awaiting final inspection
- `under-final-inspection`: batches currently in inspection
- `ready-for-dispatch`: batches cleared for dispatch
- `dispatch-crew-available`: crew availability (1 token when free)

Transitions:
- `start-final-inspection`: requires 1 token from batch-ready AND 1 token from dispatch-crew-available; produces 1 token to under-final-inspection
- `sign-off`: requires 1 token from under-final-inspection; produces 1 token to ready-for-dispatch AND 1 token to dispatch-crew-available

The missing standard weight-1 input arc from `dispatch-crew-available` to `start-final-inspection` has been **added and verified** in the live Petrinaut definition.

## Explicit unknowns
- Inspection timing: duration, stochasticity, or determinism remain unresolved
- Sign-off timing: duration, stochasticity, or determinism remain unresolved
- Failure modes: whether inspection can fail, halt, or reject a batch
- Recovery behavior: how failures or rejections affect batch state or crew availability

## Claim boundary
This workpiece and the corrected net establish only:
- The crew-consumption constraint at start of inspection
- The crew-release at sign-off completion
- Token flow from ready batch through inspection to dispatch readiness

This is test-authored diagnostic material for the narrow final-inspection–to-dispatch path. It does not establish capture provenance, behavioral execution, failure handling, full process projection, or integration with upstream or downstream operations.

