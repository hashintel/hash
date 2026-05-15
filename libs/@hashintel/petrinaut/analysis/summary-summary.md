# Summary Of Simulation Architecture Summaries

This combines:

- [summary.md](summary.md)
- [summary-claude.md](summary-claude.md)

## Executive Summary

- Both summaries agree: the PR moves Petrinaut toward the right architecture, but the implementation has not yet defended the new boundaries.
- The highest-priority correctness issues are the worker `ready` handshake, non-monotonic ack handling, and the `compile-scenario` degraded fallback highlighted by Cursor.
- The highest-impact performance issue is deterministic simulation retaining and copying full frame history despite the new binary frame format.
- The most important structural issue is duplicated transition semantics between deterministic and Monte Carlo execution.
- The most valuable long-term target is: one compiled simulation plan, one shared transition kernel, explicit worker lifecycle identity, and multiple frame-storage policies.
- The PR-level AI comments add useful but mostly separate work: prototype-pollution-shaped object writes, duplicate store helpers, a likely false-positive worker origin warning, and the real `compile-scenario` test/production correctness bug.
- Some claims should be treated carefully: Monte Carlo does not currently post internal `ArrayBuffer` frame payloads, `ExperimentsProvider` is effectively remounted through its keyed parent, and public zero-copy token access needs an immutability/API decision rather than a blind `slice()` removal.

## Unified Pre-Merge Punchlist

1. Fix deterministic worker initialization: remove or rename the load-time `ready`; resolve `createSimulation()` only after post-`init` readiness.
2. Make ack handling monotonic: `lastAckedFrame = Math.max(lastAckedFrame, message.frameNumber)`.
3. Expose payload `time` through `SimulationFrameReader` or frame metadata and stop reconstructing time as `frame.number * dt` in UI code.
4. Fix `compile-scenario` degraded token fallback: do not silently emit numeric keys for colored tokens when element metadata is missing; update the test that currently asserts the degraded shape.
5. Add run identity to worker messages, at least where stale messages after reset/net switch could mutate current state.

## Main Validated Findings

### Correctness

- `simulation.worker.ts` posts `ready` twice with two meanings: worker script loaded and simulation initialized. This is ambiguous and can expose a handle too early.
- `lastAckedFrame` can regress if a late lower ack arrives. This can re-block or distort worker backpressure.
- `useStreamingData()` creates mutable store/listener state during render. In this codebase this is intentionally left to React Compiler caching; revisit only if streaming resets appear under real compiler output.
- `timeSinceLastFiringMs` is documented as milliseconds but incremented by `dt`, which is documented in seconds. The per-transition timeline divides it by `1000`, compounding the mismatch.
- `compile-scenario` can silently produce numeric-keyed colored token records if place/type metadata is absent; a test currently normalizes that degraded output as expected.
- `sampleDistribution()` intentionally mutates distributions for `.map()` coherence, but its cache lifetime can leak samples across firings if a distribution object is reused.

### Performance

- Deterministic simulation stores full frame history in the worker and again in the main-thread frame store.
- `computeNextFrame` appends with `[...simulation.frames, finalFrame]`, creating O(N²) array-copy behavior over long runs.
- The binary frame format is undermined by hot-path `materializeEngineFrame()` calls that slice token values back into JS-owned snapshots.
- Deterministic worker frame payloads are posted without transfer lists, so `ArrayBuffer` frames are structured-cloned.
- Backpressure currently polls with `setTimeout(10)`; an ack-resolved promise would be cleaner and more responsive.
- Monte Carlo distribution frames are copied in runtime state and mirrored into React experiment records, which will not scale for large experiments.

### Architecture

- The high-level split is sound: `api`, `authoring`, `engine`, `frames`, `worker`, `runtime`, and `monte-carlo`.
- The key missing piece is a shared compiled simulation plan plus shared transition/effect logic.
- Deterministic and Monte Carlo paths duplicate enablement, lambda evaluation, token selection, removals/additions, and transition timer updates.
- Monte Carlo already has the better frame-storage discipline with mutable reusable frame buffers; deterministic simulation should adopt the same storage principles without necessarily adopting the same orchestration.
- Frame retention should be owned by a pluggable `SimulationFrameStore`, not by the deterministic worker engine state.

