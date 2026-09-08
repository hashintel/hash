# Native schema local delivery — package installation

Delivery starts from `113c8ada6f9a74d097bfbeb1b944db8c39223759` on `ln/fe-1573-local-native-schema`. This packet is new evidence, not a replacement for the pinned copied-package experiment.

## Pinned repair

The first installation milestone (`6eae999b8f`) ports the complete reviewed `native-schema-20260908T150034Z/candidate.patch` byte-for-byte to package-relative files. The final Flue patch additionally wraps preparation in an `async` callback before the existing abort helper: the full product suite exposed synchronous built-in preparation failing with `pending.then is not a function`. See `handoff.md`; the original candidate evidence is unchanged. Targets are `@flue/runtime@2.0.3`, `@earendil-works/pi-ai@0.83.0`, and `@earendil-works/pi-agent-core@0.83.0`. Source is the already cached published distributions; no upstream source was acquired. The historical `pi-source-candidate.patch` remains a source-map review companion, not a source build. Published source maps are not regenerated; debugging mapped upstream source does not describe the repaired JavaScript at changed lines.

Yarn's `patch` extracted each exact npm version; the reviewed unified diff was applied only to those extracted copies, and `patch-commit -s` generated the maintained patches. Root `resolutions` centralizes the patch descriptors for the existing exact/range consumers. Workspace dependency declarations and unrelated resolutions remain unchanged. `.yarnrc.yml` explicitly adds `@standard-schema/spec@1.1.0` through `packageExtensions`: the patched manifest alone is not resolution wiring. `yarn why @standard-schema/spec` confirms the patched Flue locator depends on exact `npm:1.1.0`.

## Offline installation and type resolution

From repository root, with the existing package cache and Yarn 4.16.0 available. Final verification uses the process-tree guard documented in `network-incident.md`; environment flags alone do not constrain transitive downloaders. Prefix the following commands with `sandbox-exec -f "$E/deny-network.sb" env`, where `E` is this evidence directory:

```sh
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 yarn install --immutable
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build --filter=@hashintel/petrinaut-core --filter=@hashintel/brunch-agent --concurrency=1
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn exec tsgo --project libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-schema-20260908T150034Z/tsconfig.json
```

All pass against the actual installed patches. The unchanged historical type fixture is only compiled here (not executed or repinned); it checks native parsed-output/default/transform inference, inline normalizers, Pi parsed-argument generics and unchanged Valibot output errors. The first typecheck correctly failed before the local Petrinaut/core build artifacts existed; after building those real workspace exports it passed. Baseline and patched installs used the local cache with networking and lifecycle scripts disabled. Existing peer warnings remain; no missing artifact required a download.

## Historical replay

Do not regenerate original pins or run the original evidence-writing reproducer in this new installation. To replay its baseline/Flue-only/two-boundary/complete controls, use the historical worker commit `dd79496585b0af71b5fa1a19de931f561fb137a9` and the pinned dependency/build prerequisites described in its `native-schema-boundary.md`; copy its evidence to a fresh output location as the integration review did. Safety gates remain 1/1/1/0 for those original instruments. The joined-browser historical packet remains evidence for its original converter build. New native product/browser evidence belongs beside this file.

This document records the first installation/type milestone. `handoff.md` records the subsequent product join and final evidence. No real-provider acceptance, upstream source build, paid readiness or Mission acceptance is claimed. Package installation itself used only cache; the later unguarded transitive build download is retained in `network-incident.md`, so the campaign does not claim zero external requests. Application/provider paid calls remain zero.
