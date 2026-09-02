# Mission 4 prompt/skill/tool architecture (Ampcode prototype README)

> Design evidence, not execution authority. This is the conceptual specification the owner selected as the basis of Brunch's prompt/skill/tool architecture during the 2026-09-01/02 Mission 4 design conversation. It was authored as a paper prototype under `packages/core/_drafts/ampcode/`, deleted without relocation in `acc4d935c7`, and recovered from commit `e087f570d7` on 2026-09-02. The body is verbatim except that its six now-deleted local primary-source links are rendered as commit-pinned code paths rather than broken links. Relative paths and the "no production files changed" framing below describe the workbench as it stood then; the production homes are now `packages/core/src/{prompts,skills}` and `packages/plugin-*/src/{prompts,skills,tools}`. The Gherkin instrument it references survives at `evaluations/protocols/gherkin-shape-c-paper-v1/instrument/` and, adapted, in `packages/plugin-gherkin/src/`.
>
> **Adopted:** the design claim (disclosure layers versus semantic roles), the channel-boundary table, the responsibility maps, the cross-plugin transformation invariant, the five registers as additive addresses, the Gherkin and Dafny pressure-test verdicts, and the non-goals. **Superseded on 2026-09-02:** the runtime-disclosure trees and the `defineSkill` packaging note below place `universal-elicitation.md` inside each plugin's job skill. The owner's accepted topology instead mounts it as core's independent `elicitation` capability skill, which job skills activate; see [`MISSION.md`](../../../MISSION.md) architecture kernel items 1 and 3.

---

# Ampcode prompt-architecture prototype

This directory is a non-authoritative paper prototype. It proposes a content and disclosure architecture for Brunch without changing production files.

## Design claim

Two independent structures are needed:

1. **Disclosure layers** determine when guidance becomes available: always-on prompt, activated skill instructions, then phase-scoped resources.
2. **Semantic roles** determine what guidance does: procedure, model content, recognition, interviewing operations, workpiece recording, diagnostics, target authoring or construction, and completion checks. A plugin may combine adjacent roles when separating them would add no useful disclosure boundary.

The five shared registers—**Directives**, **Recognition**, **Operations**, **Coverage**, and **Verification**—organize universal and plugin elicitation guidance. They are an additive authoring contract, not a lifecycle, workpiece schema, or reason to place every kind of guidance in one document.

## Authored topology

```text
ampcode/
├── README.md
├── core/
│   ├── SYSTEM.md
│   └── universal-elicitation.md
├── plugin-gherkin/
│   ├── APPEND_SYSTEM.md
│   └── gherkin-specification/
│       ├── SKILL.md
│       ├── gherkin-elicitation.md
│       ├── workpiece-template.md
│       └── gherkin-authoring-and-checks.md
└── plugin-sdcpn/
    ├── APPEND_SYSTEM.md
    └── sdcpn-modelling/
        ├── SKILL.md
        ├── sdcpn-elicitation.md
        ├── workpiece-template.md
        ├── pn-construction.md
        └── checks.md
```

Core owns universal elicitation. Each plugin owns one domain-typology and target-formalism specialization. The recording contract and target-authoring responsibilities remain distinct from elicitation content even when a thin plugin combines their resources or phases.

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

For the software-behavior/Gherkin pairing, the same disclosure architecture produces a thinner runtime shape:

```text
Always present
├── core/SYSTEM.md
└── plugin-gherkin/APPEND_SYSTEM.md

On `gherkin-specification` activation
└── SKILL.md
    ├── elicitation and workpiece maintenance
    │   ├── universal-elicitation.md
    │   ├── gherkin-elicitation.md
    │   └── workpiece-template.md       when recording or revising
    └── authoring, review, and delivery
        └── gherkin-authoring-and-checks.md
```

The resource names in `SKILL.md` are logical addresses in one assembled Flue skill. In production, the plugin would use Flue's native `defineSkill()` to package the core-authored universal reference and plugin-authored resources under those safe skill-local names. They are not repository-relative Markdown links, and no resource relies on another resource being traversed automatically.

## Channel boundary

| Channel | Content test |
| --- | --- |
| Core `SYSTEM.md` | A universal invariant whose absence could already cause a wrong first turn or dishonest result |
| Plugin `APPEND_SYSTEM.md` | A specialization, activation rule, or plugin-specific guard needed before skill activation |
| `SKILL.md` | Mandatory procedure, branch selection, phase transition, or resource-reading decision |
| Elicitation references | Detailed teaching used while interviewing or revising the domain account |
| Workpiece template | How supported, inferred, unsettled, corrected, and omitted material is recorded |
| Target authoring or construction reference | How recorded domain meaning may be represented in the selected formalism |
| Checks | Whether the workpiece-to-target boundary, resulting artifact, and delivery are honest |

If a rule must bind before a lazy resource might be read, it does not belong only in that resource. If material merely teaches how to carry out one phase, it does not earn always-on prompt space.

Resources read together must be additive: when the universal and plugin elicitation references state the same rule, core owns it and the plugin retains only the domain-typology or target-formalism consequence. Resources read at different moments may project a universal invariant into a local recording or checking obligation.

