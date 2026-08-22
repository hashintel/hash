# GitHub migration review

This manifest records the proposed GitHub PR title and body changes. It does not call GitHub or Linear.

## Validation

- All 25 source PRs appear exactly once, and every linked issue resolves to one proposed issue title.
- Source title, source body, source inner, normalized inner, and proposed body SHA-256 hashes were recomputed and matched.
- Every proposed title exactly matches `{ISSUE-ID}: {proposed Linear issue title}`.
- Every proposed body has one standalone Agent-notes details opener and one standalone closer.
- Every nonempty normalized inner record appears byte-for-byte exactly once in its proposed body.
- PR #23 equals its raw source inner after removing only the nested standalone details-tag lines. All remaining bytes stay ordered.
- Proposed titles and outers have no avoidable banned-word matches. Fixed matches: “actually” in #6 and #13, “surfaces” in #16, “slice” in #22, and “seams” in #24.

## Summary

- Title changes: 24
- Body changes: 8
- Ambiguities: 0
- Extraction methods:
  - 1 — outer canonical wrapper extracted; nested standalone wrapper tags removed from source inner
  - 22 — single canonical wrapper extracted
  - 2 — whole source body treated as authoritative inner record and wrapped once

## PRs

### [#1](https://github.com/hashintel/brunch-lite/pull/1) — FE-1374

- Title: `FE-1374: Assemble the spec` → `FE-1374: Assemble the elicitation harness specification`
- Body changed: `true`
- Extraction: whole source body treated as authoritative inner record and wrapped once
- Inner: 994 chars; source `b034992e70ad0e9a8ab26ba321aaa87f91365d563c4bb4a021dd8c5cee3aed51`; normalized `b034992e70ad0e9a8ab26ba321aaa87f91365d563c4bb4a021dd8c5cee3aed51`
- Normalization: Added one canonical Agent-notes wrapper around the unchanged source body.
- Concerns: None.

**Old outer**

_(none)_

**Proposed outer**

This branch assembles the elicitation harness specification and its companion product descriptions. It also records the second review round and the resulting changes to conversation history, absence states, evidence navigation, and reusable strategies.

### [#2](https://github.com/hashintel/brunch-lite/pull/2) — FE-1362

- Title: `FE-1362: Decide the September demo vehicle` → `FE-1362: Decide the September demo architecture`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 537 chars; source `9ea766c6ed1b481260e6cdfa69d077f14aa6f9044c104f1625f69be708cf525d`; normalized `9ea766c6ed1b481260e6cdfa69d077f14aa6f9044c104f1625f69be708cf525d`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

This branch records the decision that guided the September demonstration and organizes the supporting planning material. It gives later work one documented starting point instead of leaving the demo shape implicit.

**Proposed outer**

This branch records the decision that guided the September demonstration and organizes the supporting planning material. It gives later work one documented starting point instead of leaving the demo shape implicit.

### [#3](https://github.com/hashintel/brunch-lite/pull/3) — FE-1363

- Title: `FE-1363: Choose the reference use case; settle the SDCPN-showcase criterion` → `FE-1363: Choose the demo use case and modelling criteria`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 160 chars; source `61d4a1544d743147646d62c9ae8c4bfb0d70cfa15585c6348c8025e2ef892f27`; normalized `61d4a1544d743147646d62c9ae8c4bfb0d70cfa15585c6348c8025e2ef892f27`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

This branch defines the reference case used to judge the demonstration work. It makes the selection criteria clear enough for later planning and review.

**Proposed outer**

This branch defines the reference case used to judge the demonstration work. It makes the selection criteria clear enough for later planning and review.

### [#4](https://github.com/hashintel/brunch-lite/pull/4) — FE-1388

