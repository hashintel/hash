# FE-1580 human-evidence gate

## Current disposition

The real Voice witness has **not** been run and no witness bundle is claimed.
Completed-transcript authority, admission idempotency, half-duplex handoff,
acknowledged cancellation, exact full-response replay, durable Stop, dormant-ask
exclusion, exact Brunch-marked question replay, and the supported client-tool
portion of Voice provenance have focused automated coverage. Automated coverage
cannot replace the microphone, handoff, unsettled Stop, hard-reload, and
network-route witness required for mission acceptance. Direct-user Voice
attribution has a separate [Flue projection blocker](provenance-blocker.md).

The successor is restacked onto [PR #9528](https://github.com/hashintel/hash/pull/9528)
head `6ca81b7bc4d6c112ff3936c38a7209d07f773b8a`. That parent now guards its
once-per-conversation hydration from replacing a locally visible assistant
response with an older canonical snapshot, so hydration no longer blocks this
witness. The remaining gate is the required human browser and microphone run.

## Re-entry gate

Using the final source/build commit:

1. submit one typed turn;
2. run one real microphone turn and confirm exactly one matching user message;
3. confirm visible text and synthesized speech use the same canonical response;
4. use **Your turn** during output and retain cancellation acknowledgements;
5. confirm pre-handoff audio cannot submit and fresh post-handoff speech can;
6. durably stop an unsettled turn and retain its stopped settlement;
7. replay the exact full response and exact marked question;
8. hard-reload the settled conversation and confirm no resubmission or
   automatic replay;
9. retain the canonical Flue snapshot and settlement index;
10. retain a network route summary proving the absolute Flue `streamUrl`
    remains on the same-origin proxy; and
11. record the exact source/build and evidence commits plus hashes for every
    retained artifact.

The comparative latency proof also requires ten audible trials at pinned donor
#9496 head `c7fe8a2e68e8fdc37018b21ec2e9daf4e9ef7c82` and ten at the final
candidate. Both sets use the same machine, browser, microphone/input phrase,
model configuration, warm/cold-start policy, and finalized-speech-to-first-
audible-canonical-TTS boundary. Raw sanitized samples, the calculation method,
environment, commit identities, median, and p95 must be retained; the candidate
median may not regress and p95 regression must remain below 20%.

Until then, `witness.md`, `voice-events.jsonl`, `network-routes.json`,
`flue-snapshot.json`, and `settlements.json` are intentionally absent rather
than populated with simulated evidence. Latency samples and statistics are also
intentionally absent until the comparable human trials run.
