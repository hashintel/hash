# brunch-lite

## Agent skills

### Git workflow

Graphite (`gt`) stacks, one stacked branch per Linear issue tackled. See `docs/agents/git-workflow.md`.

### Issue tracker

Issues live in Linear (team `FE`, project `brunch-agent`), worked via the `linear` CLI. See `docs/agents/issue-tracker.md`.

### Issue writing

Every agent-authored issue, including a sub-issue, carries a human-owned contract (compact task title + plain technical prose) above a collapsed, agent-maintained `🏗️ Agent notes` section; linked PRs use the same split. Agents read and preserve the current contract before writing on its owner's behalf. Comments state one decision or change in a sentence or two, with detail in `🏗️ Agent notes`. See `docs/agents/issue-writing.md`.

### Triage labels

The five canonical triage roles, mapped onto Linear workflow states where a state fits (`needs-triage`, `wontfix`) and labels for the other three. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Operating posture

Prototype posture, high stakes (persisted data and merge gates fail loudly, never silently), current-milestone horizon. See `docs/agents/posture.md`.

### Legibility protocol

Work arcs close by re-rendering their central artifact into another register and reading the strain; capture channels reconcile before landing; work deposits its own description at authoring time. See `docs/agents/legibility.md`.

### Documentation protocol

Documents arrive in `docs/inbox/`, settle to `docs/reference/` or their effort's `docs/planning/<effort>/`; cross-effort living docs in `docs/planning/_shared/`; `docs/INDEX.md` covers everything (gated by `test/docs-index.test.ts`); issue IDs glossed at first mention in living docs. See `docs/agents/documentation.md`.

### Arc close

One triggerable checklist for closing a work arc (also the `/arc-close` skill): inbox sweep, INDEX pass, CONVERGENCE re-evaluation, registry audit, tense repair. See `docs/agents/arc-close.md`.

### Flue routing

At design moments — before adding state, a layer, a loop, a route, or a test harness — route the symptom to the Flue affordance to rely on, the divergence to avoid, and the escalation point. See `docs/agents/flue-routing.md`.
