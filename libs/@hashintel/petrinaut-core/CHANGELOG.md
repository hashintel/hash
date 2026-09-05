# @hashintel/petrinaut-core

## 0.0.5

### Patch Changes

- Behind the new experimental "Ad-hoc scenarios" setting, the scenario creation form authors scenarios through the ad-hoc form: exposed Variables become the saved scenario's tunable parameters, and the definition persists as `initialState.type: "adhoc"`. ([@kube](https://github.com/kube), [#9368](https://github.com/hashintel/hash/pull/9368))

- Add the ad-hoc scenarios user-guide page and register it with the in-app AI assistant's doc reader. ([@kube](https://github.com/kube), [#9290](https://github.com/hashintel/hash/pull/9290))

- Ad-hoc scenario synthesis: form state, deterministic `adhoc.*` parameter names, synthesis to a generated code-mode scenario plus optimized fields with typed domains, the transform to optimization-manifest bindings, row-kind cycling and shared-column transitions, place totals, and an LSP session kind that type-checks every value expression. ([@kube](https://github.com/kube), [#9284](https://github.com/hashintel/hash/pull/9284))

- Transition kernels, lambdas, and differential equations can now be written as a bare function body ending in `return`, like metrics and scenario code: `input` (or `tokens` for dynamics) and `parameters` are in scope ambiently, with full editor type checking and completions. The `export default TransitionKernel(...)` / `Lambda(...)` / `Dynamics(...)` module form is still accepted, and the editor picks the right checking mode per form. Default templates, built-in examples, and the AI assistant now use the bare form. Visualizers are unchanged. ([@kube](https://github.com/kube), [#9370](https://github.com/hashintel/hash/pull/9370))

- Added a command registry for host-rendered command palettes: `createCommandRegistry()` and `combineCommandRegistries()` in core, and `CommandRegistryProvider`, `useCommand(command, { when })`, `useCommands()`, and `formatShortcutKeys()` in `@hashintel/petrinaut/react`. The editor registers its undo/redo, tool, auto-layout, search, and panel commands. Petrinaut ships no palette. ([@kube](https://github.com/kube), [#9457](https://github.com/hashintel/hash/pull/9457))

- The layout module exports the canvas geometry: render node dimensions (`compactNodeDimensions`, `classicNodeDimensions`, `getComponentInstanceHeight`), net bounds (`getBoundsOfCenteredBoxes`) and zoom limits (`getMinZoomForBounds`, `ZOOM_PADDING`). `layoutNodeDimensions` is now derived from the render dimensions instead of maintained by hand. ([@kube](https://github.com/kube), [#9352](https://github.com/hashintel/hash/pull/9352))

- Add the `@hashintel/petrinaut-core/experiments` entry point: an `ExperimentBackend` interface, a worker-pool implementation of it, and `selectExperimentBackend`, which walks backends in preference order and records every refusal. ([@kube](https://github.com/kube), [#9178](https://github.com/hashintel/hash/pull/9178))

- `createJsonDocHandle` accepts `SDCPNInput`, a loose authoring variant of `SDCPN`: extension fields may be omitted and are filled with plain-net defaults by the new `normalizeSDCPN` export. `SDCPNInput` and its member types are exported from the package root. ([@kube](https://github.com/kube), [#8926](https://github.com/hashintel/hash/pull/8926))

- The WebGPU backend matches the CPU engine's stochastic semantics and frame numbering, streams metric frames per dispatch chunk, and runs range sweeps from a per-run parameter buffer. It sizes and calibrates metric histograms and typed-place buffers from the model and device instead of refusing or warning, and tiles experiments larger than the device's limits with bit-identical results. Sweep batch instantiation no longer blocks the main thread: scenario compilation is prepared once per experiment and per-run values travel as one typed-array plan. ([@kube](https://github.com/kube), [#9454](https://github.com/hashintel/hash/pull/9454))

- Weighted-arc token combinations enumerate lazily in the same lexicographic order, so a transition with a weight-2 coloured input arc no longer materialises every combination per frame. Trajectories are unchanged for every seed. ([@kube](https://github.com/kube), [#9386](https://github.com/hashintel/hash/pull/9386))

- Run an experiment's runs in parallel across several Web Workers. ([@kube](https://github.com/kube), [#9162](https://github.com/hashintel/hash/pull/9162))

  An experiment used to run every one of its runs in a single worker, using one core however many the machine had. Runs are independent, so they now split across one worker per logical core (minus one, so the editor stays responsive), capped at the run count. Measured at ~4x on 8 shards on a 10-core machine.

  Sharding cannot change what an experiment reports. Per-run seeds derive from the run's **global** index rather than its position within a shard, so run _i_ gets the same seed whichever worker owns it, and each worker's per-frame statistics recombine through the metric accumulator monoids (`empty`/`merge`). Output is byte-identical at every shard count while every shard still has an active run. A frame is only finalised once every still-running shard has reported it, with finished shards dropped from that watermark rather than blocking it — so once a whole shard's runs have ended early (for example by deadlock), that shard's completed runs stop contributing samples to later frames, where a single simulator would keep sampling their frozen state.

  Scalar metric frames now carry their pre-reduction accumulator state, because `frameValue` is already reduced and a mean of means is not a mean.

  Hosts can cap or pin parallelism with `experimentShardCount` on `ExperimentsProvider`, or `shardCount` on `createMonteCarloExperiment`.

- Register the `preview` user-guide page, so the in-app assistant can read the
  embedded Preview's documentation. ([@kube](https://github.com/kube), [#9545](https://github.com/hashintel/hash/pull/9545))

- Expose the selection vocabulary as data: `selectionItemTypes` and
  `canonicalizeSelection` are available from a dependency-free
  `@hashintel/petrinaut-core/selection` entry, so hosts can validate and order
  selection coming from a URL or an HTTP request without pulling the model or any
  React code. ([@kube](https://github.com/kube), [#9426](https://github.com/hashintel/hash/pull/9426))

- Add an optional per-place token capacity. ([@kube](https://github.com/kube), [#9177](https://github.com/hashintel/hash/pull/9177))

  A place can now declare a maximum number of tokens it will hold, set from the place properties panel. Useful for supply-chain style models with finite storage. It also converts frames from growable to fixed-size, which is the precondition for a fixed-layout GPU or WASM path.

  Capacity participates in transition enablement, following the standard Petri-net capacity constraint: a transition cannot fire if doing so would take any output place above its capacity. Output tokens are applied at the end of a frame, so the check accounts for what transitions earlier in the same frame have already committed. Several transitions feeding one capped place cannot collectively overflow it.

  Deadlock detection includes the same check, so a net whose only remaining transitions are blocked by full output places is reported as deadlocked rather than stepping to `maxTime` with nothing happening.

  Nets without capacities are unaffected: the constraint tables are empty and the hot path skips them.

- Reject net identifiers that collide with `Object.prototype` member names (`__proto__`, `constructor`, ...) at file import and before simulation, and store user-authored keys in prototype-free records. Place visualizer code now runs under the same sandbox hardening as scenario code. ([@kube](https://github.com/kube), [#9222](https://github.com/hashintel/hash/pull/9222))

- Scenario code (parameter overrides, per-place expressions, code-mode initial state) now compiles through the HIR and runs in an interpreter: no `new Function`, no sandbox. Out-of-subset code fails with positioned errors in the editor and at compile. Stricter than the old evaluator: `==` is strict, conditions and `&&`/`||` take booleans, unknown place names in code mode are errors, and array methods beyond `.map`/`.reduce`/`.concat` are unavailable. `Array.from({ length: n }, fn)` desugars to `range(n).map(fn)`. ([@kube](https://github.com/kube), [#9332](https://github.com/hashintel/hash/pull/9332))

- SDCPN elements carry an optional `description` (places, transitions, types, subnets, component instances, and the net root) and an optional `metadata` record of JSON values (transitions, subnets, component instances, and the net root). `metadata` is host-defined and opaque to the library. Both fields validate against the entity schemas, survive file import/export, and are preserved when an `SDCPNInput` is normalized. Files written without the fields still validate. ([@CiaranMn](https://github.com/CiaranMn), [#9484](https://github.com/hashintel/hash/pull/9484))

- A sweep's range selection runs as one stochastic simulation over the ranges: every run draws its own value per ranged parameter, and the metric distribution over the region streams live. `ExperimentRequest` carries optional per-run overrides (`runs`), forwarded by the worker-pool backend and refused by the WebGPU backend. ([@kube](https://github.com/kube), [#9419](https://github.com/hashintel/hash/pull/9419))

- Sweep compute is reused and pipelined: simulation workers persist across batches, surface cells sample in batched chunks in quad-tree order across the CPU pool, the navigator's selection streams first while the ladder pipelines its rungs, and one GPU backend (device, shader, calibration) with a small preview tile serves a session's batches. The surface reads a cell's value from the last sampled frame, so terminating nets fill it; charts mount their axes when the drawer opens and apply data once per animation frame. ([@kube](https://github.com/kube), [#9474](https://github.com/hashintel/hash/pull/9474))

- The frame inspector draws a frame's distribution as a canvas histogram with value and count axes. Distribution frames carry their bins' extent and heatmaps paint each bin across the rows it covers, so mixed strides no longer stripe, and streamed updates ease in instead of snapping. The sweep surface navigates by drag as well as click and marks the navigator's position, and the summary lists every batch computing in parallel. Parameter sweeps and the optimization surface are experimental settings, off by default. ([@kube](https://github.com/kube), [#9478](https://github.com/hashintel/hash/pull/9478))

- Transitions whose lambda reads no input tokens skip combination enumeration and evaluate the lambda once against the first tokens in place order. Trajectories are unchanged for every seed. ([@kube](https://github.com/kube), [#9389](https://github.com/hashintel/hash/pull/9389))

- Optimization trials run their seeded replicates in parallel as one sharded experiment. The Monte Carlo worker protocol attaches to any thread runtime, and the CLI's `--threads <n>` bounds the workers, defaulting to one per core minus one. ([@kube](https://github.com/kube), [#9358](https://github.com/hashintel/hash/pull/9358))

- Add an experimental WebGPU compute backend for experiments, chosen per experiment behind a user setting. It runs the net's lowered HIR on the device, declines nets it cannot run so they fall back to the CPU, and agrees with the CPU in distribution rather than seed for seed. A Compilation panel, also behind a setting, shows what the compiler made of each condition, kernel and equation. ([@kube](https://github.com/kube), [#9179](https://github.com/hashintel/hash/pull/9179))

- Nets and optimization manifests can be imported and exported in YAML and JSON. ([@kube](https://github.com/kube), [#9379](https://github.com/hashintel/hash/pull/9379))

## 0.0.4

### Patch Changes

- Fix stochastic transition firing statistics: fire with the memoryless per-frame probability `1 - e^(-rate * dt)`, advance the RNG state on every evaluation instead of discarding non-firing draws, and compute the seeded LCG with exact integer arithmetic. Firing counts now match Poisson expectations. Identical seeds produce different sequences than earlier releases. ([@kube](https://github.com/kube), [#9329](https://github.com/hashintel/hash/pull/9329))

## 0.0.3

### Patch Changes

- Replace the `optimize` host capability with `createOptimizationRun`, `attachOptimizationRun`, and `cancelOptimizationRun`, enabling resumable runs and automatic reconnection. ([@kube](https://github.com/kube), [#9066](https://github.com/hashintel/hash/pull/9066))

- Add `uuid` token attributes with automatic generation and `Uuid.generate()` / `Uuid.from()` helpers. ([@kube](https://github.com/kube), [#8953](https://github.com/hashintel/hash/pull/8953))

- Expose the per-type policy registry (`TYPE_POLICIES`) and related helpers. ([@kube](https://github.com/kube), [#8953](https://github.com/hashintel/hash/pull/8953))

- Add an optional `seq` sequence number to every optimization event so detached, reconnectable optimization runs can be resumed from a cursor. ([@kube](https://github.com/kube), [#9067](https://github.com/hashintel/hash/pull/9067))

- Add `range()` to scenario code, fix common array methods in scenario expressions, and show scenario compilation errors in Simulation Settings. ([@kube](https://github.com/kube), [#9092](https://github.com/hashintel/hash/pull/9092))

- Fix Predicate transitions so true guards fire on the first and every consecutive simulation frame. ([@kube](https://github.com/kube), [#9096](https://github.com/hashintel/hash/pull/9096))

- Prevent newly loaded nets from being marked as changed when optional fields are absent. ([@kube](https://github.com/kube), [#9199](https://github.com/hashintel/hash/pull/9199))

- Add the `string` token attribute type, stored via per-run interning. Editing a type's schema now migrates stored initial state (values convert, falling back to the new type's default). ([@kube](https://github.com/kube), [#8953](https://github.com/hashintel/hash/pull/8953))

- Add scenario-first optimization manifests with flat parameter search spaces, metric objectives, and hardened server-side scenario execution. ([@kube](https://github.com/kube), [#9040](https://github.com/hashintel/hash/pull/9040))

- Add `integer` and `boolean` token attribute types. ([@kube](https://github.com/kube), [#8764](https://github.com/hashintel/hash/pull/8764))

- Allow metrics to read resolved net parameters through `parameters.<variableName>`; scenario parameters remain unavailable. ([@kube](https://github.com/kube), [#9043](https://github.com/hashintel/hash/pull/9043))

- Add multi-seed optimization trials through `execution.seedsPerTrial`, including per-seed replicates, budget accounting, and the exported `deriveRunSeed` helper. ([@kube](https://github.com/kube), [#9224](https://github.com/hashintel/hash/pull/9224))

- Add Actual mode for read-only live execution, including host event streams, a timeline, an event log, and recording exports. ([@kube](https://github.com/kube), [#8829](https://github.com/hashintel/hash/pull/8829))

- Replace Babel with the HIR compiler for user code. Unsupported TypeScript now produces diagnostics instead of running. ([@kube](https://github.com/kube), [#8981](https://github.com/hashintel/hash/pull/8981))

- Define the optimization protocol's response shapes as Zod schemas (`petrinautOptimizationDescribeParameterSchema`, `petrinautOptimizationDescribeResultSchema`, `petrinautOptimizationReplicateSchema`, `petrinautOptimizationEvaluateResultSchema`). The existing `PetrinautOptimizationDescribe*`/`EvaluateResult` types are now derived from them and are unchanged. ([@kube](https://github.com/kube))

- Allow hosts to disable SDCPN extensions and global parameters. ([@kube](https://github.com/kube), [#8763](https://github.com/hashintel/hash/pull/8763))

- Add subnet definitions, component instances, and wiring support to Petrinaut. ([@kube](https://github.com/kube), [#8662](https://github.com/hashintel/hash/pull/8662))

- Fix compilation of real transition-kernel attributes that conditionally return a number or a distribution. ([@ShiroKSH](https://github.com/ShiroKSH), [#9028](https://github.com/hashintel/hash/pull/9028))

- Support read input arcs across SDCPN parsing, simulation, AI arc creation, and typed code inputs. ([@kube](https://github.com/kube), [#8774](https://github.com/hashintel/hash/pull/8774))

- Add a "Pre-deployed Constellation" scenario to the Probabilistic Satellite Launcher example. ([@kube](https://github.com/kube), [#9092](https://github.com/hashintel/hash/pull/9092))

- Use a shared fixed seed (`PETRINAUT_DEFAULT_SEED`) for interactive simulation and optimization runs, so playing a simulation reproduces an optimization trial given the same configuration. ([@kube](https://github.com/kube), [#9073](https://github.com/hashintel/hash/pull/9073))

- Export the token value codec and `compileUserCode` from `@hashintel/petrinaut-core`. ([@kube](https://github.com/kube), [#8943](https://github.com/hashintel/hash/pull/8943))

- Use a packed token frame layout and simplify the `getPlaceTokens(place)` and `buildMetricState(frame, places)` APIs. ([@kube](https://github.com/kube), [#8944](https://github.com/hashintel/hash/pull/8944))

## 0.0.2

### Patch Changes

- Add Monte Carlo experiment metric specs, accumulators, runtime streaming, and worker support. ([@kube](https://github.com/kube), [#8751](https://github.com/hashintel/hash/pull/8751))

- improve and expand instance action schemas ([@CiaranMn](https://github.com/CiaranMn), [#8750](https://github.com/hashintel/hash/pull/8750))

## 0.0.1

### Patch Changes

- Extract the headless Petrinaut core into `@hashintel/petrinaut-core`, expose dedicated core worker entry points, and remove the `@hashintel/petrinaut/core` compatibility entry point. ([@kube](https://github.com/kube), [#8730](https://github.com/hashintel/hash/pull/8730))
