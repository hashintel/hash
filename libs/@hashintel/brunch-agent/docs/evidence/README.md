# Evidence retention

Git stores reusable instruments and durable conclusions. Run output and
implementation archaeology are ephemeral by default.

| Material | Home |
| --- | --- |
| Reusable cases, oracles, supported protocols | [`evaluations/`](../../evaluations/) |
| Supported launchers | `apps/brunch-agent/src/evaluations/` |
| Local run output | `apps/brunch-agent/.data-wipe-me/evaluations/` |
| Inputs a test actually loads | Beside that test under `test/fixtures/` |
| Current authority | [`MISSION.md`](../../MISSION.md) |
| Lasting architectural decisions | An [ADR](../adr/) |
| Evaluation conclusion unavailable from tests or code | One final campaign adjudication here |
| Per-implementation proof | Nowhere: the code, test, commit and PR are the record |

A tracked file under this directory must have a named consumer:

1. A test loads its exact bytes.
2. A supported, repeatable benchmark compares against it.
3. It records a still-binding decision not represented in `MISSION.md`, an ADR, or code.
4. It is a uniquely irreproducible external observation with an identified future use.
5. It is unresolved accounting whose disposition is still open.

These are not sufficient reasons: a run or review passed or failed; a subagent produced it;
it belongs to an `alpha`, `final`, `freeze`, `checkpoint` or `correction`; another historical
document links to it; it might become useful; a manifest or hash already exists.

Promotion is a deliberate review action that selects one fixture or one final adjudication.
There is no promotion framework and no archive generator. Do not add
`docs/evidence/implementations/` packets.

A normal evaluation can run repeatedly without changing `git status`.
