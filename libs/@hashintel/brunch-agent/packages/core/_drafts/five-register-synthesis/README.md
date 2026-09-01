# Five-Register Brunch Synthesis

**Status: temporary, non-authoritative evaluation workbench.** Nothing in this directory is imported, built, or part of the active Brunch agent. The active production files remain under `packages/core/src/` and `packages/plugin-sdcpn/src/`.

This candidate remaps the current core prompt, SDCPN prompt material, runbook skill resources, Ciaran's process-modelling outline, the core prompt workbench, and selected predecessor design material into the architecture agreed during the owner-led Mission 4 design conversation.

## Decisions embodied

1. The core system prompt is a compact invariant set, not a general elicitation manual.
2. The SDCPN system-prompt append is a concise target contract and router.
3. The two always-on prompt fragments stand independently; core does not define headings that the plugin append must fill.
4. The agent maintains a recoverable workpiece first and constructs a checked SDCPN only when the required guidance, evidence, and capabilities are available.
5. The universal identity includes initial elicitation and analysis or revision of existing models.
6. Detailed universal elicitation teaching and plugin guidance are separately authored progressive layers.
7. Both progressive layers use the same additive registers: **Directives**, **Recognition**, **Operations**, **Coverage**, and **Verification**.
8. A plugin profile couples its reusable domain typology and target formalism; the registers classify what guidance does, not where its knowledge originated.
9. The SDCPN plugin profile is one resource containing all five registers.
10. Register headings are fixed, but contents remain freeform Markdown. No repeated card schema, machine-readable entry type, renderer, or completion algebra is proposed.
11. Plugin guidance may add context or narrow applicability; it does not silently weaken universal directives.
12. The separately authored progressive layers are composed into one packaged skill with Flue's native `defineSkill({ instructions, files })`. Markdown links guide the model but do not package, transclude, or automatically load resources.
13. The plugin profile is strictly additive and register-pure: it states only operational-process or SDCPN consequences absent from universal teaching; Recognition names signals and hypotheses, Operations names moves, Coverage names what to preserve, and Verification names failures and repairs. Lifecycle and construction routing remain in instructions and checks.
14. A workpiece claim, its evidence, and its epistemic treatment share one authoritative location under the relevant concern. Only unresolved matters spanning concerns or requiring later re-entry enter a compact cross-cutting issue ledger, which references rather than restates claims.
15. Construction evidence is reported at one of three non-collapsible levels: tool-schema acceptance, agent-reviewed structural correspondence, and behavior observed through an actual execution or stronger analysis. Every claim stays within the scope of the method that produced it.
16. [`EVALUATION.md`](EVALUATION.md) owns the repeatable candidate comparison: frozen instruments, authority checks, owner-led walkthroughs, model-facing observables, campaign boundary, and disposition rules.
17. Candidate C keeps ordinary elicitation and its workpiece domain-primary, then applies a construction-only SDCPN readiness view whose entries cite authoritative workpiece claims rather than reproducing them.

## Candidate topology

```text
five-register-synthesis/
├── README.md
├── SOURCE-MAP.md
├── EVALUATION.md
├── core/
│   ├── SYSTEM.md
│   ├── flue.ts.example
│   └── universal-elicitation.md
└── plugin-sdcpn/
    ├── APPEND_SYSTEM.md
    └── sdcpn-modelling/
        ├── skill.ts.example
        ├── instructions.md
        ├── profile.md
        ├── workpiece-template.md
        ├── pn-construction.md
        ├── checks.md
        ├── coverage-alternatives/
        │   ├── domain-primary.md
        │   ├── formalism-primary.md
        │   └── formalism-primary-workpiece-template.md
        └── candidates/
            └── domain-primary-with-readiness/
                ├── README.md
                ├── profile.md
                ├── sdcpn-readiness.md
                └── skill.ts.example
```

### Responsibilities

