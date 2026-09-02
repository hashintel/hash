# Mission 4 close record

Closed: 2026-09-02  
Issue: [FE-1563](https://linear.app/hash/issue/FE-1563/redesign-the-elicitation-runbook-and-workpiece-against-the-frozen)

## Accepted result

Mission 4 promoted the owner-selected compact core prompt, SDCPN append, one `defineSkill`-assembled `sdcpn-modelling` skill, core-authored universal elicitation resource, SDCPN profile, Five-Register workpiece, construction guidance, and evidence-level checks into the production Flue `ChatAgent`.

The owner accepted the architecture as baseline-competitive with explicit limitations. No claim of universal superiority, remote deployment, automatic projection, durable capture, or complete process acquisition is made.

## Comparative evidence

The v3 architecture campaign compared only with the latest two valid flat-prompt controls.

- Candidate: omniscient `72.5 / 100`, cold `3.2 / 4`, conditional readiness, no hard-failure gate.
- Flat prompt: omniscient range `66.3–80.0`, cold range `3.3–3.5`, conditional readiness, no hard-failure gates.
- Candidate strengths: semantic conservation and gap/loss discipline.
- Candidate weaknesses: acquisition coverage, reader effort, one gradeable member out of three.
- Runtime failures: two simulated-expert/provider refusals, reported separately from quality.
- Cold review: two fresh contexts agreed on `3.2`, but both were provider-truncated with `stop_reason: refusal`.

Evidence:

- [`../evaluations/vestera-architecture-candidate-v3/campaign-adjudication.md`](../evaluations/vestera-architecture-candidate-v3/campaign-adjudication.md)
- [`../evaluations/vestera-architecture-candidate-v3/mission-5-handoff.md`](../evaluations/vestera-architecture-candidate-v3/mission-5-handoff.md)

## Visible product witness

The accepted local/restricted boundary crossed:

```text
Petrinaut panel → same-origin /api/chat → AI SDK transport
→ production Flue ChatAgent → sdcpn-modelling skill → visible runbook-ir
```

The first launch exposed stale Petrinaut build output. A correct Vite 8.2.2 package rebuild restored the panel without source changes. The first conversation then exposed relative `read_skill_resource` labels failing against Flue's packaged-resource URI contract. The owner authorized a one-line exact-advertised-URI instruction repair. The rerun activated the skill, successfully read the advertised workpiece-template URI, asked one focused question, rendered an epistemically marked workpiece, and did not mount or call construction tools.

The rerun still did not read universal/profile references before its initial substantive question. That accepted limitation remains explicit.

Evidence: [`../evaluations/vestera-architecture-candidate-v3/product-witness.md`](../evaluations/vestera-architecture-candidate-v3/product-witness.md).

## Mission 5 join

The frozen handoff selects v3 replication 1 and binds:

- exact raw Flue snapshot and readable transcript;
- selected workpiece and source-message hashes;
- exact source commit, campaign fingerprint, requested/observed models, and instrument manifest;
- omniscient and cold reports plus request metadata;
- comparative and human adjudication;
- visible-witness evidence and residual gaps.

Mission 5 remains a draft. It must prepare and honestly label a non-empty prebuilt SDCPN and derivation fixture; none is implied by Mission 4.

## Planning and deployment disposition

- Mission 4 moved to `docs/mission-archive/`.
- No root `MISSION.md` remains and no successor implementation is authorized.
- `MISSION.next.md` and all four future drafts preserve the accepted M5–M9 spine.
- Content-free Flue OTel instrumentation remains in current application source.
- Mission 5 retains only latency/tool tracing needs; hosted OTLP, propagation, failure attributes, and remote telemetry remain Mission 8 release gates.
- No remote deployment or public release is claimed.

## Verification

Observed passing checks during close:

- core, SDCPN plugin, and application production builds;
- application and package TypeScript checks;
- application and package Oxlint checks with only pre-existing warnings;
- repository format check before immutable campaign output was retained, plus a final scoped format check over every changed source/manifest file;
- full application unit suite: 18 files, 86 tests;
- focused SDCPN skill and production routing tests after the URI repair;
- clean post-commit hermetic v3 campaign proof before paid execution;
- real browser witness through the tracked Petrinaut panel.

The repository's root Turborepo build could not invoke Petrinaut-core's workspace-local Vite binary because its executable link was absent. Direct execution of the installed pinned Vite 8.2.2 built Petrinaut-core and Petrinaut successfully; the website then built normally.

The final pre-commit formatter normalized outer whitespace in the previously untracked raw v3 campaign JSON before its first commit. The emitted and canonical committed hashes, unchanged parsed content, and resulting outer-byte-integrity limitation are recorded in the adjudication and Mission 5 handoff. All changed source and manifest files pass the formatter; untracked `.playwright-cli` browser scratch remains outside the commit.

## Pull-request record

No GitHub pull request exists for branch `ln/fe-xxxx-re-oracle-runbooks` at close time, so there was no PR description to update. This file is the retained close record; any later PR must link it and preserve the accepted limitations above.
