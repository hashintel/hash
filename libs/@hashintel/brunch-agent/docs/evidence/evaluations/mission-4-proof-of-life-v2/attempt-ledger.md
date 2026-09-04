# Mission 4 proof-of-life v2 attempt ledger

Campaign stopped on S4 under the frozen rule. The owner later accepted Mission 4 closure with that failure deferred as non-blocking; no replacement or full run was admitted.

Instrument commit: `95954b494308fbba384cc4ce169a813916f164f9`

Manifest commit: `d9ca2fe1498f6484746b2abaaf18973e7abcbeaa`

Frozen manifest SHA-256: `91bc02e59dad3ed2d7791e3e1b095435c18fca8c78b4302e9e3bb43872e727a9`

| Order | Slot | Attempt | Technical validity | Ruler result | Campaign disposition |
| ---: | --- | --- | --- | --- | --- |
| 1 | Vestera probe | [`m4-pol-v2-vestera-p1`](runs/m4-pol-v2-vestera-p1/) | Valid | 4a pass; 5a pass; opening 5d pass | Floor-satisfying probe |
| 2 | Data Centre probe | [`m4-pol-v2-data-centre-p1`](runs/m4-pol-v2-data-centre-p1/) | Valid | 4a pass; 5a pass; opening 5d pass | Floor-satisfying probe |
| 3 | S3 resolvable review | [`m4-pol-v2-s3-p1`](runs/m4-pol-v2-s3-p1/) | Valid | 4d pass | Review restraint satisfied |
| 4 | S4 knowledge-gap review | [`m4-pol-v2-s4-p1`](runs/m4-pol-v2-s4-p1/) | Valid | 4e fail: no `activate(elicitation, ok)` | Valid behavioral failure; campaign stopped |
| 5 | Industrial Gas full | Not admitted | — | — | Prohibited after S4 failure |

No replacement is permitted for S4 because the primary is technically valid. The reserved S4 replacement and both Industrial Gas ids remain unused.