- [`core/SYSTEM.md`](core/SYSTEM.md) contains the context- and target-independent role and invariants needed from the first turn.
- [`core/universal-elicitation.md`](core/universal-elicitation.md) contains progressive universal strategies and methods under the five registers; [`core/flue.ts.example`](core/flue.ts.example) shows how its raw text would be exported through the existing core Flue subpath for explicit composition.
- [`plugin-sdcpn/APPEND_SYSTEM.md`](plugin-sdcpn/APPEND_SYSTEM.md) selects operational-process/SDCPN modelling, requires skill activation, states workpiece-first construction, and protects the elicitation/construction boundary.
- [`plugin-sdcpn/sdcpn-modelling/instructions.md`](plugin-sdcpn/sdcpn-modelling/instructions.md) describes the conceptual lifecycle, distinguishes the currently available interactive and construct-only runtime branches, and routes to packaged resource names.
- [`plugin-sdcpn/sdcpn-modelling/skill.ts.example`](plugin-sdcpn/sdcpn-modelling/skill.ts.example) shows Flue's native `defineSkill` composing the instructions, core-owned universal reference, and plugin-owned resources into one skill. Flue synthesizes the packaged `SKILL.md`.
- [`plugin-sdcpn/sdcpn-modelling/profile.md`](plugin-sdcpn/sdcpn-modelling/profile.md) is the register-pure additive plugin profile coupling operational-process domain typology and SDCPN consequences without repeating universal or lifecycle guidance.
- [`plugin-sdcpn/sdcpn-modelling/workpiece-template.md`](plugin-sdcpn/sdcpn-modelling/workpiece-template.md) is the recoverable process-model artifact, with operational claims, evidence, and epistemic treatment co-located and a reference-only cross-cutting issue ledger.
- [`plugin-sdcpn/sdcpn-modelling/pn-construction.md`](plugin-sdcpn/sdcpn-modelling/pn-construction.md) contains construction mappings and patterns disclosed only during construction.
- [`plugin-sdcpn/sdcpn-modelling/checks.md`](plugin-sdcpn/sdcpn-modelling/checks.md) separates tool-schema acceptance, agent-reviewed structural correspondence, and behavioral execution or stronger analysis before checking fidelity, revision, and delivery.
- [`plugin-sdcpn/sdcpn-modelling/candidates/domain-primary-with-readiness/`](plugin-sdcpn/sdcpn-modelling/candidates/domain-primary-with-readiness/) contains Candidate C's complete profile, construction-only readiness resource, and hashable Flue composition while reusing the domain-primary workpiece.
- [`EVALUATION.md`](EVALUATION.md) is the sole authority for comparing Coverage/workpiece/readiness candidates and deciding whether finer progressive disclosure is earned.

## How to read the synthesized set

### Always-on context

Read these in concatenation order:

1. [`core/SYSTEM.md`](core/SYSTEM.md)
2. [`plugin-sdcpn/APPEND_SYSTEM.md`](plugin-sdcpn/APPEND_SYSTEM.md)

They deliberately do not mirror headings. Evaluate whether the append adds a specialization without restating or weakening the core contract.

### Activated modelling lifecycle

Read [`plugin-sdcpn/sdcpn-modelling/instructions.md`](plugin-sdcpn/sdcpn-modelling/instructions.md), then inspect [`plugin-sdcpn/sdcpn-modelling/skill.ts.example`](plugin-sdcpn/sdcpn-modelling/skill.ts.example). The instructions should make the lifecycle and packaged-resource pointers legible without embedding the reference content itself; the definition should contain composition only, not duplicate their prose.

For elicitation or revision, follow its pointers to:

