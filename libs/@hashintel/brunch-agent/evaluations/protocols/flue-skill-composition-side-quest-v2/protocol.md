# Flue skill-composition side-quest v2

## Reason for a new instrument

V1 proved both topologies mechanically, then stopped after both real-model S1 runs activated
`sdcpn-modelling` but ignored its required next disclosure. Repetition could not distinguish
topology. V2 is the user-authorized discrimination instrument: it strengthens only the shared
routing gate, freezes that change before use, and preserves v1 evidence unchanged.

## Frozen inheritance

V2 inherits without modification:

- scenarios from
  `evaluations/cases/flue-skill-composition-side-quest-v1/scenarios.json`;
- the evaluator-only rubric from
  `evaluations/oracles/flue-skill-composition-side-quest-v1.md`;
- universal instructions and every plugin resource from the v1 source paths;
- production core and plugin always-on instructions;
- `anthropic/claude-haiku-4-5`;
- the production `ChatAgent` seam, tool availability, and stopping points; and
- the candidate topology difference: independent `activate_skill` versus packaged
  `read_skill_resource`.

## Shared routing-gate intervention

In both candidates, replace the v1 interactive routing sentence with this block:

> #### Required disclosure gate
>
> Before any consequential question, finding, revision, or construction decision, decide whether
> progress requires human knowledge that the available evidence does not contain.
>
> REQUIRED_ACTION
>
> If human knowledge is required, complete the required universal-disclosure action and read
> `sdcpn-elicitation.md` before asking one focused question. Do not ask first and load guidance
> later.
>
> If the supplied evidence already supports the requested operation, do not perform the
> universal-disclosure action. Continue with the relevant plugin construction or checking
> resources without asking an avoidable question.

`REQUIRED_ACTION` is the only candidate-specific text:

- A: `Required universal-disclosure action for this candidate: activate the mounted
  \`elicitation\` skill.`
- B: `Required universal-disclosure action for this candidate: read
  \`universal-elicitation.md\` from this skill.`

Normalizing that line must make the plugin instructions byte-identical. The universal body must
remain byte-identical between A's skill instructions and B's resource.

## Hermetic gate

Exercise A and B on S1, S2, S3, and S4 through the built app with the faux provider. Require the
same mounting/access/absence proofs as v1 and additionally prove the rendered v2 plugin texts
differ only at `REQUIRED_ACTION`.

## Paid design and budget

V1 consumed 4 model invocations and USD 0.0241825. The user-authorized cumulative ceilings are 48
model invocations and USD 1.00, leaving at most 44 calls and USD 0.9758175.

Run in paired order:

1. A/S1 and B/S1 once. Stop if both again fail before candidate-specific disclosure.
2. A/S4 and B/S4 once.
3. A/S2 and B/S2 once.
4. Repeat A/S1, B/S1, A/S4, and B/S4 once each if the first pair discriminates.

Each Flue provider call counts as one invocation. Before dispatching another scenario, reserve
four calls for its expected activation/resource loop. Stop at the first consequential action and
stop immediately on a mechanical failure, path asymmetry, missing raw trace, shared-content
failure, 48th cumulative call, or USD 1.00 total cost.

## Decision rule

- A is viable and preferred if it passes both required-disclosure scenarios twice, passes S2
  restraint, and B does not materially outperform it.
- A is falsified with B as fallback if B passes those gates while A exhibits repeated
  independent-activation or composition strain attributable to topology.
- Both are behaviorally viable with bounded uncertainty if both pass the paired gates.
- The probe remains invalid/inconclusive if both fail the shared gate or evidence cannot isolate
  topology.

No general reliability claim, paid S3/S5, model judge, post-run wording revision, or tie-breaking
campaign is authorized.
