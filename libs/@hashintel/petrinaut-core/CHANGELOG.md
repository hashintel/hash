# @hashintel/petrinaut-core

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
