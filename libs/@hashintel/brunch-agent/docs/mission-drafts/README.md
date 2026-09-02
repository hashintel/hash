# Provisional mission drafts

Files in this directory are detailed context repositories for possible future missions. They are not execution authority, do not create live missions, and must not be implemented. No mission is currently live; [`MISSION.next.md`](../../MISSION.next.md) is the compact future spine. A draft must be re-evaluated and converted into a new root `MISSION.md` on its own issue, branch, and PR before implementation.

Each planning item has one authoritative planning home across `MISSION.next.md` and these linked drafts. A spine summary is only a pointer. Keep accepted decisions, rejected alternatives and reasons, re-entry conditions, scenario classes, evidence, constraints, fog, stop conditions, risks, assumptions, and named mechanisms in one discoverable home at the precision needed by a cold-start builder.

Every draft must begin with the non-authority warning shown in the template. A draft may preserve a visible product hypothesis, contract stratum, provisional throughline, tracer floor, readiness obligations, joins, constraints, fog, stop conditions, evidence, and rejected alternatives. It must not contain `Status`, a final `Imperative`, or a final `Proof`. It may mark an acceptance leaf `ORACLE GAP` only when it also states what must resolve the gap before the cluster can be cut or the leaf claimed.

## Lifecycle

1. Before promotion, re-read the draft's evidence and dependencies, inspect the real deployed boundary, and confirm the accepted scenario portfolio and contract stratum.
2. Convert the selected draft into the six-section live mission contract in `MISSION.md`; do not blindly rename or copy it.
3. Give the live mission final `Status`, `Imperative`, `Throughline`, oracle-bound `Proof`, `Constraints`, `Fog-line`, `Stop or reorient`, and `Deferred` sections.
4. Return every item not admitted to the cut to `MISSION.next.md` or another draft at full fidelity.
5. Remove the consumed draft so no duplicate quasi-authority remains, then compare every affected planning file before and after for one surviving home per item.
6. When the eventual live mission is accepted, archive it under [`docs/mission-archive/`](../mission-archive/) according to the existing [archive rules](../mission-archive/README.md).

## Draft template

Omit a section only when no earned content exists. Do not collapse known precision merely because a heading is optional, and do not add symmetric filler.

````markdown
# Draft Mission N — Name

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

## Cold-start reads

## Visible product advance

## Contract stratum

## Boundary crossings and current throughline hypothesis

## Throughline proof floor

## Readiness ratchet

### Inherited stratum closure

### Readiness gate after the new throughline

## Candidate evidence and oracles

## Verification approach

## Inputs and joins

## Risks and assumptions

## Accepted constraints and guarded invariants

## Cross-cutting obligations

## Expected touched paths

## Fog-line

## Stop or reorient

## Carried evidence and rejected alternatives
````

`Cold-start reads` contains pointers to exact canonical paths or ids, not copied content, and must let a separate builder resolve the cluster without the originating conversation. `Boundary crossings` renders every consequential layer or actor transition from entry to visible exit. `Readiness ratchet` names the prior throughline proof consumed, inherited closure now load-bearing, obligations closed here, and obligations carried to a named next owner with a re-entry gate and oracle.

`Candidate evidence and oracles` binds each currently observable proof leaf to an exact test file and name, command, fixture, artifact inspection, human witness, or adjudication. `Verification approach` distinguishes inner mechanism evidence, middle integration or contract evidence, and outer deployed or user-visible evidence, with explicit ownership for outer verification.

`Risks and assumptions` records each consequential assumption, its impact if false, and the cheapest discriminating validation. `Accepted constraints and guarded invariants` names what must survive and its existing or required guard, with stop-the-line invariants explicit. `Expected touched paths` is a tentative directory/file-level manifest using `+`, `~`, `-`, and `?`; it supports scope and overlap detection but remains revisable when the real path exposes a better boundary.
