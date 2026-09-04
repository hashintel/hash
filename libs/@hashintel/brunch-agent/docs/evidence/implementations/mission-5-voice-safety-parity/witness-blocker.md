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
head `eecbe99e201fd8cb78d9b719e789b6abd373ed1b`. That parent now guards its
once-per-conversation hydration from replacing a locally visible assistant
response with an older canonical snapshot, so hydration no longer blocks this
witness. The remaining gate is the required human browser and microphone run.

An owner-directed PR #9531 side quest also removed a local launcher blocker
found at the real boundary on 2026-09-04. The Brunch-specific Vite config had
removed Petrinaut's entire `petrinaut-api-dev` plugin, so
`/api/voice/config` returned transformed module source instead of the handler's
JSON. The launcher now retains the website API plugin while continuing to
proxy only `/agents/chat/*` to Brunch. A config-level regression test loads the
real merged config, and an isolated `yarn dev:brunch` panel process with an
enabled non-secret test environment returned
`{"available":true,"connectionTimeoutMs":15000}`. This proves local Voice API
wiring only; it does not satisfy the human witness below.

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