1. [`core/universal-elicitation.md`](core/universal-elicitation.md)
2. The profile selected by [`EVALUATION.md`](EVALUATION.md): the shared [`profile.md`](plugin-sdcpn/sdcpn-modelling/profile.md) for Candidates A and B, or Candidate C's [`profile.md`](plugin-sdcpn/sdcpn-modelling/candidates/domain-primary-with-readiness/profile.md)
3. The paired workpiece selected by [`EVALUATION.md`](EVALUATION.md) when it is first created or materially revised: the domain-primary [`workpiece-template.md`](plugin-sdcpn/sdcpn-modelling/workpiece-template.md) for Candidates A and C, or the [`formalism-primary-workpiece-template.md`](plugin-sdcpn/sdcpn-modelling/coverage-alternatives/formalism-primary-workpiece-template.md) alternative for Candidate B

For construction and net delivery, additionally read:

1. Candidate C only: [`plugin-sdcpn/sdcpn-modelling/candidates/domain-primary-with-readiness/sdcpn-readiness.md`](plugin-sdcpn/sdcpn-modelling/candidates/domain-primary-with-readiness/sdcpn-readiness.md)
2. [`plugin-sdcpn/sdcpn-modelling/pn-construction.md`](plugin-sdcpn/sdcpn-modelling/pn-construction.md)
3. [`plugin-sdcpn/sdcpn-modelling/checks.md`](plugin-sdcpn/sdcpn-modelling/checks.md)

Workpiece-only delivery uses the universal and plugin Verification registers without disclosing construction resources.

## Evaluation

The shared profile currently uses a domain-typology-primary Coverage index provisionally. Do not decide between it and the alternatives from this README. Follow [`EVALUATION.md`](EVALUATION.md), which preregisters three candidates: domain-primary, formalism-primary, and [`domain-primary elicitation/workpiece organization plus a separate SDCPN construction-readiness view`](plugin-sdcpn/sdcpn-modelling/candidates/domain-primary-with-readiness/).

The protocol owns the shared invariants, mechanical audit, owner-led cases, model-facing observations, evidence walls, decision rule, and the threshold for splitting progressive resources. After a candidate wins, remove losing alternatives from the live candidate instrument and preserve only the comparison evidence.

## Observed runtime boundaries

The current production composition does not expose the whole conceptual lifecycle in one conversation. Ordinary interactive conversations can elicit and revise the workpiece but do not mount construction tools. The `validated-construction` branch mounts construction tools and explicitly forbids interviewing. The candidate therefore routes a construction-discovered gap differently by branch: ask only when interactive elicitation is actually available; otherwise return a construction-gap report and the smallest question for a later interactive conversation.

The currently mounted construction tools inspect and add types, parameters, places, transitions, and arcs. They do not generally update or remove existing net structure. Existing-model analysis and workpiece revision remain in scope by owner decision, but general existing-net revision is not claimed; the construction resource permits only genuinely supported additive changes and otherwise reports the missing mutation capability.

## Verified skill composition

Flue packages every regular file inside a statically imported `SKILL.md` directory, whether linked or unlinked. It does not parse Markdown links as package edges, include linked files outside that directory, transclude linked content, or automatically load a resource chain. Symlinks inside an imported skill directory are rejected. Activation preserves Markdown links as instruction text and separately advertises each packaged resource with the exact virtual path required by `read_skill_resource`.

The accepted candidate therefore uses native `defineSkill` composition instead of a cross-package Markdown link. The core Flue subpath exports the raw universal reference; the plugin imports it and maps both authored layers to stable packaged resource names. A temporary core-package → plugin-package → production Flue-app build using this synthesis succeeded, registered the agent, carried both exact resources in the bundle, and advertised them under one `sdcpn-modelling` skill.

This closes packaging feasibility without a filesystem loader, Markdown transclusion, copied source, second skill, or second agent. Promotion must still apply the source and package-export changes and exercise the repository's real built-agent tests.

## Non-goals

This candidate does not introduce typed captures, closed claim kinds, demanded slots, a completion algebra, an observer fold, a projection engine, live data bindings, automatic affected-slice computation, or a second agent. It does not modify or represent itself as the frozen Mission 3 instrument.

See [`SOURCE-MAP.md`](SOURCE-MAP.md) for what moved, what was consolidated, and what was deliberately excluded.