- Title: `FE-1388: Scaffold the Bun workspace and prove the CI smoke` → `FE-1388: Create the Bun workspace and enforce dependency boundaries`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 3407 chars; source `a64a1d8ff07ec6eb8ddff05773cfae355166251c53888725f2272d729eccd4ab`; normalized `a64a1d8ff07ec6eb8ddff05773cfae355166251c53888725f2272d729eccd4ab`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

The repository needed a runnable workspace before feature work could be trusted. This branch establishes the initial package layout and checks that catch boundary and build failures early.

**Proposed outer**

The repository needed a runnable workspace before feature work could be trusted. This branch establishes the initial package layout and checks that catch boundary and build failures early.

### [#5](https://github.com/hashintel/brunch-lite/pull/5) — FE-1364

- Title: `FE-1364: Define the intermediate representation for process-model elicitation` → `FE-1364: Define the process-model elicitation representation`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 471 chars; source `5855717a5f072802db5ab6383077122e4599d0435709ea2222b1da1006ba5d89`; normalized `5855717a5f072802db5ab6383077122e4599d0435709ea2222b1da1006ba5d89`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

This branch defines the shared representation used to turn elicited evidence into a model. The definition gives future plugins and projections a common basis without introducing another source of stored truth.

**Proposed outer**

This branch defines the shared representation used to turn elicited evidence into a model. The definition gives future plugins and projections a common basis without introducing another source of stored truth.

### [#6](https://github.com/hashintel/brunch-lite/pull/6) — FE-1361

- Title: `FE-1361: Baseline control — what does one-shot AI elicitation already achieve?` → `FE-1361: Measure the one-shot AI elicitation baseline`
- Body changed: `true`
- Extraction: single canonical wrapper extracted
- Inner: 1662 chars; source `fb6a119b6a835d5db47ffc75c42aa42213d0e7dc5b224fbccffeb462fb126408`; normalized `fb6a119b6a835d5db47ffc75c42aa42213d0e7dc5b224fbccffeb462fb126408`
- Normalization: The inner record is unchanged; the outer was revised to remove an avoidable banned-word use.
- Concerns: None.

**Old outer**

This branch records what a lightly guided model can already do in the reference case. The findings set a factual baseline for deciding which product machinery is actually needed.

**Proposed outer**

This branch records what a lightly guided model can already do in the reference case. The findings set a factual baseline for deciding which product machinery is needed.

### [#7](https://github.com/hashintel/brunch-lite/pull/7) — FE-1399

- Title: `FE-1399: Make the CI gates and dev app fail loudly where review found they fail silently` → `FE-1399: Fix verified silent failures in CI and the dev app`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 1487 chars; source `4fb763857dc7d92796d5c5100d3a1569bbe3e42455521a70c011b9fecfeafb2e`; normalized `4fb763857dc7d92796d5c5100d3a1569bbe3e42455521a70c011b9fecfeafb2e`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

Review found checks that could pass while failing to protect the behavior they claimed to cover. This branch makes those checks and the development app report those failures instead of quietly accepting them.

**Proposed outer**

Review found checks that could pass while failing to protect the behavior they claimed to cover. This branch makes those checks and the development app report those failures instead of quietly accepting them.

### [#8](https://github.com/hashintel/brunch-lite/pull/8) — FE-1397

- Title: `FE-1397: Validate the generic IR definition against worked payload designs (Gherkin, CPS, +1)` → `FE-1397: Validate the generic IR against worked plugin payloads`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 1490 chars; source `bf06af3e6f96d849b4c1be53c8a5d9a6d3d750d4f8fdd6ddd6cac5444ec17d8a`; normalized `bf06af3e6f96d849b4c1be53c8a5d9a6d3d750d4f8fdd6ddd6cac5444ec17d8a`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

The generic representation still needed evidence that it held across more than one domain shape. This branch tests it against worked payload designs and records which parts of the definition remain sound.

**Proposed outer**

The generic representation still needed evidence that it held across more than one domain shape. This branch tests it against worked payload designs and records which parts of the definition remain sound.

