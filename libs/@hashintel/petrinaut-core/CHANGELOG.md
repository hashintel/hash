# @hashintel/petrinaut-core

## 0.1.0

### Minor Changes

- [#8829](https://github.com/hashintel/hash/pull/8829) [`4820e48`](https://github.com/hashintel/hash/commit/4820e48b10e9b01ee1f43e871533cc5c66c9d7df) Thanks [@kube](https://github.com/kube)! - Add Actual mode: a read-only live-execution view fed by a host-provided event stream, with an Actual timeline and Events tab, recording export helpers, and a redesigned timeline series selector.

### Patch Changes

- [#8953](https://github.com/hashintel/hash/pull/8953) [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b) Thanks [@kube](https://github.com/kube)! - Add the `uuid` token attribute type: 128-bit identifiers, `bigint` at runtime, canonical strings at rest. Kernels may omit uuid fields to auto-generate them, or use `Uuid.generate()` / `Uuid.from(value)`.

- [#8953](https://github.com/hashintel/hash/pull/8953) [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b) Thanks [@kube](https://github.com/kube)! - Expose the per-type policy registry (`TYPE_POLICIES`) and related helpers.

- [#8953](https://github.com/hashintel/hash/pull/8953) [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b) Thanks [@kube](https://github.com/kube)! - Add the `string` token attribute type, stored via per-run interning. Editing a type's schema now migrates stored initial state (values convert, falling back to the new type's default).

- [#8764](https://github.com/hashintel/hash/pull/8764) [`c6cfee0`](https://github.com/hashintel/hash/commit/c6cfee00362a82d18cb24f920d8f207d57a1e56d) Thanks [@kube](https://github.com/kube)! - Add `integer` and `boolean` token attribute types.

- [#9043](https://github.com/hashintel/hash/pull/9043) [`63a51e5`](https://github.com/hashintel/hash/commit/63a51e5df5b4550d4239e5d87354b236c03c2998) Thanks [@kube](https://github.com/kube)! - Metrics can now read net parameters ambiently as `parameters.<variableName>` (bound to the run's resolved values, including scenario overrides). Scenario parameters remain unavailable to metrics.

- [#8981](https://github.com/hashintel/hash/pull/8981) [`03f6a30`](https://github.com/hashintel/hash/commit/03f6a301b2ff4e6b1fbdd211a7baf04830ba78fb) Thanks [@kube](https://github.com/kube)! - Compile all user code (dynamics, rates, kernels, metrics) through a new HIR
  to programs reading the packed frame buffers directly, replacing Babel.

  Compatibility: code outside the supported TypeScript subset no longer runs —
  it is rejected with an error diagnostic pointing at the offending syntax.

- [#8763](https://github.com/hashintel/hash/pull/8763) [`faddfad`](https://github.com/hashintel/hash/commit/faddfad49bd8148dcfb94e55205b0ee65415b8aa) Thanks [@kube](https://github.com/kube)! - Add handle capabilities for disabling SDCPN extensions and global parameters.

- [#8662](https://github.com/hashintel/hash/pull/8662) [`62f4e31`](https://github.com/hashintel/hash/commit/62f4e31a6bd9b30a4fe0c05f637415b1fea1a4af) Thanks [@kube](https://github.com/kube)! - Add subnet definitions, component instances, and wiring support to Petrinaut.

- [#8774](https://github.com/hashintel/hash/pull/8774) [`f2d9df1`](https://github.com/hashintel/hash/commit/f2d9df18efa55728f78e4e7c86da14c452055c49) Thanks [@kube](https://github.com/kube)! - Support read input arcs across SDCPN parsing, simulation, AI arc creation, and typed code inputs.

- [#8943](https://github.com/hashintel/hash/pull/8943) [`2989ccd`](https://github.com/hashintel/hash/commit/2989ccdcedda33206f537bf2cf4a3470edc537b0) Thanks [@kube](https://github.com/kube)! - Export the token value codec and `compileUserCode` from `@hashintel/petrinaut-core`.

- [#8944](https://github.com/hashintel/hash/pull/8944) [`2c1c089`](https://github.com/hashintel/hash/commit/2c1c089fea20c6788942bc59a2ac6d8382bf7559) Thanks [@kube](https://github.com/kube)! - Packed-struct token frame layout (f64 numbers, u8 booleans, 8-byte strides). `getPlaceTokens(place)` and `buildMetricState(frame, places)` drop unused parameters.

## 0.0.2

### Patch Changes

- [#8751](https://github.com/hashintel/hash/pull/8751) [`3b5ff88`](https://github.com/hashintel/hash/commit/3b5ff88eb9d2983d7c63492f3911d70eaa28d331) Thanks [@kube](https://github.com/kube)! - Add Monte Carlo experiment metric specs, accumulators, runtime streaming, and worker support.

- [#8750](https://github.com/hashintel/hash/pull/8750) [`f9d6417`](https://github.com/hashintel/hash/commit/f9d64178b4a20c04efb0ad85fcf8dbfcff20327a) Thanks [@CiaranMn](https://github.com/CiaranMn)! - improve and expand instance action schemas

## 0.0.1

### Patch Changes

- [#8730](https://github.com/hashintel/hash/pull/8730) [`ed40011`](https://github.com/hashintel/hash/commit/ed40011ba896b77db0dae30c219e1f2066382c28) Thanks [@kube](https://github.com/kube)! - Extract the headless Petrinaut core into `@hashintel/petrinaut-core`, expose dedicated core worker entry points, and remove the `@hashintel/petrinaut/core` compatibility entry point.
