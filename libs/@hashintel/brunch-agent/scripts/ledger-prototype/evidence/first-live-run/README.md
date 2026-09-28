# First live Ledger run — recovered evidence

This directory preserves the recoverable evidence from the first 10-exchange inventory-purchasing Ledger simulation. The original run lived under `/tmp/brunch-ledger-prototype/runs/live-ng4438` and was lost when `/tmp` was cleared. Its final compiled Ledger, configuration and outcome had been read into the originating Pi conversation and are reconstructed here from that transcript.

This is not a byte-for-byte restoration of the run directory. The original native elicitor/persona Pi sessions, provider request dumps, per-exchange Ledger snapshots, complete public transcript JSONL and tool JSONL are absent. Do not treat these recovered files as substitutes for those raw records.

Observed run facts:

- Elicitor: `openai/gpt-5.6-sol`, low thinking.
- Persona: `anthropic/claude-sonnet-4-6`, low thinking.
- Case: `inventory-purchasing`.
- 10 exchanges, 29 provider requests, and 10 successful `ledger_commit` calls.
- 55 Notes, including 9 declared supersessions.
- No Ledger tool refusal or repair.
- Estimated catalogue cost: USD 0.3690737; final usage was known.
- Final compiled Markdown size observed at approximately 20.6 KB.
- The elicitor did not call `ledger_compile`; observer-side compilation produced the retained document.
- The run stopped at the exchange limit while opening the expiry topic; completion was runner completion, not elicitation completeness.