### [#9](https://github.com/hashintel/brunch-lite/pull/9) — FE-1400

- Title: `FE-1400: Close the review-found gaps where the gates, dev app, and baseline runner still fail silently` → `FE-1400: Strengthen verification, dev storage, and the baseline runner`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 3141 chars; source `417c1c5f7a1e36797056a57c4926ece639a5b1194698472254dc2bb5269d8de9`; normalized `417c1c5f7a1e36797056a57c4926ece639a5b1194698472254dc2bb5269d8de9`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

This branch resolves the remaining review findings where checks or local tools could report success without proving the intended behavior. The result makes those failure paths visible and testable.

**Proposed outer**

This branch resolves the remaining review findings where checks or local tools could report success without proving the intended behavior. The result makes those failure paths visible and testable.

### [#10](https://github.com/hashintel/brunch-lite/pull/10) — FE-1389

- Title: `FE-1389: Walking skeleton — the harness asks a free-text question and binds the reply` → `FE-1389: Implement the first suspended free-text question`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 1238 chars; source `f5792d146c557204d975fa7c7b4cacc298cced709faec5fe5cd951c46b0e7ea4`; normalized `f5792d146c557204d975fa7c7b4cacc298cced709faec5fe5cd951c46b0e7ea4`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

This branch proves the first end-to-end question-and-reply path through the real application harness. It establishes that a question can pause a turn, persist, and bind the later answer correctly.

**Proposed outer**

This branch proves the first end-to-end question-and-reply path through the real application harness. It establishes that a question can pause a turn, persist, and bind the later answer correctly.

### [#11](https://github.com/hashintel/brunch-lite/pull/11) — FE-1390

- Title: `FE-1390: Capture envelope, storage port, and the local capture store` → `FE-1390: Implement capture history and local persistence`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 1138 chars; source `dd6b285545fcc139792afefef315c9c22acc0e2f1b1d08a9a80b9198b98a46ba`; normalized `dd6b285545fcc139792afefef315c9c22acc0e2f1b1d08a9a80b9198b98a46ba`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

This branch gives captured evidence a durable local home with an explicit write path. It establishes reliable history for later model work while leaving consumption work to subsequent branches.

**Proposed outer**

This branch gives captured evidence a durable local home with an explicit write path. It establishes reliable history for later model work while leaving consumption work to subsequent branches.

### [#12](https://github.com/hashintel/brunch-lite/pull/12) — FE-1401

- Title: `FE-1401: Resolve the follow-ups from the stack legibility session` → `FE-1401: Resolve the stack legibility follow-ups`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 1429 chars; source `deb834741c2f9b93ca8d47f6032007240f2aeafb09d79b6e6593f4d11f61226a`; normalized `deb834741c2f9b93ca8d47f6032007240f2aeafb09d79b6e6593f4d11f61226a`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

The legibility review produced findings that needed durable documentation and follow-up ownership. This branch records those findings, repairs the affected planning material, and makes the remaining work visible.

**Proposed outer**

The legibility review produced findings that needed durable documentation and follow-up ownership. This branch records those findings, repairs the affected planning material, and makes the remaining work visible.

### [#13](https://github.com/hashintel/brunch-lite/pull/13) — FE-1419

- Title: `FE-1419: Close the seams where the capture store and verification gates claim more than they enforce` → `FE-1419: Align capture-store rules and verification claims`
- Body changed: `true`
- Extraction: single canonical wrapper extracted
- Inner: 2201 chars; source `03aaf220ef749b0fcb9a0b8a846cc9670fd135f285e682acaf84c04dc77759a0`; normalized `03aaf220ef749b0fcb9a0b8a846cc9670fd135f285e682acaf84c04dc77759a0`
- Normalization: The inner record is unchanged; the outer was revised to remove an avoidable banned-word use.
- Concerns: None.

**Old outer**

