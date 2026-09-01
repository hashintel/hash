# Stage 1 — Mechanical and Authority Audit

**Status: complete. Candidates A and C remain eligible; Candidate B is eliminated by a preregistered hard gate. No candidate has won.**

- Audit time: `2026-09-01T13:57:10Z`
- Candidate source commit: `bc032a4264a0529fe1a0ddc36348ea5a6bb33715`

This is a structural audit of the authored instruments under [`../EVALUATION.md`](../EVALUATION.md). It does not claim how a model will behave, how well an elicited workpiece will reconstruct a real operation, or whether a constructed net will execute faithfully.

## Candidate assemblies audited

All candidates use the shared core system prompt, plugin append, skill instructions, universal elicitation reference, construction guidance, and checks.

- **A — domain-primary:** shared `profile.md`, shared `workpiece-template.md`, and the shared `skill.ts.example` resource map.
- **B — formalism-primary:** the shared profile with its complete `## Coverage` section replaced by `coverage-alternatives/formalism-primary.md`, paired with `coverage-alternatives/formalism-primary-workpiece-template.md`. The rendered profile preserves the shared Directives, Recognition, Operations, and Verification sections.
- **C — domain-primary with readiness view:** `candidates/domain-primary-with-readiness/profile.md`, the shared domain-primary workpiece, the candidate-specific `sdcpn-readiness.md`, and its candidate-specific `skill.ts.example` resource map.

Candidate B has no committed complete rendered profile or `defineSkill` composition. The audit could deterministically render its five-register profile for structure and word accounting, but B would need a complete hashable instrument before model-facing execution. This packaging incompleteness is not the eliminating finding below; its ordinary-elicitation construction content is.

## Context and resource accounting

Counts use `wc -w` over authored Markdown. “Ordinary activated total” includes skill instructions, both mandatory elicitation references, and the paired workpiece template; it excludes the always-on system fragments. Construction resources are conditional and excluded from ordinary elicitation.

| Material | A | B | C |
| --- | ---: | ---: | ---: |
| Always-on core plus plugin prompts | 468 | 468 | 468 |
| Activated skill instructions | 835 | 835 | 835 |
| Universal elicitation reference | 2,327 | 2,327 | 2,327 |
| Candidate plugin profile | 2,067 | 2,720 rendered | 2,031 |
| Paired workpiece template | 843 | 1,013 | 843 |
| Mandatory elicitation references | 4,394 | 5,047 | 4,358 |
| Ordinary activated total | 6,072 | 6,895 | 6,036 |
| Construction guidance plus checks | 2,741 | 2,741 | 2,741 |
| Candidate-only readiness resource | — | — | 937 |
| All construction-only references | 2,741 | 2,741 | 3,678 |

Candidate C removes 36 words from ordinary activated context relative to A and adds a 937-word resource only on the construction branch. Candidate B adds 823 ordinary activated words relative to A. These counts describe placement and cost; they do not decide fidelity or attention quality.

## Mechanical results

| Check | A | B | C |
| --- | --- | --- | --- |
| Five registers present once and in required order | Pass | Pass in deterministic render | Pass |
| Local imports in a complete `defineSkill` example resolve | Pass | Not yet authored | Pass |
| Instruction pointers match advertised resource names | Pass | Render/package required | Pass |
| Exact duplicate prose sentences between universal and plugin references | 0 | 0 | 0 |
| Construction resources excluded from ordinary elicitation | Pass | **Fail** | Pass |
| Unsupported evidence-level claims | None found | None found | None found |

Candidate A advertises `references/checks.md`, `references/pn-construction.md`, `references/profile.md`, `references/universal-elicitation.md`, and `templates/workpiece.md`. Candidate C advertises the same names plus `references/sdcpn-readiness.md`. The shared instructions point to those exact names and make the readiness read conditional on its being advertised.

## Authority results

### Workpiece claims

The templates contain no scenario claims to duplicate. Structurally, all three state that each operational proposition has one authoritative location, keep evidence and epistemic treatment beside it, make the process spine reference local activity/resource entries, restrict the cross-cutting ledger to references, and make delivery status refer back rather than create another account.

No competing authoritative home or centralized claim restatement is required by the templates. Whether a model follows that contract remains a Stage 2 or Stage 3 observation.

### Construction readiness, mapping, and checking

- **A:** ordinary elicitation sees three concise construction-readiness checks in plugin Verification, but not places, transitions, arcs, guards, or mapping recipes. Mapping remains in `pn-construction.md`, and evidence assessment remains in `checks.md`.
- **B:** mandatory Coverage names concrete SDCPN consequences before the construction branch, including colour sets, typed elements, resource tokens, source transitions, guards, factored transitions, intermediate places, resource arcs, arc types, priorities, state invariants, scalar simulation functions, differential equations, and crossing-triggered transitions.
- **C:** the ordinary profile says SDCPN readiness and mapping are outside it. The conditional readiness resource records only cited construction obligations, blocking gaps, and anticipated losses; it explicitly defers concrete mappings, inferences, approximations, and defaults to `pn-construction.md`, and result inspection to `checks.md`.

### Evidence levels

The shared checks distinguish tool-schema acceptance, agent-reviewed structural correspondence, and behavioral execution or stronger analysis. Static review uses bounded wording such as “candidate structural path,” “intended return structures,” and “apparently exclusive guards,” with explicit statements that these do not establish reachability, conservation, or runtime exclusivity. No candidate-specific material claims a stronger oracle.

## Candidate B hard-gate adjudication

**Claim:** Candidate B places construction mechanics in a resource that the shared instructions require before substantive elicitation.

**Relied on by:** The Stage 1 eligibility decision under the preregistered rule: “A candidate fails this stage if … construction mechanics enter ordinary elicitation.”

**Competing explanation:** The “Possible SDCPN consequences” are descriptive context rather than construction guidance and therefore do not cross the phase boundary.

**Primary evidence:** `instructions.md` requires the plugin profile before substantive elicitation. Candidate B's replacement Coverage repeatedly names concrete target structures and transformations: factored start/progress/finish transitions, intermediate places, resource arcs, source transitions, arcs and arc types, guards, priorities, differential equations, and transitions triggered by threshold crossings.

**Discriminator:** Does a mandatory ordinary-elicitation resource expose concrete target construction structures or only operational concerns and phase-boundary checks?

**Observation:** Candidate B exposes concrete target construction structures in eight “Possible SDCPN consequences” passages. Candidates A and C keep those mappings behind the construction-resource pointer.

**Disposition:** **Hard-gate failure.** Calling the passages “possible consequences” does not remove the target structures from model context or preserve the preregistered phase boundary. This structural result does not prove that B would ask schema-shaped questions; it establishes the narrower failure that construction mechanics are present during ordinary elicitation.

## Stage 1 disposition

- **Candidate A:** eligible for Stage 2.
- **Candidate B:** eliminated; retain its source and this audit as comparison evidence, but do not spend Stage 2 or paid-run effort on it.
- **Candidate C:** eligible for Stage 2.

Stage 1 does not choose between A and C. Stage 2 must compare their owner-led case traces, especially whether A's always-visible readiness checks expose target gaps at useful times or whether C's construction-only reference projection preserves operational questioning while surfacing those gaps no later than needed.

Progressive-disclosure strain was not established by this audit. Word count alone does not earn another resource split.
