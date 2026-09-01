# Ampcode prompt-architecture prototype

This directory is a non-authoritative paper prototype. It proposes a content and disclosure architecture for Brunch without changing production files.

## Design claim

Two independent structures are needed:

1. **Disclosure layers** determine when guidance becomes available: always-on prompt, activated skill instructions, then phase-scoped resources.
2. **Semantic roles** determine what guidance does: procedure, model content, recognition, interviewing operations, workpiece recording, diagnostics, construction, and completion checks.

The five shared registers—**Directives**, **Recognition**, **Operations**, **Coverage**, and **Verification**—organize universal and plugin elicitation guidance. They are an additive authoring contract, not a lifecycle, workpiece schema, or reason to place every kind of guidance in one document.

## Authored topology

```text
ampcode/
├── README.md
├── core/
│   ├── SYSTEM.md
│   └── universal-elicitation.md
└── plugin-sdcpn/
    ├── APPEND_SYSTEM.md
    └── sdcpn-modelling/
        ├── SKILL.md
        ├── sdcpn-elicitation.md
        ├── workpiece-template.md
        ├── pn-construction.md
        └── checks.md
```

Core owns universal elicitation. The plugin owns the operational-process and SDCPN specialization. The workpiece and target construction remain distinct from the model-content contract.

## Runtime disclosure

```text
Always present
├── core/SYSTEM.md
└── plugin-sdcpn/APPEND_SYSTEM.md

On `sdcpn-modelling` activation
└── SKILL.md
    ├── interactive branch
    │   ├── universal-elicitation.md
    │   ├── sdcpn-elicitation.md
    │   └── workpiece-template.md       when recording or revising
    └── construction branch
        ├── pn-construction.md
        └── checks.md
```

The resource names in `SKILL.md` are logical addresses in one assembled Flue skill. In production, the plugin would use Flue's native `defineSkill()` to package the core-authored universal reference and plugin-authored resources under those safe skill-local names. They are not repository-relative Markdown links, and no resource relies on another resource being traversed automatically.

## Channel boundary

| Channel | Content test |
| --- | --- |
| Core `SYSTEM.md` | A universal invariant whose absence could already cause a wrong first turn or dishonest result |
| Plugin `APPEND_SYSTEM.md` | A specialization, activation rule, or plugin-specific guard needed before skill activation |
| `SKILL.md` | Mandatory procedure, branch selection, phase transition, or resource-reading decision |
| Elicitation references | Detailed teaching used while interviewing or revising the process account |
| Workpiece template | How supported, inferred, unsettled, corrected, and omitted material is recorded |
| Construction reference | How recorded operational meaning may be represented in an SDCPN |
| Checks | Whether the workpiece-to-construction boundary, resulting net, and delivery are honest |

If a rule must bind before a lazy resource might be read, it does not belong only in that resource. If material merely teaches how to carry out one phase, it does not earn always-on prompt space.

Resources read together must be additive: when the universal and plugin elicitation references state the same rule, core owns it and the plugin retains only the operational-process or target-formalism consequence. Resources read at different moments may project a universal invariant into a local recording or checking obligation.

## Shared elicitation registers

- **Directives** bind conduct within elicitation and revision.
- **Recognition** names signals and situations that may deserve attention; it does not establish facts.
- **Operations** are selectable moves for resolving the active gap; they are not a script.
- **Coverage** names information the resulting account may need for its purpose; it is not question order.
- **Verification** checks the current question, account, or interviewing trajectory and names local repairs.

The core reference defines universal entries. The SDCPN reference contributes only operational-process or target-specific additions. Plugin silence leaves the universal guidance in force; plugin additions may narrow applicability but may not silently weaken universal directives.

## Responsibility map

| Responsibility | Owner |
| --- | --- |
| Universal identity and non-negotiable epistemic conduct | `core/SYSTEM.md` |
| Detailed general elicitation repertoire | `core/universal-elicitation.md` |
| SDCPN specialization and pre-activation guardrails | `plugin-sdcpn/APPEND_SYSTEM.md` |
| Capability-aware lifecycle and progressive routing | `sdcpn-modelling/SKILL.md` |
| Operational-process recognition, content, moves, and diagnostics | `sdcpn-elicitation.md` |
| Recoverable process-model artifact | `workpiece-template.md` |
| Petri-net mappings and construction patterns | `pn-construction.md` |
| Construction readiness, net fidelity, and delivery | `checks.md` |

## Main relocations from the first Ampcode candidate

- Detailed procedure, movements, probes, licenses, and universal diagnostics leave `SYSTEM.md` for `universal-elicitation.md`.
- Universal cues and interviewing moves leave the plugin reference for core.
- The plugin reference becomes additive rather than a second self-contained elicitation manual.
- The five registers replace overlapping labels such as lenses versus cues and techniques versus probes, while workpiece and construction contracts remain separate.
- Construct-only behavior is treated as a runtime branch, not an unconditional plugin instruction.
- Closed stopping-outcome codes are replaced by a plain account of what was produced, checked, blocked, assumed, or left open.

## Material retained from Ciaran's outline

The plugin Coverage register retains goals and avoidance conditions; triggers and prerequisites; participants, locations, and resources; activities and input-use semantics; process flow, failures, retries, and recovery; and quantities and validation. It also makes retry scope, data bindings, spatial transfer, goal trade-offs, tolerated probabilities, and one-logical-step-to-several-net-elements explicit.

## Non-goals

This prototype does not define a machine-readable register schema, typed capture store, completion algebra, renderer, document loader, second agent, or automatic link traversal. It does not prove that the wording outperforms the frozen baseline or change the current Flue composition.

## Primary sources

- [`../../src/SYSTEM.md`](../../src/SYSTEM.md)
- [`../../../plugin-sdcpn/src/APPEND_SYSTEM.md`](../../../plugin-sdcpn/src/APPEND_SYSTEM.md)
- [`../system-prompts/ciaran-eliciting-and-constructing.md`](../system-prompts/ciaran-eliciting-and-constructing.md)
- [`../../../plugin-sdcpn/src/skills/sdcpn-modelling/`](../../../plugin-sdcpn/src/skills/sdcpn-modelling/)
- [`../five-register-synthesis/`](../five-register-synthesis/)
