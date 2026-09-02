# Mission 5 input handoff

Status: **frozen Mission 4 exit join**

## Selected workpiece and source

Selected run:
`prospective-runbook-v3-replication-1-2026-09-02T11-41-53-281Z-3b64f006`

The selected workpiece is the only valid and independently scored v3 member. It is not represented as the best member of an estimated candidate range.

| Artifact | SHA-256 |
| --- | --- |
| Canonical committed run record, Flue snapshot, transcript, model calls, instrument manifest, and workpiece binding: `prospective-runbook-v3-replication-1-2026-09-02T11-41-53-281Z-3b64f006.json` | `2bfcf9e60a15e2014b17afede0258865b784cca205ca6a7709d4dbba20a86c66` |
| Selected Markdown workpiece: `prospective-runbook-v3-replication-1-2026-09-02T11-41-53-281Z-3b64f006.ir.md` | `f4bb30244671c5d7a983a937536bb11035201a37d6cc197e60a275e26dae58c5` |
| Omniscient report | `b37f7ed8403a0018b53c4c0c5784c3bf9c2c4fa843bedadf936127670f86ca27` |
| Omniscient request/model metadata | `cc497b1ed3872dc69dca3d5bdf3b8f1fe36fef4bd1b023112481412de32cb43e` |
| Cold review attempt 2 | `8086d4b48ec41ec62c4a25a897db40286b83c500ea054452f020595d445ba1ba` |
| Cold review attempt 2 request/model metadata | `c4e910cbd91d72e16107b21974e82b7b2218626d1ca1c4567c236bc9e5191804` |
| Campaign adjudication | `4020f188c7280009dc48a8b6ece8b8dcaa225d04dedb04bda08116c6d5375c2e` |
| Local/restricted product witness | `88addf723973e02ccdbe7c96e4c16180c46458a7b6983ad1647de9c69e281496` |

The raw record binds the workpiece to:

- source commit `794fe2fbf1eaeba3fc816c6e3d1755d7b444125d`;
- campaign fingerprint `e93d1fd6b23a38b12201dee967c1b65e58b7c3d5724f57f1bedeb9413d9b76e1`;
- workpiece content hash `99e4e201cdb4959c114495049e68d7f4d18bdc5c41a5b1d958001b4027fbe355`;
- source Flue message `entry_01M1GZ1BQQ6Y1SBS51E3K1W0NE`;
- source-message hash `42d1d9b7de99f143ed85c57dd3f09dcc166c55bf3e3c409a0607ec360d54dcf5`;
- requested interviewer and simulated-expert model `claude-sonnet-4-5`;
- provider-observed simulated-expert model `claude-sonnet-4-5-20250929`.

Use the JSON snapshot as the canonical source conversation. The readable `.md` transcript is a projection.

Artifact caveat: the runner-emitted JSON had SHA-256 `8b47844cd690e13e468ad2aaef27eef0e86f40c23ca82357703931aaaf189de6`. The repository pre-commit formatter normalized JSON whitespace before the artifact's first commit, producing the canonical committed hash above. Parsed content, embedded workpiece/source hashes, campaign fingerprint, calls, snapshot, and transcript are unchanged. Treat this as a disclosed outer-byte-integrity defect; do not claim the committed JSON is byte-for-byte runner output.

## Comparative disposition

- Omniscient score: `72.5 / 100`, inside the latest valid flat-prompt range `66.3–80.0`.
- Cold utility: human-adjudicated `3.2 / 4`, slightly below the flat-prompt range `3.3–3.5`; both cold attempts were provider-truncated with `stop_reason: refusal`.
- Downstream readiness: `conditional`.
- Hard-failure gates: none.
- Owner disposition: accepted as baseline-competitive with explicit limitations, without a general-superiority claim or another paid scoring campaign.

## Remaining gaps carried into Mission 5

1. The selected paid run read universal and profile references but did not read the workpiece template before first creation.
2. The post-campaign visible witness initially used relative resource labels and failed. The owner-authorized exact-URI instruction repair succeeded for the template on rerun, but that rerun did not read universal/profile guidance before its initial substantive question.
3. Acquisition remained the main quality weakness: shared changeover-crew contention, the VW-02 exception, family-specific bottlenecks, practiced lateness hierarchy, stage overlap, family-dependent speed, and minimum-run constraints remained missing.
4. Only one candidate workpiece was gradeable; two v3 members failed at the simulated-expert/provider boundary.
5. No honest prebuilt non-empty SDCPN or derivation fixture is included in this handoff. Mission 5 must prepare and label that pair without implying Mission 4 automatically projected it.
6. The source conversation was not compacted. Any successor relying on it must declare uncompacted-history dependence or prove recovery across actual Flue compaction.

Mission 5 may close a named gap while preparing the honest pair, but it must not launder one into projection rationale or claim that the post-repair production prompt was the scored instrument.