These channels are responsibility tests, not a required file count. SDCPN earns separate construction and checking resources because transformation is distant, lossy, tool-mediated, and sometimes construct-only. Gherkin combines authoring and checks because its projection is textual and near the elicited behavior, while retaining a separate workpiece for authorship, uncertainty, and unresolved material that a `.feature` document cannot honestly carry by itself.

## Cross-plugin transformation invariant

Three references now support one universal boundary:

```text
person's intent and evidence
→ recoverable workpiece account
→ target-formalism transformation
→ evidence from named checks
→ claim about a surrounding system
```

These arrows are transformations and trust boundaries, not implications. Each stage preserves the source, attributes agent-authored choices, and reports strengthening, weakening, normalization, omission, approximation, assumptions, and losses that could change meaning. Evidence at one stage establishes only its named claim over the exact artifact and assumptions examined there.

- An SDCPN parser or simulation does not establish that the net preserves the operational account or covers every relevant execution.
- A Gherkin parser does not establish step binding, execution, or behavioral adequacy.
- A Dafny verifier does not establish that agent-authored predicates capture the person's intent, that translated code is the verified source, or that surrounding integration is correct.

This invariant belongs in `core/SYSTEM.md` because a missing lazy read must not permit an overclaim. Each plugin owns the target-specific claim ladder, checks, and trust boundary that instantiate it.

## Shared elicitation registers

- **Directives** bind conduct within elicitation and revision.
- **Recognition** names signals and situations that may deserve attention; it does not establish facts.
- **Operations** are selectable moves for resolving the active gap; they are not a script.
- **Coverage** names information the resulting account may need for its purpose; it is not question order.
- **Verification** checks the current question, account, or interviewing trajectory and names local repairs.

The core reference defines universal entries. Each plugin reference contributes only domain-typology or target-formalism additions. Plugin silence leaves the universal guidance in force; plugin additions may narrow applicability but may not silently weaken universal directives.

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

The Gherkin sibling instantiates the same responsibilities with lower cardinality:

| Responsibility | Owner |
| --- | --- |
| Universal identity and non-negotiable epistemic conduct | `core/SYSTEM.md` |
| Detailed general elicitation repertoire | `core/universal-elicitation.md` |
| Software-behavior/Gherkin specialization and pre-activation guardrails | `plugin-gherkin/APPEND_SYSTEM.md` |
| Lifecycle, progressive routing, and render-only behavior | `gherkin-specification/SKILL.md` |
| Software-behavior recognition, investigation, coverage, and diagnostics | `gherkin-elicitation.md` |
| Near-target behavior account, authorship, and open matters | `workpiece-template.md` |
| Gherkin authoring, parse semantics, binding honesty, and delivery checks | `gherkin-authoring-and-checks.md` |

## Main relocations from the first Ampcode candidate

- Detailed procedure, movements, probes, licenses, and universal diagnostics leave `SYSTEM.md` for `universal-elicitation.md`.
- Universal cues and interviewing moves leave the plugin reference for core.
- The plugin reference becomes additive rather than a second self-contained elicitation manual.
- The five registers replace overlapping labels such as lenses versus cues and techniques versus probes, while workpiece and construction contracts remain separate.
- Construct-only behavior is treated as a runtime branch, not an unconditional plugin instruction.
- Closed stopping-outcome codes are replaced by a plain account of what was produced, checked, blocked, assumed, or left open.

## Gherkin pressure-test verdict

The generalization holds at the disclosure, ownership, and semantic-role boundaries. It does not hold as an exact SDCPN-shaped directory or phase graph.

- The five registers accept the software-behavior additions without a sixth register: rules and examples are Recognition and Coverage concerns; concretizing, contrasting, and varying one condition are Operations; behavior and target checks are Verification. Lifecycle remains in `SKILL.md`, outside the registers.
- Core owns the generic move; the plugin owns its consequence. For example, core owns concrete-case slicing and observable clarification, while Gherkin adds the context/event/outcome shape and the requirement that an expected result be externally observable.
- The workpiece remains distinct from the target artifact. A `.feature` document cannot by itself preserve proposed-versus-current behavior, agent authorship, unsupported step bindings, conflict, deferral, or consequential open questions without becoming a disguised sidecar in comments.
- Gherkin authoring is not an SDCPN-style construction phase. Drafting a scenario is a low-distance projection and a correction surface. It may happen after a coherent rule/example account rather than only in a terminal phase.
- The elicitation workpiece should not require the person to decompose behavior into `Given`/`When`/`Then` steps. It records one example as context, event or action, and observable outcome in their vocabulary; target authoring factors that account into step lines. Literal Gherkin supplied by a knowledgeable person may be preserved without making target syntax the interview's required vocabulary.
- Parse validity, step-definition binding, and behavioral adequacy are different claims. The plugin may claim only the checks it actually ran; absent a supplied step lexicon or codebase capability, phrases are marked new or unchecked rather than guessed to be bound.

