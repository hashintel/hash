# Specs (historical)

These files are prior design hypotheses, not the current harness contract. Live authority is
root [`MISSION.md`](../../MISSION.md) and the future spine [`MISSION.next.md`](../../MISSION.next.md).
Domain language lives in [`CONTEXT.md`](../../CONTEXT.md). Package topology and Flue routing live
under [`docs/reference/architecture/`](../reference/architecture/).

Remaining files:

- [`petrinaut-integration.md`](petrinaut-integration.md) — historical Petrinaut attach hypothesis;
  the live door is the Mission 5 browser Flue `ChatTransport` at `/agents/chat/:instanceId`.
- [`petrinaut-batched-construction-tools.md`](petrinaut-batched-construction-tools.md) — unselected
  `pn_read` / `pn_edit` candidate; Mission 7 owns carrier repair and first nested mutation,
  Mission 9 owns whether a batch tool is later earned.

The YAML/plugin, three-register IR, capture-envelope, and completion-algebra specs were removed
on 2026-09-07. Last living copies and the retirement record are at commit `69c02f69a9` and
[`docs/archive/specs/README.md`](../archive/specs/README.md).