This branch closes places where the capture store and verification checks promised stronger guarantees than they actually enforced. It aligns the implementation and the checks with the properties the stack relies on.

**Proposed outer**

This branch closes places where the capture store and verification checks promised stronger guarantees than they enforced. It aligns the implementation and the checks with the properties the stack relies on.

### [#14](https://github.com/hashintel/brunch-lite/pull/14) — FE-1424

- Title: `FE-1424: The documentation protocol runs end to end: inbox settled, planning reshaped, index gated, arc-close triggerable` → `FE-1424: Complete the documentation protocol`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 2328 chars; source `901600f53a27bda06c361821ab502ea6e0e30a5c279c9503fd5f0ea6ca13c050`; normalized `901600f53a27bda06c361821ab502ea6e0e30a5c279c9503fd5f0ea6ca13c050`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

The documentation protocol described a complete lifecycle but had not yet been exercised as one. This branch runs that lifecycle, gives each document a clear home, and adds a check that keeps the index honest.

**Proposed outer**

The documentation protocol described a complete lifecycle but had not yet been exercised as one. This branch runs that lifecycle, gives each document a clear home, and adds a check that keeps the index honest.

### [#15](https://github.com/hashintel/brunch-lite/pull/15) — FE-1405

- Title: `FE-1405: Draft the CPS payload interiors: annotated shapes for the ten kinds, worked from baseline utterances` → `FE-1405: Draft and test the CPS payload schemas`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 2226 chars; source `c9864945e962b46747bac5d78ecf91947d3ed95f4ae9cd3f7e7e22fecf363083`; normalized `c9864945e962b46747bac5d78ecf91947d3ed95f4ae9cd3f7e7e22fecf363083`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

The CPS plugin needed concrete payload shapes grounded in the baseline evidence. This branch drafts those shapes and records the open pressures that later work must resolve.

**Proposed outer**

The CPS plugin needed concrete payload shapes grounded in the baseline evidence. This branch drafts those shapes and records the open pressures that later work must resolve.

### [#16](https://github.com/hashintel/brunch-lite/pull/16) — FE-1422

- Title: `FE-1422: The ask protocol is substrate-portable: mechanism moves from the Flue binding into core` → `FE-1422: Move the portable ask protocol into core`
- Body changed: `true`
- Extraction: single canonical wrapper extracted
- Inner: 566 chars; source `59fdea11ba00ea9f408a7936f5f48176856261837a2957afbd506aa653c88008`; normalized `59fdea11ba00ea9f408a7936f5f48176856261837a2957afbd506aa653c88008`
- Normalization: The inner record is unchanged; the outer was revised to remove an avoidable banned-word use.
- Concerns: None.

**Old outer**

The question-and-reply behavior was tied too closely to one runtime binding. This branch moves the portable part into the core so other application surfaces can use the same protocol.

**Proposed outer**

The question-and-reply behavior was tied too closely to the Flue runtime binding. This branch moves the portable part into core so other applications can use the same protocol.

### [#17](https://github.com/hashintel/brunch-lite/pull/17) — FE-1391

- Title: `FE-1391: Durable entry projection, harness-resolved anchoring, and the session-log archive` → `FE-1391: Resolve evidence quotes to durable conversation entries`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 1167 chars; source `aa0dc9d30893dc7c516127e3e33517a0cee1493d257d73d835e9ec3ad0840d23`; normalized `aa0dc9d30893dc7c516127e3e33517a0cee1493d257d73d835e9ec3ad0840d23`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

Later capture work needed a durable way to locate and anchor prior conversation entries. This branch establishes that path and retains enough history for those anchors to be resolved reliably.

**Proposed outer**

Later capture work needed a durable way to locate and anchor prior conversation entries. This branch establishes that path and retains enough history for those anchors to be resolved reliably.

### [#18](https://github.com/hashintel/brunch-lite/pull/18) — FE-1392

