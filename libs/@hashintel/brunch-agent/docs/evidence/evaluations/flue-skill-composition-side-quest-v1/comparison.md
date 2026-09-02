# Flue skill-composition side-quest comparison

## Outcome

**Invalid or inconclusive.** Candidate A remains mechanically viable, but this probe did not
establish behavioral viability or preference for either topology. The current production model
failed the shared plugin instruction before the candidate-specific disclosure paths could be
compared reliably.

No production promotion or Mission 4 reorientation is warranted from this evidence.

## What the hermetic probe established

All nine faux-provider runs crossed the built production `ChatAgent` composition seam.

- Candidate A's initial catalog contained `sdcpn-modelling` and `elicitation`; Candidate B's
  contained only `sdcpn-modelling`.
- A could activate both skills and read the plugin's SDCPN resource.
- B could activate the plugin and read byte-identical universal content as a supporting resource.
- S1 and S4 acquired universal content through their candidate-specific paths.
- S2 and S3 acquired neither the independent capability nor the packaged universal resource.
- The selected universal instructions had the same SHA-256
  (`a4aedd68317bcde4b98490ea73efa4ee7881e2fe3cbcf3363e3db26e29180716`) in both
  candidates.
- Normalizing the one routing sentence made the plugin instruction bodies byte-identical.
- S5's attempted activation returned a successful tool result containing:
  `Skill "elicitation" is not available. Available skills: sdcpn-modelling.`
  The faux turn could continue, so the missing capability is an explicit soft failure rather than
  a fatal runtime error.

This evidence proves mounting, access, observability, and absence of hidden universal content. It
does not prove model judgment.

## Paid mechanism smoke

The smoke stopped after the two S1 runs because their two model calls each reached the
four-model-invocation ceiling. Both runs also exhibited the same shared failure. S2 was not run:
the budget was exhausted, and the side quest separately requires paid evaluation to stop when a
shared-content defect makes the comparison non-discriminating.

| Dimension | Candidate A — independent | Candidate B — packaged |
| --- | --- | --- |
| Job routing | Pass: activated `sdcpn-modelling` | Pass: activated `sdcpn-modelling` |
| Capability routing | Fail: did not activate `elicitation` although it was in the initial catalog | Fail: did not read `universal-elicitation.md` although the activated skill advertised it |
| Universal judgment | Fail: asked four orientation questions as a batch | Fail: asked five orientation questions as a batch |
| Plugin judgment | Pass: questions stayed in approval-process purpose, scope, and operational concerns | Fail: although mostly process-grounded, one question exposed Petri-net familiarity instead of staying in operational vocabulary |
| Composition | Fail: universal content never entered context, so the action could not compose both bodies of judgment | Fail for the same reason |
| Restraint | Indeterminate: S2 was not run | Indeterminate: S2 was not run |
| Disclosure | Pass: raw trace shows `sdcpn-modelling` only | Pass: raw trace shows `sdcpn-modelling` only |
| Evidence honesty | Pass: no approval-process facts or completed construction were invented | Pass: no approval-process facts or completed construction were invented |
| Failure clarity | Pass in hermetic S5: missing `elicitation` was explicit and actionable | Indeterminate: not applicable to B |
| Model calls | 2 | 2 |
| Input / output tokens | 3,506 / 560 | 3,454 / 528 |
| Cache write tokens | 4,732 | 4,694 |
| Total tokens | 8,798 | 8,676 |
| Model latency | 7,028 ms | 5,893 ms |
| Provider cost | USD 0.012221 | USD 0.0119615 |

Combined paid activity: 2 scenario runs, 4 provider calls, 17,474 total tokens, 12,921 ms summed
model latency, and USD 0.0241825. This reached the model-invocation ceiling and remained below the
USD 1.00 ceiling.

## Interpretation

The independent topology was not mechanically falsified: Flue mounted it, advertised it, activated
it under a prescribed faux path, and exposed a clear missing-capability result. The real model's
failure to activate it cannot be attributed specifically to independent mounting because the same
model also ignored Candidate B's packaged resource instruction and the shared
`sdcpn-elicitation.md` read.

The observed strain is therefore upstream of the topology comparison: after activating the shared
job skill, the current model answered directly instead of performing either required progressive
disclosure route. Post-hoc wording changes are forbidden in this probe, and expanding the campaign
would not repair that confound.

The bounded conclusion is to retain the current Mission 4 authority and production default. A new
probe would need a separately authorized, frozen shared-content revision or another discriminating
mechanism; this side quest supplies no warrant to choose A or B.
