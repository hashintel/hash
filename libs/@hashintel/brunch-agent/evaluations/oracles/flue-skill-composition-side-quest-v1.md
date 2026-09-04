# Flue skill-composition side-quest oracle

This oracle is evaluator-only. Do not include it in the `ChatAgent` prompt, candidate skills,
scenario inputs, or faux-provider context.

## Per-run rubric

Record each dimension separately as pass, fail, or indeterminate, with direct trace or output
evidence:

1. **Job routing** — `sdcpn-modelling` was recognized and activated.
2. **Capability routing** — universal elicitation entered context exactly when human knowledge was
   required.
3. **Universal judgment** — the first action selected a consequential absence and protected
   interaction bandwidth rather than asking generically.
4. **Plugin judgment** — the action stayed grounded in operational-process and SDCPN
   responsibilities.
5. **Composition** — where elicitation was required, one action integrated both universal and
   plugin judgment.
6. **Restraint** — construct-only and resolvable-review work proceeded without an avoidable
   question or universal elicitation disclosure.
7. **Disclosure** — the score names every activated skill and read resource observed in the trace.
8. **Evidence honesty** — the output invents no process fact and claims no unperformed
   construction, validation, or simulation.
9. **Failure clarity** — S5 records whether the missing skill was explicit, silent, improvised
   around, or fatal.
10. **Cost** — record provider calls, input/output/cache tokens, latency, and provider cost.

Successful tool calls establish routing mechanics only. S1 and S4 pass composition only when the
first question is both adaptively elicitative and directed at a consequential operational
distinction needed for SDCPN modelling.

## Scenario anchors

- **S1:** one opening question should establish a concrete approval case, purpose, or another
  equally load-bearing operational distinction. A questionnaire, Petri-net vocabulary, or invented
  approval facts fails.
- **S2:** the account is sufficient for the first decision. A supported decision is to represent
  review as start/in-progress/outcome so the reviewer is unavailable during the timed check and
  returned on both outcomes. Asking for more facts or loading universal elicitation fails.
- **S3:** the rejection path fails to return the reusable reviewer token even though the account
  requires release on either outcome. Loading universal elicitation or asking the person fails.
- **S4:** the target chooses immediate release although the account leaves immediate release
  versus retention through appeal unresolved. The model should ask one focused operational
  question about that distinction after loading universal elicitation.
- **S5:** score the native Flue result and subsequent turn behavior; do not prescribe a dependency
  mechanism.

## Allowed comparative outcomes

- Candidate A remains viable and preferred.
- Candidate A is falsified and Candidate B remains the fallback.
- Both are behaviorally viable, with bounded uncertainty stated.
- The probe is invalid or inconclusive.

Do not infer general routing reliability or overall elicitation superiority from this sample.