- Title: `FE-1392: Settlement trigger and sweep — the first captured statement` → `FE-1392: Capture settled conversation statements safely`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 220 chars; source `df3111e4b7761fa8032c600be382986205f9317ed03564010aa4b5e8172b2986`; normalized `df3111e4b7761fa8032c600be382986205f9317ed03564010aa4b5e8172b2986`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

This branch connects completed conversation work to the first captured statement. It makes settlement occur at the appropriate lifecycle point and keeps the resulting evidence current.

**Proposed outer**

This branch connects completed conversation work to the first captured statement. It makes settlement occur at the appropriate lifecycle point and keeps the resulting evidence current.

### [#19](https://github.com/hashintel/brunch-lite/pull/19) — FE-1432

- Title: `FE-1432: The stack's open review threads are adjudicated: fixed, owned, or refused on the record` → `FE-1432: Resolve the stack's open review threads`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 1559 chars; source `19f5f98e93e5519ab3b1bc2ece5499a459022157087eec5015c58a9c56d17d6b`; normalized `19f5f98e93e5519ab3b1bc2ece5499a459022157087eec5015c58a9c56d17d6b`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

The stack had review findings without a clear final disposition. This branch resolves them by fixing the actionable cases and recording ownership or a supported refusal for the rest.

**Proposed outer**

The stack had review findings without a clear final disposition. This branch resolves them by fixing the actionable cases and recording ownership or a supported refusal for the rest.

### [#20](https://github.com/hashintel/brunch-lite/pull/20) — FE-1433

- Title: `FE-1433: The elicitor serves demo.petrinaut.org's chat panel from a remote brunch-agent server` → `FE-1433: Deliver the remote Petrinaut elicitor integration`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 2365 chars; source `9ca3adac2b7d307ec1440ef7d27bd38111d069641c9c688cd9a931f3e2af7ce9`; normalized `9ca3adac2b7d307ec1440ef7d27bd38111d069641c9c688cd9a931f3e2af7ce9`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

The demo needed a settled integration direction before implementation could proceed. This branch records the decision to serve the existing chat panel from a remote brunch-agent server and defines the delivery work that follows.

**Proposed outer**

The demo needed a settled integration direction before implementation could proceed. This branch records the decision to serve the existing chat panel from a remote brunch-agent server and defines the delivery work that follows.

### [#21](https://github.com/hashintel/brunch-lite/pull/21) — FE-1434

- Title: `FE-1434: Spike: does Flue turn suspension carry batched client-tool round-trips?` → `FE-1434: Test whether Flue resumes batched client-tool results`
- Body changed: `false`
- Extraction: single canonical wrapper extracted
- Inner: 747 chars; source `75374819449c6180ad66bdbce8100715a814735ed9812ee909cbe7de36831b0a`; normalized `75374819449c6180ad66bdbce8100715a814735ed9812ee909cbe7de36831b0a`
- Normalization: None; the canonical body and inner record are preserved byte-for-byte.
- Concerns: None.

**Old outer**

The planned integration depends on whether suspended turns can resume with several client-tool results together. This spike answers that question with recorded evidence and identifies the remaining obligations.

**Proposed outer**

The planned integration depends on whether suspended turns can resume with several client-tool results together. This spike answers that question with recorded evidence and identifies the remaining obligations.

### [#22](https://github.com/hashintel/brunch-lite/pull/22) — FE-1435

- Title: `FE-1435: Spike: does a harness-driven stream drive Petrinaut's real chat panel?` → `FE-1435: Test whether the elicitor stream drives Petrinaut’s chat panel`
- Body changed: `true`
- Extraction: single canonical wrapper extracted
- Inner: 783 chars; source `9e78b931b4c73c4fa061c49db1121b77958f68707520b3ba33ffeffba819e3fe`; normalized `9e78b931b4c73c4fa061c49db1121b77958f68707520b3ba33ffeffba819e3fe`
- Normalization: The inner record is unchanged; the outer was revised to remove an avoidable banned-word use.
- Concerns: None.

