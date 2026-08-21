# FE-1434 suspension spike verdict

## Question

Can Flue end a turn with several client-tool calls pending, preserve their binding state, and
resume on a later dispatch that returns all outputs as data inside one machine-authored batch
entry? If it can, should the external-tool batch use the same pending-interaction pattern as the
existing singular user-question (`ask`) affordance, or does it require another inbound channel?

## Approach

The bounded probe uses Flue 2.0.3 in process, its public HTTP router and history projection, and
a deterministic faux provider. It adds no production protocol. The disposable evidence
instrument is preserved in commit `4df6f86b6881653c3400eca101df01d21211dba1` at
`apps/dev/test/flue-client-tool-suspension.probe.ts`; at that commit it ran as
`node --experimental-strip-types apps/dev/test/flue-client-tool-suspension.probe.ts`. The branch
head intentionally removes the probe source. Its normalized captured output persists as
[`fe-1434-suspension-evidence-2026-08-19.json`](fe-1434-suspension-evidence-2026-08-19.json).

The faux provider emits a multi-tool batch in which every tool outcome returns
`terminate: true`. Each callback records its Flue `toolCallId` through updater-form
`usePersistentState`, so calls in the same batch compose rather than overwrite each other. A
later `signal` dispatch carries all browser results as one JSON batch keyed by those ids. The
success-path resume hook checks that the returned ids exactly cover the durable pending ids,
clears the slot after that check, and emits a machine binding signal before the next model turn.
The probe did not run negative mismatch or retry cases; fail-before-clear remains a requirement
for the protocol ticket rather than a behavioral claim from this spike.

Two cases ran: three returned tool outputs, retained as a normalized before/after transcript,
and 100 returned tool outputs, pressure-testing the count raised by the
[Petrinaut survey §6d](../research/petrinaut-survey.md#6d-where-the-evidence-is-thin) for a
roughly 40-place net. These are faux outputs, not 100 real dependent Petrinaut mutations. The
probe then read public Flue history through the binding's
[`projectFlueHistoryForSweep`](../../../../packages/binding-flue/src/history-reader.ts) function
and tried to cite a recorded result sentinel in an actual capture-store sweep. It also attempted
an undeclared native `kind: 'tool-result'` dispatch to distinguish a native Flue carrier from a
harness-defined envelope.

## Verdict

**The suspension floor holds, with a signal carrier.** A terminating multi-tool batch settled
after one model turn and before any result signal existed. One later dispatch to the same
conversation produced a binding signal whose pending and returned ids match exactly, then exposed
every returned output to the following model turn. The 3-output evidence retains the five-entry
normalized transcript; the 100-output evidence records the same transition with count and
first/last-id checks.

Flue does not accept a native inbound tool-result delivery. The attempted
`kind: 'tool-result'` message was rejected before admission with HTTP 400 `invalid_request`.
The public Flue SDK type available to the probe admits `user | signal`, and the runtime rejection
confirms the closed union, so the external-tool protocol must carry its tool-call-id-keyed result
batch inside a `signal`. That is not user-message laundering: the materialized return was
`role: system`, `purpose: dispatch`, `display: diagnostic`; the binding projected it as
`non-user`; and the capture store refused the transcript sentinel `batch-003-result-001` with
`non-user-evidence` and the explicit message that injected non-user entries cannot be cited.

**Adjudication: batch-as-pending-slot variant, not a parallel channel.** The observed behavior
requires only one live pending-interaction slot, represented as either the existing singular
user-question variant or an external-tool-batch variant containing every call from one assistant
turn. The return signal names the batch and provides one result per pending `toolCallId`. Because
that shape succeeded, a second inbound transport or separately persisted result log is not
required by the evidence; selecting the slot variant is the smaller design, not proof that every
parallel design lacks value. As a recommended guardrail, initially reject a model turn that tries
to suspend both a user question and a client-tool batch. Mixed-pending semantics remain untested.

FE-1435 (the panel-to-AI-SDK adapter spike named by the
[integration spec](../petrinaut-integration-spec.md#testing-decisions)) still has to prove that
the real panel's batched tool-result POST can become this one Flue signal without losing ids.
That is the exact remaining wire uncertainty; it does not reopen the Flue runtime behavior tested
here.

## Confidence shift

Confidence is high for the tested Flue behavior: the proof crosses real admission, runtime,
persistent state, public history, binding projection, and capture-store boundaries without a
live model. Confidence in the panel adapter is unchanged until FE-1435 runs the recorded panel
round-trip.

Observed dispatch and model-turn counts were the same at both sizes:

| Returned results | Request dispatches | Result-return dispatches | Total dispatches | Model turns |
| ---------------: | -----------------: | -----------------------: | ---------------: | ----------: |
|                3 |                  1 |                        1 |                2 |           2 |
|              100 |                  1 |                        1 |                2 |           2 |

The protocol therefore permits one result-return dispatch to carry 100 outputs; it does not
require one Flue dispatch per output. Because the probe ran in process, it did not measure real
network round-trips or latency. A real 100-mutation turn would still mean 100 tool calls, 100
client executions, and 100 correlated outputs, with their payload, context, local execution
ordering, and any provider tool-count limits.

## Recommendation

FE-1438 (the external-tool round-trip protocol) should put portable batch state and validation
around one durable pending interaction, while the Flue binding maps the portable result batch to
one non-user signal. Exact id coverage, duplicate/retry handling, and fail-before-clear semantics
are protocol requirements still to test. The wire adapter should translate the panel's returned
tool outputs into that signal rather than asking Flue to admit tool-result messages it does not
support.

The app-level `PetrinautDocHandle` fallback is **not selected**, because the required suspension
shape succeeded. If the adapter spike later shows that the panel's real POST cannot be translated
while preserving the batch's ids, one-return-dispatch shape, and non-user provenance, that is the
failure condition: select the doc-handle path in writing and retain this probe as evidence that a
future Pi-substrate binding (`binding-pi`) needs a first-class machine delivery or the same
explicit signal envelope.

> **Reflection:** Re-rendered as a transport budget, the result is narrower than “100 mutations
> are cheap.” Flue proves one suspension and one return dispatch can carry the batch; it says
> nothing about whether Petrinaut can apply 100 dependent mutations concurrently or whether the
> model/provider will emit that many calls in one turn. Those pressures remain visible instead
> of being smuggled into the substrate verdict.
