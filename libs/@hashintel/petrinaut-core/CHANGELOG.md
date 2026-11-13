# @hashintel/petrinaut-core

## 0.0.6

### Patch Changes

- Update the browser optimizer's Optuna runtime to version 5.x.x.

- Start the ELK layout engine the first time a layout is calculated, rather than when the package is imported, so the package can be imported where ELK can't start, such as in a Temporal workflow. ([#10186](https://github.com/hashintel/hash/pull/10186))

- Upgrade the language server to TypeScript 6. ([#9933](https://github.com/hashintel/hash/pull/9933))

- Type-check place visualizers in the language worker and lower them to a view HIR the editor interprets, so no code from a net runs as JavaScript. ([#10189](https://github.com/hashintel/hash/pull/10189))

## 0.0.5

### Patch Changes

- Scenarios can store an ad-hoc definition (`initialState.type: "adhoc"`) that compiles to a generated code-mode scenario and optimization bindings. An LSP session type-checks its value expressions, and bundled example scenarios are editable this way. ([#9284](https://github.com/hashintel/hash/pull/9284))

- Transition kernels, lambdas and differential equations can be written as a bare function body ending in `return`. The `export default` module form still works. ([#9370](https://github.com/hashintel/hash/pull/9370))

- Add in-browser optimization that runs Optuna in a Pyodide worker, downloaded from jsDelivr and PyPI unless `pyodide.indexURL` says otherwise. The `./optimization` entry adds `parseOptimizationManifest`, `isUnknownOptimizationRunError` and `PETRINAUT_OPTIMIZATION_UNKNOWN_RUN_ERROR_CODE`, and the main entry adds `createReadableStore`. ([#9515](https://github.com/hashintel/hash/pull/9515))

- Expose explicit browser and headless diagnostics for captured definitions, and start document observation only when subscribed. ([#9667](https://github.com/hashintel/hash/pull/9667))

- Add a command registry for host-rendered command palettes: `createCommandRegistry` and `combineCommandRegistries` in core, and `CommandRegistryProvider`, `useCommand`, `useCommands` and `formatShortcutKeys` in `@hashintel/petrinaut/react`. ([#9457](https://github.com/hashintel/hash/pull/9457))

- The layout module exports canvas geometry: `compactNodeDimensions`, `classicNodeDimensions`, `getComponentInstanceHeight`, `getBoundsOfCenteredBoxes`, `getMinZoomForBounds` and `ZOOM_PADDING`. Classic places are 104 × 104 and classic transitions 180 × 60. ([#9352](https://github.com/hashintel/hash/pull/9352))

- Register the `createExperiment` AI tool with its validated request schema. ([#9678](https://github.com/hashintel/hash/pull/9678))

- State constraint expressions accept a trailing semicolon and no explicit `return`, and a constraint with separate statements reports the missing `return`. ([#9725](https://github.com/hashintel/hash/pull/9725))

- Add the `@hashintel/petrinaut-core/experiments` entry point with an `ExperimentBackend` interface, a worker-pool backend and `selectExperimentBackend`. `ExperimentRequest` accepts per-run overrides in `runs`. ([#9178](https://github.com/hashintel/hash/pull/9178))

- `createJsonDocHandle` accepts `SDCPNInput`, a loose authoring form of `SDCPN` whose omitted extension fields the new `normalizeSDCPN` fills with defaults. Both are exported from the package root. ([#8926](https://github.com/hashintel/hash/pull/8926))

- File import defaults a place's `colorId`, `dynamicsEnabled` and `differentialEquationId`, and an arc's `weight`, instead of rejecting a file that omits them. ([#9715](https://github.com/hashintel/hash/pull/9715))

- Transitions with weighted coloured input arcs, or with lambdas that read no tokens, do far less work per frame. Trajectories are unchanged for every seed. ([#9386](https://github.com/hashintel/hash/pull/9386))

- Metric specs can sample every run that has not errored with `sampleRuns: "notErrored"`. ([#9685](https://github.com/hashintel/hash/pull/9685))

- Add constraint margin and state-indicator evaluators, an optional manifest `constraintPolicy`, and `aggregateTime` support in `getRunValues`. ([#9604](https://github.com/hashintel/hash/pull/9604))

- Export `PetrinautOptimizationDirection`, the objective's `maximize` | `minimize` union, from the package root and the `/optimization` entry. ([#9653](https://github.com/hashintel/hash/pull/9653))

- Experiments split their runs across Web Workers, one per logical core minus one, with identical results at any worker count. `experimentShardCount` on `ExperimentsProvider` and `shardCount` on `createMonteCarloExperiment` cap the parallelism. ([#9162](https://github.com/hashintel/hash/pull/9162))

- Removes `petrinautAiPrompt`; hosts compose their own system prompt from `petrinautAiCapabilityGuidance` or its parts, `petrinautAiCapabilitySections`. ([#9949](https://github.com/hashintel/hash/pull/9949))

- `selectionItemTypes` and `canonicalizeSelection` are available from the dependency-free `@hashintel/petrinaut-core/selection` entry, so hosts can validate selections from a URL or request. ([#9426](https://github.com/hashintel/hash/pull/9426))

- Export `petrinautDiagnosticsContextMessageId`, the id of the diagnostics message the assistant appends after client tool results. ([#9854](https://github.com/hashintel/hash/pull/9854))

- Adds `hashPetrinautDocument`, a structural hash of a net that ignores the order of object keys and can leave out layout and other non-semantic parts. ([#9935](https://github.com/hashintel/hash/pull/9935))

- Entity, net and subnet ids are UUIDs: documents with other ids get stable UUIDs when they load, older ids still resolve, and `petrinautIdSchema` validates and converts an id field. ([#9958](https://github.com/hashintel/hash/pull/9958))

- Places can declare a maximum token capacity, and a transition cannot fire if it would take an output place over capacity. ([#9177](https://github.com/hashintel/hash/pull/9177))

- An AI edit that leaves the document unchanged is reported as not applied. ([#9537](https://github.com/hashintel/hash/pull/9537))

- Net identifiers named after `Object.prototype` members, such as `__proto__`, are rejected at import and before simulation. Place visualizer code runs under the same sandbox as scenario code. ([#9222](https://github.com/hashintel/hash/pull/9222))

- Mark Space as the default starting place in the Probabilistic Satellite Launcher example. ([#9764](https://github.com/hashintel/hash/pull/9764))

- Scenario code runs in an interpreter instead of `new Function`, and is stricter: `==` is strict, conditions take booleans, unknown place names are errors, and only `.map`, `.reduce` and `.concat` array methods are available. ([#9332](https://github.com/hashintel/hash/pull/9332))

- SDCPN elements accept an optional `description`, and transitions, subnets, component instances and the net root accept an optional host-defined `metadata` record of JSON values. ([#9484](https://github.com/hashintel/hash/pull/9484))

- The AI assistant's documentation adds the ad-hoc scenarios, Preview, code editor and simulation panel guides, and describes snapshot validation and its diagnostics. ([#9723](https://github.com/hashintel/hash/pull/9723))

- Distribution frames carry the extent of their bins. ([#9478](https://github.com/hashintel/hash/pull/9478))

- Optimization trials run their seeded replicates in parallel, and the CLI's `--threads <n>` bounds the number of workers. ([#9358](https://github.com/hashintel/hash/pull/9358))

- Add validated experiment request and result schemas and a `runExperiment` host interface for up to 100,000 runs. ([#9676](https://github.com/hashintel/hash/pull/9676))

- Add the **Vaccination Campaign** example, an SIR model with vaccination and contact reduction built for optimization demos. ([#9516](https://github.com/hashintel/hash/pull/9516))

- Reject arc creation when the referenced transition does not exist instead of treating it as an unchanged mutation. ([#9722](https://github.com/hashintel/hash/pull/9722))

- Add a WebGPU backend for experiments that matches the CPU engine's semantics and falls back to the CPU for nets it cannot run. A Compilation panel shows the compiled conditions, kernels and equations. ([#9179](https://github.com/hashintel/hash/pull/9179))

- Nets and optimization manifests can be imported and exported in YAML and JSON. ([#9379](https://github.com/hashintel/hash/pull/9379))

## 0.0.4

### Patch Changes

- Fix stochastic transition firing statistics: fire with the memoryless per-frame probability `1 - e^(-rate * dt)`, advance the RNG state on every evaluation instead of discarding non-firing draws, and compute the seeded LCG with exact integer arithmetic. Firing counts now match Poisson expectations. Identical seeds produce different sequences than earlier releases. ([#9329](https://github.com/hashintel/hash/pull/9329))

## 0.0.3

### Patch Changes

- Replace the `optimize` host capability with `createOptimizationRun`, `attachOptimizationRun`, and `cancelOptimizationRun`, enabling resumable runs and automatic reconnection. ([#9066](https://github.com/hashintel/hash/pull/9066))

- Add `uuid` token attributes with automatic generation and `Uuid.generate()` / `Uuid.from()` helpers. ([#8953](https://github.com/hashintel/hash/pull/8953))

- Expose the per-type policy registry (`TYPE_POLICIES`) and related helpers. ([#8953](https://github.com/hashintel/hash/pull/8953))

- Add an optional `seq` sequence number to every optimization event so detached, reconnectable optimization runs can be resumed from a cursor. ([#9067](https://github.com/hashintel/hash/pull/9067))

- Add `range()` to scenario code, fix common array methods in scenario expressions, and show scenario compilation errors in Simulation Settings. ([#9092](https://github.com/hashintel/hash/pull/9092))

- Fix Predicate transitions so true guards fire on the first and every consecutive simulation frame. ([#9096](https://github.com/hashintel/hash/pull/9096))

- Prevent newly loaded nets from being marked as changed when optional fields are absent. ([#9199](https://github.com/hashintel/hash/pull/9199))

- Add the `string` token attribute type, stored via per-run interning. Editing a type's schema now migrates stored initial state (values convert, falling back to the new type's default). ([#8953](https://github.com/hashintel/hash/pull/8953))

- Add scenario-first optimization manifests with flat parameter search spaces, metric objectives, and hardened server-side scenario execution. ([#9040](https://github.com/hashintel/hash/pull/9040))

- Add `integer` and `boolean` token attribute types. ([#8764](https://github.com/hashintel/hash/pull/8764))

- Allow metrics to read resolved net parameters through `parameters.<variableName>`; scenario parameters remain unavailable. ([#9043](https://github.com/hashintel/hash/pull/9043))

- Add multi-seed optimization trials through `execution.seedsPerTrial`, including per-seed replicates, budget accounting, and the exported `deriveRunSeed` helper. ([#9224](https://github.com/hashintel/hash/pull/9224))

- Add Actual mode for read-only live execution, including host event streams, a timeline, an event log, and recording exports. ([#8829](https://github.com/hashintel/hash/pull/8829))

- Replace Babel with the HIR compiler for user code. Unsupported TypeScript now produces diagnostics instead of running. ([#8981](https://github.com/hashintel/hash/pull/8981))

- Define the optimization protocol's response shapes as Zod schemas (`petrinautOptimizationDescribeParameterSchema`, `petrinautOptimizationDescribeResultSchema`, `petrinautOptimizationReplicateSchema`, `petrinautOptimizationEvaluateResultSchema`). The existing `PetrinautOptimizationDescribe*`/`EvaluateResult` types are now derived from them and are unchanged.

- Allow hosts to disable SDCPN extensions and global parameters. ([#8763](https://github.com/hashintel/hash/pull/8763))

- Add subnet definitions, component instances, and wiring support to Petrinaut. ([#8662](https://github.com/hashintel/hash/pull/8662))

- Fix compilation of real transition-kernel attributes that conditionally return a number or a distribution. ([#9028](https://github.com/hashintel/hash/pull/9028))

- Support read input arcs across SDCPN parsing, simulation, AI arc creation, and typed code inputs. ([#8774](https://github.com/hashintel/hash/pull/8774))

- Add a "Pre-deployed Constellation" scenario to the Probabilistic Satellite Launcher example. ([#9092](https://github.com/hashintel/hash/pull/9092))

- Use a shared fixed seed (`PETRINAUT_DEFAULT_SEED`) for interactive simulation and optimization runs, so playing a simulation reproduces an optimization trial given the same configuration. ([#9073](https://github.com/hashintel/hash/pull/9073))

- Export the token value codec and `compileUserCode` from `@hashintel/petrinaut-core`. ([#8943](https://github.com/hashintel/hash/pull/8943))

- Use a packed token frame layout and simplify the `getPlaceTokens(place)` and `buildMetricState(frame, places)` APIs. ([#8944](https://github.com/hashintel/hash/pull/8944))

## 0.0.2

### Patch Changes

- Add Monte Carlo experiment metric specs, accumulators, runtime streaming, and worker support. ([#8751](https://github.com/hashintel/hash/pull/8751))

- improve and expand instance action schemas ([#8750](https://github.com/hashintel/hash/pull/8750))

## 0.0.1

### Patch Changes

- Extract the headless Petrinaut core into `@hashintel/petrinaut-core`, expose dedicated core worker entry points, and remove the `@hashintel/petrinaut/core` compatibility entry point. ([#8730](https://github.com/hashintel/hash/pull/8730))
