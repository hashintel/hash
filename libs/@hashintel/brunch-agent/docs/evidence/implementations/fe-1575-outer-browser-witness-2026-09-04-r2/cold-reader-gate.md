# Mission 6 cold-reader gate

Reviewer qualification: a human who did not watch the implementation or outer witness. Do not give the reviewer `witness.md`, screenshots, implementation files, or this mission's expected conclusions.

Give the reviewer only:

- [prepared-workpiece.md](prepared-workpiece.md)
- [latest-workpiece.md](latest-workpiece.md)
- [cold-reader-records.json](cold-reader-records.json)

Ask for a written response to these questions:

1. Who authored each workpiece revision, and what in the supplied Flue records establishes that attribution?
2. What exact dispatch-crew quantity or resource policy is recorded?
3. What operation reserves the crew, and what operation returns it?
4. List every unresolved timing, failure, and recovery point.
5. What behavioral execution or operational-provenance claims, if any, can be made from these materials alone?

Acceptance requires the human response to:

- attribute revision zero to test preparation, not the model;
- attribute the later assistant record to model production;
- recover the exactly-one-crew policy and the intended reservation/return;
- preserve every timing, failure, and recovery unknown; and
- avoid inferring behavioral execution or capture provenance.

Record the reviewer's identity, date, verbatim response, and explicit accept/reject decision below only after the review occurs.

## Human verdict

- Reviewer identity: friend
- Review date: 2026-09-04
- Explicit decision: **ACCEPT**

### Verbatim response

```text
1. Authorship of each revision

 prepared-workpiece.md — test/harness-authored, not model-produced.
 Discriminators in cold-reader-records.json → preparedRecord:
 - role: "system", purpose: "dispatch", display: "diagnostic" — a system-injected diagnostic entry, not an assistant turn. No turnId.
 - signal.tagName: "prepared-fixture" with attributes.authorship: "test-authored" and claimBoundary: "prepared-not-model-produced".
 - The text part opens "Fixture authorship: test-authored preparation for Mission 6" and its runbook-ir block is content-identical to prepared-workpiece.md.
 - The entry id entry_direct_c3ViX2lr… is entry_direct_ + base64 of its own submissionId (sub_ik_f24939…), consistent with a directly-inserted record rather
   than a generated turn.

 latest-workpiece.md — assistant (model) authored.
 Discriminators in revisedRecord:
 - role: "assistant", purpose: "assistant", display: "visible", and a turnId (turn_01M1NQGQ…) — a model turn under a distinct submission (sub_ik_6dbc18…).
 - The runbook-ir block inside that record is content-identical to latest-workpiece.md.
 - No signal block / authorship attribute exists on this record; attribution rests on role alone.

 Two caveats a reader should hold:
 - The assistant-authored revision's own Claim boundary still says "This is test-authored diagnostic material." That sentence is inherited prose and is wrong
   for this revision per the record's role. The record, not the in-text sentence, is the discriminator.
 - Neither record carries a timestamp, model identifier, or provider. The prepared→revised ordering is inferred from content ("Revised", "has been added")
   and from the differing submission ids, not from metadata. Nothing in these records links the two submissions causally.

 2. Recorded quantity / resource policy

 Both revisions: exactly one dispatch crew. "Starting final inspection consumes that one available crew; sign-off returns it."

 Differences between revisions:
 - Prepared qualifies it "in this fixture"; revised drops the qualifier.
 - Revised adds the general firing rule "No transition fires without sufficient tokens in all input places" and describes dispatch-crew-available as "(1
   token when free)".

 Note: the "exactly one" is stated as policy in prose. No initial marking appears in any of the three files (the assistant's JSON excerpt shows inputArcs
 only), so the quantity is asserted, not shown.

 3. Reserve / return operations

 - Reserves: Start final inspection / start-final-inspection, via a weight-1 standard input arc from dispatch-crew-available.
 - Returns: Sign-off / sign-off, via an output arc to dispatch-crew-available.

 Evidence status within the packet: the prepared workpiece says the reserving arc is deliberately absent; the revised says it "has been added and verified."
 The only support in these files is the assistant's self-quoted inputArcs snippet inside its own text — no tool result, snapshot, or hash. The sign-off→crew
 return arc is asserted in prose in both revisions and never shown as data in any of the three files.

 4. Unresolved timing, failure, and recovery points

 From the prepared revision (one sentence): inspection and sign-off timing, failure modes, recovery behavior.

 From the revised revision (enumerated):
 1. Inspection timing — duration, stochasticity, determinism.
 2. Sign-off timing — duration, stochasticity, determinism.
 3. Failure modes — whether inspection can fail, halt, or reject a batch.
 4. Recovery behavior — how failures/rejections affect batch state or crew availability.

 Also excluded by the revised Claim boundary (unresolved by omission): failure handling, full process projection, integration with upstream/downstream
 operations.

 Reviewer observation (inference from the described net, not a stated unknown): as specified, the crew token is consumed by start-final-inspection and
 returned only by sign-off. Any failure/reject path that does not pass through sign-off would leave the single crew permanently unavailable — i.e., items 3
 and 4 above are not independent; unresolved failure modes imply a potential deadlock in the sole-crew resource. Neither revision names this.

 5. Behavioral-execution or operational-provenance claims supportable from these materials alone

 None.
 - Both workpieces explicitly disclaim capture provenance and behavioral execution.
 - No firing sequence, marking trace, simulation output, or tool-call result appears in any of the three files.
 - The revised record's "Verification successful" / "verified in the live Petrinaut definition" is an assistant assertion supported only by the assistant's
   own quoted JSON. From these files you can say the model claimed verification; you cannot say verification occurred, nor that the live definition contains
   the arc.
 - Operational provenance of the prepared fixture is established only to the extent "a system-role record with a test-authored signal exists" — not who/what
   produced it, or when.
```
