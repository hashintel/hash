# @hashintel/petrinaut-core

## 0.0.3

### Patch Changes

- [#9066](https://github.com/hashintel/hash/pull/9066) [`30eaafa`](https://github.com/hashintel/hash/commit/30eaafa42e70bdffb5cdded1914c2894715ca9a4) Thanks [@kube](https://github.com/kube)! - Replace the `optimize` host capability with `createOptimizationRun`, `attachOptimizationRun`, and `cancelOptimizationRun`, enabling resumable runs and automatic reconnection.

- [#8953](https://github.com/hashintel/hash/pull/8953) [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b) Thanks [@kube](https://github.com/kube)! - Add `uuid` token attributes with automatic generation and `Uuid.generate()` / `Uuid.from()` helpers.

- [#8953](https://github.com/hashintel/hash/pull/8953) [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b) Thanks [@kube](https://github.com/kube)! - Expose the per-type policy registry (`TYPE_POLICIES`) and related helpers.

- [#9067](https://github.com/hashintel/hash/pull/9067) [`eee2547`](https://github.com/hashintel/hash/commit/eee25471609c0e5ac740320226ce6eb0c8647d31) Thanks [@kube](https://github.com/kube)! - Add an optional `seq` sequence number to every optimization event so detached, reconnectable optimization runs can be resumed from a cursor.

- [#9092](https://github.com/hashintel/hash/pull/9092) [`4877809`](https://github.com/hashintel/hash/commit/4877809941040793f13497b73239b558bfa7cb80) Thanks [@kube](https://github.com/kube)! - Add `range()` to scenario code, fix common array methods in scenario expressions, and show scenario compilation errors in Simulation Settings.

- [#9096](https://github.com/hashintel/hash/pull/9096) [`54cc7eb`](https://github.com/hashintel/hash/commit/54cc7ebe119c13b5229d249891ec0302be559bbd) Thanks [@kube](https://github.com/kube)! - Fix Predicate transitions so true guards fire on the first and every consecutive simulation frame.

- [#9199](https://github.com/hashintel/hash/pull/9199) [`3ed1e48`](https://github.com/hashintel/hash/commit/3ed1e485d61a0838fc1d4fba8c84810488914167) Thanks [@kube](https://github.com/kube)! - Prevent newly loaded nets from being marked as changed when optional fields are absent.

- [#8953](https://github.com/hashintel/hash/pull/8953) [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b) Thanks [@kube](https://github.com/kube)! - Add the `string` token attribute type, stored via per-run interning. Editing a type's schema now migrates stored initial state (values convert, falling back to the new type's default).

- [#9040](https://github.com/hashintel/hash/pull/9040) [`b00c6bd`](https://github.com/hashintel/hash/commit/b00c6bd83433556b6dbdf9381978ef1d5cece9ef) Thanks [@kube](https://github.com/kube)! - Add scenario-first optimization manifests with flat parameter search spaces, metric objectives, and hardened server-side scenario execution.

- [#8764](https://github.com/hashintel/hash/pull/8764) [`c6cfee0`](https://github.com/hashintel/hash/commit/c6cfee00362a82d18cb24f920d8f207d57a1e56d) Thanks [@kube](https://github.com/kube)! - Add `integer` and `boolean` token attribute types.

- [#9043](https://github.com/hashintel/hash/pull/9043) [`63a51e5`](https://github.com/hashintel/hash/commit/63a51e5df5b4550d4239e5d87354b236c03c2998) Thanks [@kube](https://github.com/kube)! - Allow metrics to read resolved net parameters through `parameters.<variableName>`; scenario parameters remain unavailable.

- [#9224](https://github.com/hashintel/hash/pull/9224) [`1046b5c`](https://github.com/hashintel/hash/commit/1046b5c881cd00cf205b4895348b022934d66b4a) Thanks [@kube](https://github.com/kube)! - Add multi-seed optimization trials through `execution.seedsPerTrial`, including per-seed replicates, budget accounting, and the exported `deriveRunSeed` helper.

- [#8829](https://github.com/hashintel/hash/pull/8829) [`4820e48`](https://github.com/hashintel/hash/commit/4820e48b10e9b01ee1f43e871533cc5c66c9d7df) Thanks [@kube](https://github.com/kube)! - Add Actual mode for read-only live execution, including host event streams, a timeline, an event log, and recording exports.

- [#8981](https://github.com/hashintel/hash/pull/8981) [`03f6a30`](https://github.com/hashintel/hash/commit/03f6a301b2ff4e6b1fbdd211a7baf04830ba78fb) Thanks [@kube](https://github.com/kube)! - Replace Babel with the HIR compiler for user code. Unsupported TypeScript now produces diagnostics instead of running.

- [`1b6c095`](https://github.com/hashintel/hash/commit/1b6c095d1cdef0995d77e37cff87a01b2f104cb3) Thanks [@kube](https://github.com/kube)! - Define the optimization protocol's response shapes as Zod schemas (`petrinautOptimizationDescribeParameterSchema`, `petrinautOptimizationDescribeResultSchema`, `petrinautOptimizationReplicateSchema`, `petrinautOptimizationEvaluateResultSchema`). The existing `PetrinautOptimizationDescribe*`/`EvaluateResult` types are now derived from them and are unchanged.

- [#8763](https://github.com/hashintel/hash/pull/8763) [`faddfad`](https://github.com/hashintel/hash/commit/faddfad49bd8148dcfb94e55205b0ee65415b8aa) Thanks [@kube](https://github.com/kube)! - Allow hosts to disable SDCPN extensions and global parameters.

- [#8662](https://github.com/hashintel/hash/pull/8662) [`62f4e31`](https://github.com/hashintel/hash/commit/62f4e31a6bd9b30a4fe0c05f637415b1fea1a4af) Thanks [@kube](https://github.com/kube)! - Add subnet definitions, component instances, and wiring support to Petrinaut.

- [#9028](https://github.com/hashintel/hash/pull/9028) [`741e772`](https://github.com/hashintel/hash/commit/741e772a8a48853761f6c1cd17936a07ac1a190b) Thanks [@ShiroKSH](https://github.com/ShiroKSH)! - Fix compilation of real transition-kernel attributes that conditionally return a number or a distribution.

- [#8774](https://github.com/hashintel/hash/pull/8774) [`f2d9df1`](https://github.com/hashintel/hash/commit/f2d9df18efa55728f78e4e7c86da14c452055c49) Thanks [@kube](https://github.com/kube)! - Support read input arcs across SDCPN parsing, simulation, AI arc creation, and typed code inputs.

- [#9092](https://github.com/hashintel/hash/pull/9092) [`4877809`](https://github.com/hashintel/hash/commit/4877809941040793f13497b73239b558bfa7cb80) Thanks [@kube](https://github.com/kube)! - Add a "Pre-deployed Constellation" scenario to the Probabilistic Satellite Launcher example.

- [#9073](https://github.com/hashintel/hash/pull/9073) [`9c043ef`](https://github.com/hashintel/hash/commit/9c043ef4d471dcbe59bf1062c956a2bb24c6df0f) Thanks [@kube](https://github.com/kube)! - Use a shared fixed seed (`PETRINAUT_DEFAULT_SEED`) for interactive simulation and optimization runs, so playing a simulation reproduces an optimization trial given the same configuration.

- [#8943](https://github.com/hashintel/hash/pull/8943) [`2989ccd`](https://github.com/hashintel/hash/commit/2989ccdcedda33206f537bf2cf4a3470edc537b0) Thanks [@kube](https://github.com/kube)! - Export the token value codec and `compileUserCode` from `@hashintel/petrinaut-core`.

- [#8944](https://github.com/hashintel/hash/pull/8944) [`2c1c089`](https://github.com/hashintel/hash/commit/2c1c089fea20c6788942bc59a2ac6d8382bf7559) Thanks [@kube](https://github.com/kube)! - Use a packed token frame layout and simplify the `getPlaceTokens(place)` and `buildMetricState(frame, places)` APIs.

## 0.0.2

### Patch Changes

- [#8751](https://github.com/hashintel/hash/pull/8751) [`3b5ff88`](https://github.com/hashintel/hash/commit/3b5ff88eb9d2983d7c63492f3911d70eaa28d331) Thanks [@kube](https://github.com/kube)! - Add Monte Carlo experiment metric specs, accumulators, runtime streaming, and worker support.

- [#8750](https://github.com/hashintel/hash/pull/8750) [`f9d6417`](https://github.com/hashintel/hash/commit/f9d64178b4a20c04efb0ad85fcf8dbfcff20327a) Thanks [@CiaranMn](https://github.com/CiaranMn)! - improve and expand instance action schemas

## 0.0.1

### Patch Changes

- [#8730](https://github.com/hashintel/hash/pull/8730) [`ed40011`](https://github.com/hashintel/hash/commit/ed40011ba896b77db0dae30c219e1f2066382c28) Thanks [@kube](https://github.com/kube)! - Extract the headless Petrinaut core into `@hashintel/petrinaut-core`, expose dedicated core worker entry points, and remove the `@hashintel/petrinaut/core` compatibility entry point.
