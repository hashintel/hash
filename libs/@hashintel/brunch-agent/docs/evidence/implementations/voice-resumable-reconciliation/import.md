# Mission 6b source import

## Provenance and scope

Lu authorized Mission 6b implementation and subsequent Mission 7 restack on 2026-09-07. No Linear writes or PR submission are authorized; the later replacement PR will reference FE-1580 without rewriting it. KA's original branch and PR #9531 remain untouched.

- Source contribution: `58f75840804766a84ce85b9daab5b5194f3875ec..be56a18ff0244c5750a8702e9c7f45c0b607dc06`, authored by Kostandin Angjellari and retained with attribution in the import commit.
- Destination: Mission 6 `01649899eb65ab8d7a8fec9407dc3ea613128264` over Mission 5 `7538264feeb1487aa494e991831bed0338ae76df`.
- Authority-only cut: `ecee802ce3`. Original preparation: Mission 7 commit `86e3755` and its reconciliation draft. The old `eecbe99e20..b53b1006fb` analysis range is not the import source.
- Import method: three-way application of the exact source contribution, excluding only its root `libs/@hashintel/brunch-agent/MISSION.md`. Source evidence remains immutable history; the replacement authority supersedes source prohibitions on integrating Mission 6 only within the accepted combined-path scope.

## Necessary join resolutions

- Retain Mission 6's configurable browser-tool catalogue and input mapper alongside KA's hidden non-interactive question marker in transport and history. Default remains the docs reader; fixture-specific tools and their canonical input normalization remain available. The source deleted an imported default-catalogue constant, so preserve a stable default set locally rather than losing fixture configurability.
- Retain the established Mission 6 `ai-sdk:user:` / `ai-sdk:client-tools:` delivery namespaces and sorted tool-call key identity, adding KA's bounded-key validation, typed rejected/conflict/ambiguous/aborted outcomes and canonical completed-transcript Voice identities. Update source test expectations to that retained namespace; do not invent a new prefix to bypass previous admission receipts.
- Combine snapshot input normalization with KA's persisted per-tool origin records and hidden marker projection. Preserve parent continuation folding. The later reconciliation must test origins contributed by folded continuation messages; mechanically joining the two maps alone is not proof.
- Keep all independent tests added at the same insertion points: fixture transport/refusal and input mapping/pending-tool step tests from the parent; admission failure and rich stream error tests from KA. The Voice route test uses the keyed completed-transcript identity and a real request AbortSignal, not the old provider function-call identity.
- Preserve the parent's composite composer busy status and Stop-withheld follow-up behavior; no new Voice scheduler is introduced by the import. The automatic browser-tool output path still requires its own combined lifecycle/failure discriminator.
- KA's host test mocked Brunch permanently configured; the repaired parent's unconfigured-fixture test consequently failed. Make the mock explicitly configurable for that test rather than undoing the parent's fallback behavior.
- Extend the reviewed architecture inventory for the core question-marker export and its hermetic logger/tool-run test. It invokes the tool with mocked writer/logger and no runtime, key, socket or model. This is the source feature crossing the newer parent inventory, not permission to loosen the inventory check.

## Import verification, not acceptance

The first checks caught retained-key test expectations, the conflicting configured-host mock and the new architecture inventory entries. These were corrected at the join. The complete seven-workspace command then passed **39/39 tasks** (23 cached) before focused reconciliation:

```sh
yarn exec turbo run build test:unit lint:tsc lint:eslint --filter @hashintel/brunch-agent --filter @hashintel/brunch-agent-binding-flue --filter @hashintel/brunch-agent-plugin-sdcpn --filter @hashintel/brunch-agent-transport-aisdk --filter @apps/brunch-agent --filter @hashintel/petrinaut --filter @apps/petrinaut-website --continue=always --output-logs errors-only
```

This establishes that the joined source builds and passes the existing package gates. It does not establish safe pending static-tool execution across Stop, deterministic reordered result payloads, combined Voice failure release, faithful stopped-entry reopen, a real microphone/browser witness or comparative audible latency. The active authority owns those remaining discriminators and owner-held gates. No paid provider call or human acceptance is claimed.
