# P7a — retained-session catch-up

## Pre-registration

Authorized by Lu in `f083bcb`, before provider dispatch. Guidance under test: `223d7218b0` (core system/elicitation/tool description and SDCPN skill), with exact file hashes in the private `vestera-persona-20260909-r2/p7a-preregistration.json`. No claims plugin is mounted.

The pre-window canonical snapshot has 36 messages, 11 `brunch_mark_question` calls, two skill activations, two resource reads and zero workpiece writes/reads. Its serialized SHA-256 is `5bab6875a018e5ba56e583ef89468cdb7034b409115be460e1e847c343e46a72`, unchanged after restarting the local server against the same Postgres database. The private manifest records the last message/submission IDs. The window opens at the first subsequent true-user message from the restored persona; its native message/submission IDs will be recorded upon admission, under Lu's accepted timing clarification. No prior testimony, marker or failed accounting submission is removed or replayed.

**Criterion:** the first post-window assistant turn must settle a revision before any new question marker, followed by at least one further settled revision before an explicit interview stop or construction. An operator pause is not a stop utterance to Brunch. First dispatch is limited to one ordinary `brunch_turn` so a first-turn failure cannot be obscured by later behavior. The persona receives no workpiece, cadence, domain-answer or expected-output coaching.

**Loaded-guidance precondition:** installed Flue's `prepareRerenderTurn()` replaces its loop's system prompt with the next render, but that source reading is not dispatch evidence. A local fetch observer records cadence/exact-core-prompt presence and request/system hashes immediately before Anthropic dispatch; it does not persist headers, credentials or conversation text. A synthetic fake-fetch check verified passthrough request/options/response identity without any network call, retained separately from real observations. Missing observer evidence or missing revised guidance leaves the behavioral precondition unproved rather than presumed satisfied.

The old persona process/pane was absent on inspection. The exact saved Pi session was restored in a new visible right-hand pane, with the same browser attachment, Sonnet model, restricted tool set and unmetered settings. The inherited provider key matched the intended key by a private comparison whose temporary file was removed. Server logs and original launchers were preserved. The private `p7a-before.jpg` captures the normal browser before dispatch.

## Outcome

Pending at pre-registration. Actual dispatch, canonical ordering, readback and browser visibility must be inspected independently. P7b's fresh-interview criterion is not established by this continuation; faithfulness and useful elicitation remain separate judgments.
