# FE-1580 real-witness blocker

## Current disposition

The real Voice witness has **not** been run and no witness bundle is claimed.
Completed-transcript authority, admission idempotency, half-duplex handoff,
acknowledged cancellation, exact full-response replay, durable Stop, dormant-ask
exclusion, exact Brunch-marked question replay, and the supported client-tool
portion of Voice provenance have focused automated coverage. Automated coverage
cannot replace the microphone, handoff, unsettled Stop, hard-reload, and
network-route witness required for mission acceptance. Direct-user Voice
attribution has a separate [Flue projection blocker](provenance-blocker.md).

The parent branch still runs canonical hydration once per conversation in a way
that can overwrite a locally submitted turn. The successor may not fix that
parent-owned defect. A hard-reload recording made before the parent fix would
therefore be unable to establish the required durability claim.

## Re-entry gate

After [PR #9528](https://github.com/hashintel/hash/pull/9528) lands a fix and this
branch is restacked onto its new verified head:

1. run one real microphone turn and retain the sanitized Voice event ledger;
2. use **Your turn** during output and retain cancellation acknowledgements;
3. durably stop an unsettled turn and retain its stopped settlement;
4. hard-reload a settled Voice turn and retain the canonical Flue snapshot;
5. retain a network route summary proving the absolute Flue `streamUrl` remains
   on the same-origin proxy; and
6. record the exact commits and hashes for every retained artifact.

Until then, `witness.md`, `voice-events.jsonl`, `network-routes.json`,
`flue-snapshot.json`, and `settlements.json` are intentionally absent rather
than populated with simulated evidence.
