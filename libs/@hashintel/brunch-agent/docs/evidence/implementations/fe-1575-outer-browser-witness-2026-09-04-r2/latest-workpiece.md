# Final inspection and dispatch batch path

## Purpose and posture
Model the narrow batch path from final inspection to dispatch readiness with single-crew resource constraint. This revision incorporates the evidence-backed correction of the missing crew-availability input arc.

## Operational account
- A batch that is ready enters final inspection.
- Final inspection requires and reserves the sole available dispatch crew.
- Sign-off releases that crew and marks the batch ready for dispatch.

## Quantity and resource policy
Exactly one dispatch crew is available in this system. Starting final inspection consumes that one available crew token; sign-off returns it. At most one batch can be under final inspection at a time because the sole crew is needed and cannot be in two places simultaneously.

## Net structure (model-produced)
**Places:**
- `Batch ready`: batches waiting for inspection
- `Under final inspection`: batches currently being inspected
- `Ready for dispatch`: batches completed and awaiting dispatch
- `Dispatch crew available`: availability token for the single crew (capacity 1)

**Transitions:**
- `Start final inspection`: consumes 1 batch token from `Batch ready` AND 1 crew token from `Dispatch crew available`; produces 1 token in `Under final inspection`
- `Sign-off`: consumes 1 token from `Under final inspection`; produces 1 token each in `Ready for dispatch` and `Dispatch crew available` (returns the crew)

**Arcs:**
- `Batch ready` → `Start final inspection` (standard, weight 1) — original
- `Dispatch crew available` → `Start final inspection` (standard, weight 1) — added in revision
- `Start final inspection` → `Under final inspection` (standard, weight 1) — original
- `Under final inspection` → `Sign-off` (standard, weight 1) — original
- `Sign-off` → `Ready for dispatch` (standard, weight 1) — original
- `Sign-off` → `Dispatch crew available` (standard, weight 1) — original

## Explicit unknowns
- Inspection and sign-off timing and duration
- Failure modes, defect outcomes, and recovery behavior
- Initial batch population and crew availability state
- Repeat or recycling scenarios

## Revision record
**Revision 0** (test-authored): Prepared fixture identified missing standard weight-1 input arc from `Dispatch crew available` to `Start final inspection`.

**Revision 1** (model-produced): Arc added via Petrinaut `addArc` tool and verified in net definition. Crew-availability constraint now enforced at net semantics level.

## Claim boundary
This revision is model-produced evidence of arc correction applied to the test-authored source. It does not establish timing behavior, failure recovery, execution performance, or projection beyond this narrow batch-crew-inspection path.
