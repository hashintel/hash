# Mission 4 repaired architecture scoring v4 — campaign abort

## Verdict

The frozen v4 campaign produced zero valid members and no grading calls were made. It therefore does not satisfy Mission 4's architecture scoring proof and cannot supply a Mission 5 handoff or visible-witness join.

The strengthened oracle worked: it rejected behavior the v3 checker had silently admitted. The production prompt still failed the routing contract, so the mission stops at the first failed boundary and repairs that behavior before another candidate can be frozen.

## Membership

| Replication | Outcome | Violations | Disposition |
| --- | --- | --- | --- |
| 1 | Runtime failure after the simulated expert returned no text | Two assistant messages each contained two explicit questions; no workpiece | Invalid; retained as simulator/provider and routing evidence |
| 2 | Eight turns and a recoverable workpiece | Two assistant messages each contained two explicit questions; `templates/workpiece.md` was not read before first creation | Invalid; retained as routing evidence |
| 3 | Eight turns and a recoverable workpiece | One assistant message contained two explicit questions | Invalid; retained as routing evidence |

Replication 3 successfully read universal and profile guidance before its first question and the workpiece template before creation. Replication 2 demonstrated that the template gate remained unreliable. All three demonstrated that prose saying “exactly one focused question” was insufficient to prevent paired interrogatives or an interrogative plus alternatives.

## Frozen identity

- Source commit: `e2ef069cb1fb778093abfc2c635ed750aaca9e7d`
- Campaign fingerprint: `bfc6b4c50ac3dd06f40c6ff41ed1363c1bb61d60fbef6e48ad41a9e0ec97f63e`
- Protocol: `prospective-runbook-v4`
- Namespace: `vestera-architecture-candidate-v4`

The raw JSON records retain exact Flue snapshots, transcripts, workpieces where available, model metadata, ordered resources, violations, and manifests. [`artifact-manifest.sha256`](artifact-manifest.sha256) records their emitted outer-byte hashes. Readable `.md` and `.ir.md` projections had trailing whitespace removed for repository hygiene; their canonical content remains embedded in the raw records. No invalid member is replaced or graded.

## Usage and budget

Recorded interviewer cost across the three members is `$0.45557625`. Simulated-expert usage totals 61,130 input and 3,059 output tokens across 18 calls. Three one-token credential/model preflights and simulated-expert prices were not emitted in the campaign records, so exact total spend cannot be stated. No grader call occurred.

The owner's v4 authorization is consumed by this failed campaign. It does not authorize a successor campaign or visible product witness.

## Required repair

Make the one-question invariant operationally explicit at the always-loaded boundary: one interrogative sentence and at most one `?` outside the workpiece, with no second question, menu, or alternative. Make first workpiece creation explicitly require a successful template read rather than relying on the phrase “required branch resources.” Re-run free production-boundary and hermetic checks, then freeze a new versioned protocol and request a new paid ceiling before execution.
