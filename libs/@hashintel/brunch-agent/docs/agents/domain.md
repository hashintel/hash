# Domain Docs

How engineering skills consume Brunch domain documentation inside the HASH monorepo.

## Before exploring, read these

- **`CONTEXT.md`** at the Brunch context root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Brunch is one context inside the multi-context HASH repository:

```
libs/@hashintel/brunch-agent/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-another-decision.md
└── packages/
    ├── core/
    ├── binding-flue/
    ├── transport-aisdk/
    └── plugin-gherkin/

apps/brunch-agent/  # host module governed by this context
```

Package seams do not imply separate domain contexts. Add another Brunch `CONTEXT.md` only if the
domain language itself diverges enough to require an explicit context map; do not create one merely
because another binding, transport, plugin, or host appears.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
