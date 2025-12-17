# Meta-Cognitive Prompt Templates

## Purpose

These templates encode rigorous scientific reasoning patterns for LLM instruction. They are captured here for future incorporation into the task decomposition planning framework.

The templates are designed to make the model "police its own reasoning" by explicitly requiring:
- Uncertainty-aware research planning
- Experimental design with controls against bias and nuisance variation
- Clear separation of confirmatory vs exploratory work

---

## Research-Planning Mode Template

Use this template when the goal requires gathering and synthesizing existing knowledge.

```text
RESEARCH-PLANNING MODE (uncertainty-first)

Task: <topic/question>

1) Aim type: {describe|explain|predict|intervene}

2) Definitions: key terms + boundary conditions

3) Current map:
   - Known-knowns (high confidence facts we're building on)
   - Known-unknowns (explicit questions we need to answer)
   - Unknown-unknowns (what would surprise us; detection signals)

4) Hypothesis set:
   - H1...Hn with competing alternatives
   - For each: what evidence would increase/decrease confidence?

5) Plan:
   - Fast reconnaissance (highest signal/lowest cost)
   - Deep dives (primary sources, canonical references)
   - Stopping rule (what "done" means)

6) Output:
   - A short, critique-friendly plan with assumptions + uncertainty notes
```

### Key Principles

- **Aim type classification**: Different aim types require different plan structures
  - `describe`: Focus on completeness and accuracy of characterization
  - `explain`: Identify causal mechanisms, rule out alternatives
  - `predict`: Build and validate predictive models
  - `intervene`: All of above plus implementation for measurable change

- **Unknowns partition**: The three-category partition forces explicit uncertainty handling
  - Known-knowns: Facts we're confident about and building upon
  - Known-unknowns: Questions we know we need to answer
  - Unknown-unknowns: What would surprise us + how we'd notice

- **Stopping rules**: Research without stopping criteria tends to expand indefinitely

---

## Experiment-Design Mode Template

Use this template for confirmatory experiments that test specific hypotheses.

```text
EXPERIMENT-DESIGN MODE (confirmatory)

Goal: estimate/compare <effect> on <outcome>

1) Outcome definition + measurement protocol

2) Factors:
   - Primary factor(s) to vary
   - Nuisance factors (known/likely)

3) Design choices:
   - Blocking plan (if nuisance factors controllable)
   - Randomization plan (what is randomized; when)
   - Replication plan (unit of replication; sample size rationale if possible)

4) Threats:
   - Confounds, leakage, missing data, instrumentation drift

5) Analysis plan:
   - Model/stat test family; exclusion criteria
   - Primary metric + uncertainty reporting

6) Integrity:
   - Confirmatory vs exploratory labeling
   - "Preregistered commitments" list (decisions locked before seeing outcomes)
```

### Key Principles

- **Nuisance factors**: Variables that affect outcomes but aren't the target of interest
  - "Block what you can, randomize what you cannot"
  - Blocking reduces contribution to experimental error
  - Randomization limits bias from uncontrollable factors

- **Replication intent**: Interpreting effects requires separating signal from variability
  - Specify what gets repeated, at what level
  - Provide sample size rationale when possible

- **Confirmatory vs exploratory split**: 
  - Exploratory: hypothesis generation, flexible analysis, pattern discovery
  - Confirmatory: preregistered design, locked analysis plan, testing specific predictions
  - Selective reporting and flexible analysis choices can mislead even when work looks "scientific"

- **Preregistration**: Reduces "researcher degrees of freedom" by locking decisions before outcomes
  - Design decisions
  - Analysis plan
  - Exclusion criteria
  - Primary metrics

- **Uncertainty reporting**: Always report uncertainty alongside claims, not just point estimates

---

## Integration Notes

These templates could be incorporated into the planning framework in several ways:

### Option A: Sub-Modes

The planner agent invokes these as "sub-modes" when generating specific step types:
- Research steps trigger research-planning mode
- Confirmatory experiment steps trigger experiment-design mode

### Option B: Step-Type Prompts

Each step type has a specialized prompt that incorporates relevant principles:
- `zResearchStep` generation uses research-planning principles
- `zExperimentStep` generation uses experiment-design principles

### Option C: Supervisor Review

The supervisor agent uses these templates to evaluate plan quality:
- Does the research plan have stopping rules?
- Do confirmatory experiments have preregistration?
- Is the unknowns map properly partitioned?

### Option D: Enrichment Step

A post-generation enrichment step that prompts for missing rigor:
- "This experiment is marked confirmatory but lacks preregistered commitments. What decisions should be locked?"
- "This research step lacks a stopping rule. What would 'done' mean?"

---

## Underlying Scientific Principles

These templates are grounded in core scientific methodology:

1. **Hypotheses/theory + evidence + reasoning + communication + uncertainty reporting**
   - Science is organized around ideas tested against observations
   - Confidence accrues via communal scrutiny, not private conviction

2. **Uncertainty characterization**
   - Central to interpreting results and replication claims
   - Making uncertainty legible to others enables scrutiny

3. **Experimental controls**
   - Nuisance factors must be identified and handled
   - Blocking and randomization are complementary strategies

4. **Preregistration**
   - Locks decisions before outcomes to reduce bias
   - Distinguishes confirmatory (hypothesis-testing) from exploratory (hypothesis-generating)

5. **Community check**
   - What would others need to see to scrutinize claims?
   - Science depends on communal verification, not individual conviction

---

## References

These templates synthesize principles from:
- Philosophy of science (hypothesis testing, falsifiability)
- Experimental design methodology (blocking, randomization, replication)
- Meta-science and replication crisis literature (preregistration, researcher degrees of freedom)
- Uncertainty quantification and reporting standards

---

## Future Work

- [ ] Create concrete prompt implementations for each integration option
- [ ] Test which integration approach produces highest-quality plans
- [ ] Develop scoring criteria based on these principles
- [ ] Add domain-specific variations (e.g., software engineering experiments vs. scientific experiments)

---

_Document created: 2024-12-17_