**Old outer**

The integration needed proof that the real chat panel accepts the stream produced by the harness. This spike exercises that path and records the resulting wire evidence before the production slice builds on it.

**Proposed outer**

The integration needed proof that the real chat panel accepts the stream produced by the harness. This spike exercises that path and records the resulting wire evidence before the production integration builds on it.

### [#23](https://github.com/hashintel/brunch-lite/pull/23) — FE-1451

- Title: `FE-1451: Keep issues, comments, and PRs easy to scan` → `FE-1451: Keep issues, comments, and PRs easy to scan`
- Body changed: `true`
- Extraction: outer canonical wrapper extracted; nested standalone wrapper tags removed from source inner
- Inner: 2380 chars; source `7d0c7197002a2bd29907e73de006782e60a3104da9f54a8082d12c3d88fc3899`; normalized `14c689899a8f5687c0f26293949b64974adc409de4379339d847a0356991b723`
- Normalization: Removed the nested standalone details opener and closer only. All non-structural bytes remain in source order; the final body has one canonical wrapper.
- Concerns: None.

**Old outer**

Agent-written issues, comments, and PR descriptions had become hard to scan. This branch sets a compact title format and a plain-language summary above collapsed agent working detail, then applies the rules to the issue that introduced them.

**Proposed outer**

Agent-written issues, comments, and PR descriptions had become hard to scan. This branch sets a compact title format and a plain-language summary above collapsed agent working detail, then applies the rules to the issue that introduced them.

### [#24](https://github.com/hashintel/brunch-lite/pull/24) — FE-1436

- Title: `FE-1436: The elicitor answers conversation turns in Petrinaut's real chat panel` → `FE-1436: Connect the elicitor to Petrinaut’s real chat panel`
- Body changed: `true`
- Extraction: single canonical wrapper extracted
- Inner: 1147 chars; source `10e4f1c874197ab56e237d4d4ffbe11ff3b8a286a3b0a7f3036cdbc4a23ff8aa`; normalized `10e4f1c874197ab56e237d4d4ffbe11ff3b8a286a3b0a7f3036cdbc4a23ff8aa`
- Normalization: The inner record is unchanged; the outer was revised to remove an avoidable banned-word use.
- Concerns: None.

**Old outer**

The spikes proved the required seams separately, but the elicitor still needed to answer real chat turns in the target panel. This branch connects that path and preserves the evidence needed to verify completed, failed, and cancelled turns.

**Proposed outer**

Separate spikes proved Flue suspension and AI SDK panel streaming, but the elicitor still needed to answer real chat turns in the target panel. This branch connects that path and preserves the evidence needed to verify completed, failed, and cancelled turns.

### [#25](https://github.com/hashintel/brunch-lite/pull/25) — FE-1449

- Title: `FE-1449: A structured brunch question suspends and resumes visibly in Petrinaut` → `FE-1449: Prove a structured brunch question suspends and resumes in Petrinaut`
- Body changed: `true`
- Extraction: whole source body treated as authoritative inner record and wrapped once
- Inner: 2146 chars; source `37dedf722f51fb6dd12e5e690a1f843040a5c84edf5d8ed8187ee386980d3851`; normalized `37dedf722f51fb6dd12e5e690a1f843040a5c84edf5d8ed8187ee386980d3851`
- Normalization: Added one canonical Agent-notes wrapper around the unchanged source body.
- Concerns: None.

**Old outer**

_(none)_

**Proposed outer**

This branch keeps a structured brunch question open on the AI SDK wire and resumes the same Flue conversation when the matching human answer arrives through the committed application route. It validates the reply against durable conversation history and rejects stale, duplicate, forged, malformed, and machine-only submissions before dispatch. Petrinaut component registration through FE-1448 remains required for full acceptance.