The evidence that would re-open this result is operational: repeated authorship laundering would justify a workpiece less shaped like Gherkin; repeated no-delta transcription would justify collapsing more of the workpiece into the target plus a minimal open-matters companion; a real step-definition corpus and machine binding check could earn a separately disclosed checking phase.

## Prospective Dafny third reference

No Dafny plugin files are authored in this prototype. The third reference currently establishes a pairing and prospective responsibility shape for Oracle review rather than an implementation specification:

- **Domain typology:** software correctness obligations.
- **Target formalism:** Dafny specification modules and program contracts.

“Formal-verification use cases” remains the umbrella program concern and possible plugin-selection activity, not a target-neutral plugin. “Verified state evolution” remains one recurring correctness shape, not the typology boundary. Actual kernel interfaces are supplied project context: even the examined `dafny-replay` repository varies between `Apply` plus `Normalize`, partial `TryStep`, and collaboration obligations such as `Rebase`, `Candidates`, `Explains`, and `CandidatesComplete`.

A prospective disclosure shape is:

```text
Always present
├── core/SYSTEM.md
└── plugin-dafny/APPEND_SYSTEM.md

On `dafny-verification` activation
└── SKILL.md
    ├── elicitation and workpiece maintenance
    │   ├── universal-elicitation.md
    │   ├── software-correctness-elicitation.md
    │   └── workpiece-template.md       when recording or revising
    └── formalization and evidence
        ├── dafny-specification.md
        └── proof-checks.md
```

The separate Dafny formalization and evidence roles are provisional but earned enough to review: formalization can materially change quantification, domains, preconditions, abstraction functions, and trusted assumptions, while verifier success can create false confidence about those choices. Unlike Gherkin's low-distance textual projection, this boundary needs an explicit semantic diff and an exact account of what was stated, assumed or axiomatized, discharged, skipped, or trusted.

The software-correctness profile would treat initialization and representation invariants; operation preconditions, postconditions, and frame conditions; transition and rejection guarantees; history and round-trip laws; refinement, simulation, normalization, and intent-preservation relations; termination and progress; and trusted boundaries as a **recognition repertoire, not a closed property-kind schema or interview order**. The person supplies the consequential failure and intended guarantee; the plugin proposes a formal property family only for correction.

The minimum prospective target is a Dafny specification module plus an obligation manifest, not a full implementation or completed proof. The workpiece preserves the person-recognizable claim, examples and counterexamples, formalization choices and authorship, assumptions and exclusions, semantic deltas, proof status, and unverified perimeter. The manifest maps that account to exact Dafny declarations and distinguishes stated, assumed, discharged, skipped, and trusted obligations. Abstract or bodyless declarations may make contracts available to verification without proving their implementations and must never be reported as discharged merely because dependent code verifies.

This design would reverse toward a narrower state-evolution plugin only after multiple independent Dafny projects expose one stable cross-project contract. Repeated real conversations in which Dafny-shaped recognition anchors people away from a clearly better target would instead earn a target-selection stage above plugin activation. Until a tracer observes either strain, no target-neutral plugin, fixed kernel ontology, or full Dafny prompt package is warranted.

## Material retained from Ciaran's outline

The SDCPN plugin Coverage register retains goals and avoidance conditions; triggers and prerequisites; participants, locations, and resources; activities and input-use semantics; process flow, failures, retries, and recovery; and quantities and validation. It also makes retry scope, data bindings, spatial transfer, goal trade-offs, tolerated probabilities, and one-logical-step-to-several-net-elements explicit.

## Non-goals

This prototype does not define a machine-readable register schema, typed capture store, completion algebra, renderer, document loader, second agent, or automatic link traversal. It does not author the prospective Dafny plugin, select a verifier integration, prove that the wording outperforms the frozen baseline, or change the current Flue composition.

## Primary sources

- `e087f570d7:libs/@hashintel/brunch-agent/packages/core/src/SYSTEM.md`
- `e087f570d7:libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/APPEND_SYSTEM.md`
- `e087f570d7:libs/@hashintel/brunch-agent/packages/core/_drafts/system-prompts/ciaran-eliciting-and-constructing.md`
- `e087f570d7:libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/`
- `e087f570d7:libs/@hashintel/brunch-agent/packages/plugin-gherkin/plugin.yaml`
- [Cucumber Gherkin reference](https://cucumber.io/docs/gherkin/reference)
- [From Intent to Proof: Dafny Verification for Web Apps](http://midspiral.com/blog/from-intent-to-proof-dafny-verification-for-web-apps/)
- [`dafny-replay` Replay kernel](https://github.com/metareflection/dafny-replay/blob/main/kernels/Replay.dfy)
- [`dafny-replay` MultiCollaboration kernel](https://github.com/metareflection/dafny-replay/blob/main/kernels/MultiCollaboration.dfy)
- [`dafny-replay` guarantee boundary](https://github.com/metareflection/dafny-replay/blob/main/GUARANTEES.md)
- [Dafny reference manual](https://dafny.org/latest/DafnyRef/DafnyRef)
- `e087f570d7:libs/@hashintel/brunch-agent/packages/core/_drafts/five-register-synthesis/`
