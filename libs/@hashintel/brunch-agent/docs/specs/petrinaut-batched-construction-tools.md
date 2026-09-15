# Batched Petrinaut construction tools — unselected candidate

> Not a selected mechanism and not execution authority. Collapsed 2026-09-07 so the 2026-09-02
> survey cannot keep drifting as a second Mission 9 contract. Full observations, schema sketch,
> and probe write-ups are pinned at
> `ed9edfe7f0:libs/@hashintel/brunch-agent/docs/specs/petrinaut-batched-construction-tools.md`.

Live authority is root [`MISSION.md`](../../MISSION.md). Mission 7 owns carrier repair and the
first nested mutation. [Draft Mission 9](../mission-drafts/9-traceable-projection.md) owns
whether a bounded atomic batch is later earned, and now carries the probe list.

## What the survey still contributes

- Mission 3's empty-net failure was a **schema-carrier** failure, not a granularity failure.
  A batch of nested actions inherits that blocker and is strictly harder to carry.
- Petrinaut has no general batch/transaction contract. `handle.change` is not rollback,
  history, or readonly proof. A batch needs a first-class core operation beside `mutations`.
- Feedback precision beats call count. A batch is an improvement only if the provider sees
  the shape and failures return `{ index, action, path, message }` after rollback.
- Reuse `getLatestNetDefinition`; `pn_read` / `pn_edit` are unearned names.
- Keep canonical field shapes in `@hashintel/petrinaut-core`. Do not hand-copy Petrinaut
  fields into Valibot, mount a `best-effort` mode, or put Brunch/Flue types in petrinaut-core.

## Do not implement from this file

Admit a batch only after Mission 7's repaired single-action carrier exists and Draft 9's
probes show rollback, readonly/extension parity, indexed failure, no-op honesty, supported
handle scope, production client routing, and a measured benefit over per-action tools.