### Protocol And API

- Worker messages need lifecycle identity (`runId`) and probably `protocolVersion` once external worker factories are supported.
- The public frame reader should expose frame `time`.
- A zero-copy token-values path would help charts, but the public API should not accidentally expose mutable internal state without a deliberate contract.
- Host transport should handle `error` and `messageerror` events.

### React And UI

- High-volume frame/distribution streams should live in external stores. React state should hold metadata, selected IDs, progress summaries, and revision counters.
- `SimulationContext` is large; splitting state and actions is sensible after correctness/performance work.
- Direct `ui/` imports from `core/simulation/authoring` are boundary leaks; route those capabilities through `react/` hooks or public core APIs.
- The concern that `ExperimentsProvider` survives net switches is likely overstated because it is under `SimulationProvider key={instance.handle.id}`, which remounts its subtree.

### PR-Level AI Review Findings

- CodeQL object-write findings are real latent hardening issues: user-controlled IDs are used as keys on plain objects in simulation build/run-state paths. Prefer `Map` or `Object.create(null)`.
- CodeQL's missing-origin-check finding for a dedicated worker appears to be a false positive; suppress or document it.
- Cursor's CLI progress naming finding is moot if the CLI-removal commit is present.
- Cursor's duplicate store-helper finding is real. `createReadableStore` and `createEventStream` should be shared.
- Cursor's `compile-scenario` fallback finding is the only PR-level AI comment that should join the pre-merge correctness list.

## Recommended Roadmap

### Phase 0: Pre-Merge Correctness

- Fix worker `ready` semantics.
- Clamp ack monotonicity.
- Expose frame time.
- Fix `compile-scenario` numeric-key fallback and its test.

### Phase 1: Protocol Cleanup

- Add `runId` to deterministic and Monte Carlo worker protocols.
- Add `protocolVersion` to init/ready messages.
- Add host `error` and `messageerror` handling.
- Replace polling backpressure with ack-resolved waits.

### Phase 2: Deterministic Performance

- Make worker simulation state current-frame-only.
- Move retention behind `SimulationFrameStore`.
- Transfer deterministic `ArrayBuffer` payloads where ownership permits.
- Replace hot-path materialization with typed-array views/mutators.
- Remove `[...simulation.frames, finalFrame]`.

### Phase 3: Shared Simulation Core

- Extract `CompiledSimulationPlan` for immutable place/transition/arc/user-code metadata.
- Extract shared transition effect evaluation and typed-array frame operations.
- Keep deterministic and Monte Carlo differences in storage/orchestration adapters.

### Phase 4: UI Streaming

- Move Monte Carlo distributions out of React state.
- Use external stores for large chart series.
- Key resets by semantic series IDs, not object identity.
- Add benchmarks for long deterministic runs, high-cardinality colored places, 1k+ Monte Carlo runs, and 100k+ timeline frames.

### Phase 5: Hardening And Quality

- Replace the JS-number LCG with an integer-safe RNG.
- Fix transition elapsed-time naming/units. The current public field remains
  `timeSinceLastFiringMs`; a later API cleanup should either rename it to match
  the engine's `dt` units or convert stored values to real milliseconds.
- Replace distribution object mutation with a per-firing sample cache.
- Reduce `@babel/standalone` worker bundle cost.
- Expose per-run Monte Carlo errors.
- Replace prototype-pollution-shaped plain-object tables with `Map`.
- Extract shared readable-store/event-stream helpers.

## Final Assessment

The two summaries are consistent where it matters. `summary.md` is more cautious about overstated claims, while `summary-claude.md` adds useful PR-level AI-review findings and a sharper pre-merge checklist. The combined conclusion is:

The architecture should stay. The next work is to make the implementation live up to it by fixing lifecycle correctness, moving deterministic frame retention to a single owner, using binary buffers without repeatedly materializing them, and sharing transition semantics across deterministic and Monte Carlo simulation.
