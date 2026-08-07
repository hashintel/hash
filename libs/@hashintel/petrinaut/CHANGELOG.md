# @hashintel/petrinaut

## 0.1.0

### Minor Changes

- [#8829](https://github.com/hashintel/hash/pull/8829) [`4820e48`](https://github.com/hashintel/hash/commit/4820e48b10e9b01ee1f43e871533cc5c66c9d7df) Thanks [@kube](https://github.com/kube)! - Add Actual mode: a read-only live-execution view fed by a host-provided event stream, with an Actual timeline and Events tab, recording export helpers, and a redesigned timeline series selector.

### Patch Changes

- [#9074](https://github.com/hashintel/hash/pull/9074) [`9fa9452`](https://github.com/hashintel/hash/commit/9fa9452ddb5bde5a914fdb8bef7214a774e82eea) Thanks [@kube](https://github.com/kube)! - Fix the Simulation Settings scenario picker overlapping its action buttons, keep the BottomPanel tab bar a constant height, fade truncated tab labels instead of wrapping, adapt the Timeline header (shrinking metric picker, hidden label) to narrow panels, and let sidebar subview content scroll through the section's full height.

- [#9084](https://github.com/hashintel/hash/pull/9084) [`4dbbdf6`](https://github.com/hashintel/hash/commit/4dbbdf65434d065918b94af0d9b8b5f1ae74d23f) Thanks [@claude](https://github.com/apps/claude)! - Remove "Petrinaut" branding from the AI assistant panel: the tab now reads "AI", and the empty-state, composer label and auto-layout widget copy refer to the assistant neutrally. The `topBarStart` slot now renders after the built-in sidebar-toggle and menu buttons, immediately before the net title, so hosts can lead into the title with breadcrumbs, and a new `slots.titleStyle` hook lets hosts apply an inline style to the title input (e.g. tinting it as the final crumb).

- [#9066](https://github.com/hashintel/hash/pull/9066) [`30eaafa`](https://github.com/hashintel/hash/commit/30eaafa42e70bdffb5cdded1914c2894715ca9a4) Thanks [@kube](https://github.com/kube)! - Make optimization runs detached and resumable — and make that the only contract. Optimization events carry a server-issued `seq`; the host optimization capability is now `createOptimizationRun`/`attachOptimizationRun`/`cancelOptimizationRun` (all required; attachments accept an `onAttached` callback so UIs can report an honest connection state), and the legacy single-connection `optimize` method is removed. The optimizations UI auto-reconnects dropped event streams by run id and cursor, re-attaching after page reloads where storage allows.

- [#8953](https://github.com/hashintel/hash/pull/8953) [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b) Thanks [@kube](https://github.com/kube)! - Add the `uuid` token attribute type: 128-bit identifiers, `bigint` at runtime, canonical strings at rest. Kernels may omit uuid fields to auto-generate them, or use `Uuid.generate()` / `Uuid.from(value)`.

- [#9092](https://github.com/hashintel/hash/pull/9092) [`4877809`](https://github.com/hashintel/hash/commit/4877809941040793f13497b73239b558bfa7cb80) Thanks [@kube](https://github.com/kube)! - Scenario code fixes and helpers: array methods that read `.constructor` internally (`.map`, `.filter`, `.slice`, `.concat`, `.flatMap`) no longer throw inside scenario expressions and "Define as code" initial state; a Python-style `range(end)` / `range(start, end, step?)` helper is now in scope (and typed in the code editors); scenario compilation errors are surfaced in Simulation Settings instead of being silently ignored.

- [#9097](https://github.com/hashintel/hash/pull/9097) [`b13818b`](https://github.com/hashintel/hash/commit/b13818ba36c7297580f188d5222fc0467a71a1ef) Thanks [@claude](https://github.com/apps/claude)! - Clarify the Predicate firing-time info box: it now states that the transition fires immediately — without stochastic delay — once the guard function returns true and input tokens are available.

- [#8953](https://github.com/hashintel/hash/pull/8953) [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b) Thanks [@kube](https://github.com/kube)! - Add the `string` token attribute type, stored via per-run interning. Editing a type's schema now migrates stored initial state (values convert, falling back to the new type's default).

- [#9051](https://github.com/hashintel/hash/pull/9051) [`276e17d`](https://github.com/hashintel/hash/commit/276e17d7b0f80c8a80d5abe01849bbb67c6169d0) Thanks [@kube](https://github.com/kube)! - Add a scenario-first optimization interface with flat parameter search spaces, metric objectives, and progressive step results.

- [#8764](https://github.com/hashintel/hash/pull/8764) [`c6cfee0`](https://github.com/hashintel/hash/commit/c6cfee00362a82d18cb24f920d8f207d57a1e56d) Thanks [@kube](https://github.com/kube)! - Add `integer` and `boolean` token attribute types.

- [#8846](https://github.com/hashintel/hash/pull/8846) [`706981f`](https://github.com/hashintel/hash/commit/706981fe092d7373cf294ea47e9b038d4fb559ad) Thanks [@CiaranMn](https://github.com/CiaranMn)! - Update inhibitor arc styling

- [#9043](https://github.com/hashintel/hash/pull/9043) [`63a51e5`](https://github.com/hashintel/hash/commit/63a51e5df5b4550d4239e5d87354b236c03c2998) Thanks [@kube](https://github.com/kube)! - Metrics can now read net parameters ambiently as `parameters.<variableName>` (bound to the run's resolved values, including scenario overrides). Scenario parameters remain unavailable to metrics.

- [#8981](https://github.com/hashintel/hash/pull/8981) [`03f6a30`](https://github.com/hashintel/hash/commit/03f6a301b2ff4e6b1fbdd211a7baf04830ba78fb) Thanks [@kube](https://github.com/kube)! - Compile all user code (dynamics, rates, kernels, metrics) through a new HIR
  to programs reading the packed frame buffers directly, replacing Babel.

  Compatibility: code outside the supported TypeScript subset no longer runs —
  it is rejected with an error diagnostic pointing at the offending syntax.

- [#8763](https://github.com/hashintel/hash/pull/8763) [`faddfad`](https://github.com/hashintel/hash/commit/faddfad49bd8148dcfb94e55205b0ee65415b8aa) Thanks [@kube](https://github.com/kube)! - Add handle capabilities for disabling SDCPN extensions and global parameters.

- [#9078](https://github.com/hashintel/hash/pull/9078) [`aafb03b`](https://github.com/hashintel/hash/commit/aafb03b1ed55360b51bf9400ddfc3e9f5c8eefc4) Thanks [@kube](https://github.com/kube)! - Add a small right inset to the Simulation Settings scenario picker row and parameters list so their controls don't hug the column edge.

- [#8662](https://github.com/hashintel/hash/pull/8662) [`62f4e31`](https://github.com/hashintel/hash/commit/62f4e31a6bd9b30a4fe0c05f637415b1fea1a4af) Thanks [@kube](https://github.com/kube)! - Add subnet definitions, component instances, and wiring support to Petrinaut.

- [#8774](https://github.com/hashintel/hash/pull/8774) [`f2d9df1`](https://github.com/hashintel/hash/commit/f2d9df18efa55728f78e4e7c86da14c452055c49) Thanks [@kube](https://github.com/kube)! - Add editor support for read input arcs, including arc controls and distinct canvas rendering.

- [#9092](https://github.com/hashintel/hash/pull/9092) [`4877809`](https://github.com/hashintel/hash/commit/4877809941040793f13497b73239b558bfa7cb80) Thanks [@kube](https://github.com/kube)! - Add a "Pre-deployed Constellation" scenario to the Probabilistic Satellite Launcher example: its initial state is authored in code mode, building a ring of satellites with `range(...).map(...)` from two scenario parameters (`number_of_satellites`, `initial_altitude`).

- [#9073](https://github.com/hashintel/hash/pull/9073) [`9c043ef`](https://github.com/hashintel/hash/commit/9c043ef4d471dcbe59bf1062c956a2bb24c6df0f) Thanks [@kube](https://github.com/kube)! - Use a shared fixed seed (`PETRINAUT_DEFAULT_SEED`) for interactive simulation and optimization runs, so playing a simulation reproduces an optimization trial given the same configuration.

- [#8943](https://github.com/hashintel/hash/pull/8943) [`2989ccd`](https://github.com/hashintel/hash/commit/2989ccdcedda33206f537bf2cf4a3470edc537b0) Thanks [@kube](https://github.com/kube)! - Export the token value codec and `compileUserCode` from `@hashintel/petrinaut-core`.

- [#8944](https://github.com/hashintel/hash/pull/8944) [`2c1c089`](https://github.com/hashintel/hash/commit/2c1c089fea20c6788942bc59a2ac6d8382bf7559) Thanks [@kube](https://github.com/kube)! - Packed-struct token frame layout (f64 numbers, u8 booleans, 8-byte strides). `getPlaceTokens(place)` and `buildMetricState(frame, places)` drop unused parameters.

- [#9071](https://github.com/hashintel/hash/pull/9071) [`ff6b8f8`](https://github.com/hashintel/hash/commit/ff6b8f8fcc66e0c6760fdcf7c3264db240e99a4d) Thanks [@claude](https://github.com/apps/claude)! - Ship Panda static-analysis build info (`@hashintel/petrinaut/panda.buildinfo.json`) and a shared theme preset (`@hashintel/petrinaut/panda-preset`) so host applications can compile Petrinaut's styles through their own Panda pipeline instead of relying on two independently generated, layer-polyfilled bundles. Petrinaut's keyframes are now namespaced (`petrinautFadeIn`, `petrinautExpand`, ...) so they can never collide with — and be deep-merged into — a host theme's keyframes.

- Updated dependencies [[`7931c7a`](https://github.com/hashintel/hash/commit/7931c7a9fe52c37d0be47bec1f9c3e391c55bdc0), [`30eaafa`](https://github.com/hashintel/hash/commit/30eaafa42e70bdffb5cdded1914c2894715ca9a4), [`5531c20`](https://github.com/hashintel/hash/commit/5531c2098358b544919441689728369e0b581ca0), [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b), [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b), [`5db8b5d`](https://github.com/hashintel/hash/commit/5db8b5d53b45bb08e5a6717a6a1cc2770f2bcadf), [`eee2547`](https://github.com/hashintel/hash/commit/eee25471609c0e5ac740320226ce6eb0c8647d31), [`4877809`](https://github.com/hashintel/hash/commit/4877809941040793f13497b73239b558bfa7cb80), [`54cc7eb`](https://github.com/hashintel/hash/commit/54cc7ebe119c13b5229d249891ec0302be559bbd), [`bfb99e7`](https://github.com/hashintel/hash/commit/bfb99e7570826d22feb949d35882dcd23d7d379b), [`b00c6bd`](https://github.com/hashintel/hash/commit/b00c6bd83433556b6dbdf9381978ef1d5cece9ef), [`0cb749d`](https://github.com/hashintel/hash/commit/0cb749d4f8e257328c81ce2d722b6a2e203818bf), [`c6cfee0`](https://github.com/hashintel/hash/commit/c6cfee00362a82d18cb24f920d8f207d57a1e56d), [`8494d8a`](https://github.com/hashintel/hash/commit/8494d8a91782a68d5855f88aeaf1a975e0f3a2e4), [`46ddd67`](https://github.com/hashintel/hash/commit/46ddd67ee03bb30a64fab6de4bdcd26221be7752), [`63a51e5`](https://github.com/hashintel/hash/commit/63a51e5df5b4550d4239e5d87354b236c03c2998), [`d0af60d`](https://github.com/hashintel/hash/commit/d0af60dfdb56a8052dbf2230d8e2a0a7584e56a8), [`4820e48`](https://github.com/hashintel/hash/commit/4820e48b10e9b01ee1f43e871533cc5c66c9d7df), [`03f6a30`](https://github.com/hashintel/hash/commit/03f6a301b2ff4e6b1fbdd211a7baf04830ba78fb), [`faddfad`](https://github.com/hashintel/hash/commit/faddfad49bd8148dcfb94e55205b0ee65415b8aa), [`f82a980`](https://github.com/hashintel/hash/commit/f82a9809fcce407c4880a8a3420ca7d7a6db7048), [`4681616`](https://github.com/hashintel/hash/commit/468161636972a3352890445568c0ac062469631d), [`62f4e31`](https://github.com/hashintel/hash/commit/62f4e31a6bd9b30a4fe0c05f637415b1fea1a4af), [`741e772`](https://github.com/hashintel/hash/commit/741e772a8a48853761f6c1cd17936a07ac1a190b), [`f2d9df1`](https://github.com/hashintel/hash/commit/f2d9df18efa55728f78e4e7c86da14c452055c49), [`4877809`](https://github.com/hashintel/hash/commit/4877809941040793f13497b73239b558bfa7cb80), [`9c043ef`](https://github.com/hashintel/hash/commit/9c043ef4d471dcbe59bf1062c956a2bb24c6df0f), [`0aadff3`](https://github.com/hashintel/hash/commit/0aadff3546ac85767911589ac2fe6544e8a78ae5), [`aaaddd6`](https://github.com/hashintel/hash/commit/aaaddd62ebce44795b16ffc172cd9a9c9a57ae7b), [`343cc4a`](https://github.com/hashintel/hash/commit/343cc4aa57eac8e1bb44db1f165365d1d0cf23a2), [`2989ccd`](https://github.com/hashintel/hash/commit/2989ccdcedda33206f537bf2cf4a3470edc537b0), [`2c1c089`](https://github.com/hashintel/hash/commit/2c1c089fea20c6788942bc59a2ac6d8382bf7559), [`3e52d9a`](https://github.com/hashintel/hash/commit/3e52d9a23ab99522555d5bcf35fed536ee20b077), [`3735fc7`](https://github.com/hashintel/hash/commit/3735fc7bd919dc2ce5503f852182a897d9ee16b2)]:
  - @hashintel/ds-components@0.3.0
  - @hashintel/petrinaut-core@0.1.0

## 0.0.16

### Patch Changes

- [#8789](https://github.com/hashintel/hash/pull/8789) [`1fff5b0`](https://github.com/hashintel/hash/commit/1fff5b0d79a98a5328f0df6fe4770e2f6f6fcad0) Thanks [@alex-e-leon](https://github.com/alex-e-leon)! - Adds an optional product walkthrough that consumers can set

- [#8751](https://github.com/hashintel/hash/pull/8751) [`3b5ff88`](https://github.com/hashintel/hash/commit/3b5ff88eb9d2983d7c63492f3911d70eaa28d331) Thanks [@kube](https://github.com/kube)! - Add experiment metric creation controls, validation, and scalar/distribution visualizations.

- [#8750](https://github.com/hashintel/hash/pull/8750) [`f9d6417`](https://github.com/hashintel/hash/commit/f9d64178b4a20c04efb0ad85fcf8dbfcff20327a) Thanks [@CiaranMn](https://github.com/CiaranMn)! - add AI assistant

- Updated dependencies [[`3b5ff88`](https://github.com/hashintel/hash/commit/3b5ff88eb9d2983d7c63492f3911d70eaa28d331), [`f9d6417`](https://github.com/hashintel/hash/commit/f9d64178b4a20c04efb0ad85fcf8dbfcff20327a), [`c39ede8`](https://github.com/hashintel/hash/commit/c39ede805c753b91eb9551362f0815f77bba5833), [`919cbc5`](https://github.com/hashintel/hash/commit/919cbc57b9e3f60b9ea3bde7e42aabc14a235370), [`f9d6417`](https://github.com/hashintel/hash/commit/f9d64178b4a20c04efb0ad85fcf8dbfcff20327a)]:
  - @hashintel/petrinaut-core@0.0.2
  - @hashintel/ds-components@0.2.2

## 0.0.15

### Patch Changes

- [#8730](https://github.com/hashintel/hash/pull/8730) [`ed40011`](https://github.com/hashintel/hash/commit/ed40011ba896b77db0dae30c219e1f2066382c28) Thanks [@kube](https://github.com/kube)! - Extract the headless Petrinaut core into `@hashintel/petrinaut-core`, expose dedicated core worker entry points, and remove the `@hashintel/petrinaut/core` compatibility entry point.

- [#8709](https://github.com/hashintel/hash/pull/8709) [`2c1c977`](https://github.com/hashintel/hash/commit/2c1c977d8d2772706f4edb91dd79a8d28866bff0) Thanks [@kube](https://github.com/kube)! - Add basic MonteCarlo-based experiments

- Updated dependencies [[`c0c9498`](https://github.com/hashintel/hash/commit/c0c9498dc4f648814a80fc6e8df3598ff8a108ac), [`ed40011`](https://github.com/hashintel/hash/commit/ed40011ba896b77db0dae30c219e1f2066382c28), [`d3ac60c`](https://github.com/hashintel/hash/commit/d3ac60c5509bd2d5a478f2e5a56433c59d353f7b), [`834cbee`](https://github.com/hashintel/hash/commit/834cbeeb7d8045f006d7a1fab1e5858b83c437d6)]:
  - @hashintel/ds-helpers@0.2.1
  - @hashintel/petrinaut-core@0.0.1
  - @hashintel/refractive@0.0.4
  - @hashintel/ds-components@0.2.1

## 0.0.14

### Patch Changes

- [#8633](https://github.com/hashintel/hash/pull/8633) [`fe08932`](https://github.com/hashintel/hash/commit/fe0893270534885d81ea909b871d4185d6aa0c2e) Thanks [@kube](https://github.com/kube)! - Add Metrics: user-authored functions over simulation state that produce a single number per frame, plotted via a new metric picker in the simulation timeline header

- Updated dependencies [[`926f9fa`](https://github.com/hashintel/hash/commit/926f9fa3b844a9dd4ca26cdbe6dd69ceed87dcb5), [`ab0a035`](https://github.com/hashintel/hash/commit/ab0a0353baa0f1611ceba7ca29cd8adb575392f5), [`891f36f`](https://github.com/hashintel/hash/commit/891f36f602ba628d66140dd53130a688addb98fa), [`d9eb831`](https://github.com/hashintel/hash/commit/d9eb8317bd0c981e45f263a007aeac48f309e268), [`79eda1e`](https://github.com/hashintel/hash/commit/79eda1e27e9a6b2959a68e59f9a25791639f5770)]:
  - @hashintel/ds-components@0.2.0
  - @hashintel/ds-helpers@0.2.0

## 0.0.13

### Patch Changes

- [#8618](https://github.com/hashintel/hash/pull/8618) [`dae70b5`](https://github.com/hashintel/hash/commit/dae70b532abfc74158e6452f3e739f1baf8140f0) Thanks [@alex-e-leon](https://github.com/alex-e-leon)! - Add support for inhibitor arcs

- [#8611](https://github.com/hashintel/hash/pull/8611) [`21327f5`](https://github.com/hashintel/hash/commit/21327f52ad732b3e348b5e7421f6ed514295d417) Thanks [@alex-e-leon](https://github.com/alex-e-leon)! - Let minZoom be dynamically based on the size of the net

- [#8637](https://github.com/hashintel/hash/pull/8637) [`e02b330`](https://github.com/hashintel/hash/commit/e02b33016bf187ac1838827e477e68cea9d7922c) Thanks [@alex-e-leon](https://github.com/alex-e-leon)! - recenter offscreen selected items when drawer is opened

- [#8623](https://github.com/hashintel/hash/pull/8623) [`ae168f5`](https://github.com/hashintel/hash/commit/ae168f540900a5fa938c557e82b6aa3f80d6fef0) Thanks [@alex-e-leon](https://github.com/alex-e-leon)! - Improve text wrapping for long text in nodes

- [#8609](https://github.com/hashintel/hash/pull/8609) [`b12a1d2`](https://github.com/hashintel/hash/commit/b12a1d2e9cdeff8d20c8472b3cafa83fca5070ea) Thanks [@kube](https://github.com/kube)! - Add Scenarios: reusable simulation configurations with parameter overrides and initial state expressions

## 0.0.12

### Patch Changes

- [#8590](https://github.com/hashintel/hash/pull/8590) [`4a60112`](https://github.com/hashintel/hash/commit/4a6011241720a9c5d8a7f0e7f49f15b50eaad228) Thanks [@CiaranMn](https://github.com/CiaranMn)! - better scoping of styles, font loading

## 0.0.11

### Patch Changes

- Updated dependencies [[`efc1237`](https://github.com/hashintel/hash/commit/efc12379a84adbcf28db961bf6af8dd18e6b579d), [`efc1237`](https://github.com/hashintel/hash/commit/efc12379a84adbcf28db961bf6af8dd18e6b579d)]:
  - @hashintel/refractive@0.0.3
  - @hashintel/ds-helpers@0.1.2
  - @hashintel/ds-components@0.1.2

## 0.0.10

### Patch Changes

- [#8570](https://github.com/hashintel/hash/pull/8570) [`2399453`](https://github.com/hashintel/hash/commit/23994530e745c153a2b926c89e9205b87630c236) Thanks [@CiaranMn](https://github.com/CiaranMn)! - Fix dependency references

- Updated dependencies [[`2399453`](https://github.com/hashintel/hash/commit/23994530e745c153a2b926c89e9205b87630c236)]:
  - @hashintel/ds-components@0.1.1
  - @hashintel/ds-helpers@0.1.1

## 0.0.9

### Patch Changes

- [#8300](https://github.com/hashintel/hash/pull/8300) [`2b711ad`](https://github.com/hashintel/hash/commit/2b711adc178483069b02a349fb5822d6ecc735af) Thanks [@kube](https://github.com/kube)! - Add LSP-based language service layer for Monaco code editors with diagnostics, completions, hover, and signature help

- [#8533](https://github.com/hashintel/hash/pull/8533) [`feb318b`](https://github.com/hashintel/hash/commit/feb318b85398afca507a5ddee5414520f236b1e6) Thanks [@kube](https://github.com/kube)! - Add copy/paste, select all, and escape-to-deselect keyboard shortcuts

- [#8439](https://github.com/hashintel/hash/pull/8439) [`9741121`](https://github.com/hashintel/hash/commit/9741121865f41557780d3bab873690a8074cad7f) Thanks [@CiaranMn](https://github.com/CiaranMn)! - add TikZ export format

- [#8285](https://github.com/hashintel/hash/pull/8285) [`673ece2`](https://github.com/hashintel/hash/commit/673ece205d7622936980bf744574654026aad1c3) Thanks [@kube](https://github.com/kube)! - Fix read-only tooltips to always show during simulation mode

- [#8472](https://github.com/hashintel/hash/pull/8472) [`15ebcfe`](https://github.com/hashintel/hash/commit/15ebcfe3e9d51bcd88802fc41001f63cbe70b085) Thanks [@kube](https://github.com/kube)! - Visual appearance improvements

- [#8463](https://github.com/hashintel/hash/pull/8463) [`a9fe023`](https://github.com/hashintel/hash/commit/a9fe0235430bc71f0275f2954e9728cb3b410915) Thanks [@kube](https://github.com/kube)! - Add probability distribution support to transition kernels (`Distribution.Gaussian`, `Distribution.Uniform`, `Distribution.Lognormal`)

- [#8523](https://github.com/hashintel/hash/pull/8523) [`44fe283`](https://github.com/hashintel/hash/commit/44fe283ffb14e378b516fc7295f9133bb9d397d6) Thanks [@kube](https://github.com/kube)! - Add multi-selection support with keyboard shortcuts, refactor selection logic, migrate to @xyflow/react v12

- [#8295](https://github.com/hashintel/hash/pull/8295) [`4b22f76`](https://github.com/hashintel/hash/commit/4b22f7608491fe10a8b90753fe0cc47f99dbd296) Thanks [@kube](https://github.com/kube)! - Add configurable simulation playback speed and maximum run time

- [#8505](https://github.com/hashintel/hash/pull/8505) [`f6971b7`](https://github.com/hashintel/hash/commit/f6971b7c5730bad6094e21c1b849283fcb818325) Thanks [@kube](https://github.com/kube)! - Add optional undo/redo support with version history UI, keyboard shortcuts (Cmd|Ctrl+Z / Cmd|Ctrl+Shift+Z), and drag debouncing

- Updated dependencies [[`76aed29`](https://github.com/hashintel/hash/commit/76aed2967634fd5b15de428b053c4cdad92c1102), [`15ebcfe`](https://github.com/hashintel/hash/commit/15ebcfe3e9d51bcd88802fc41001f63cbe70b085), [`7ddaecb`](https://github.com/hashintel/hash/commit/7ddaecbc0f2b3ea1daff6ea584a3d9f418a3da53)]:
  - @hashintel/ds-helpers@0.1.0
  - @hashintel/ds-components@0.1.0

## 0.0.8

### Patch Changes

- Updated dependencies [[`567b951`](https://github.com/hashintel/hash/commit/567b95178a429aa2c1c00050ca753250db0db094)]:
  - @hashintel/refractive@0.0.2
  - @hashintel/ds-components@0.0.4
  - @hashintel/ds-helpers@0.0.4

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @hashintel/ds-components@0.0.3
  - @hashintel/ds-helpers@0.0.3

## 0.0.6

### Patch Changes

- [#8194](https://github.com/hashintel/hash/pull/8194) [`d28482a`](https://github.com/hashintel/hash/commit/d28482a537980c507dbd7352d6e14d9bdb1132e4) Thanks [@kube](https://github.com/kube)! - Unify Vite config and update styles configuration

- [#8171](https://github.com/hashintel/hash/pull/8171) [`bc9456d`](https://github.com/hashintel/hash/commit/bc9456d08906560a9f348b0957f89a0e5e6e4593) Thanks [@kube](https://github.com/kube)! - Add Diagnostics Panel using TypeScript Language Service.

- [#8211](https://github.com/hashintel/hash/pull/8211) [`23e295b`](https://github.com/hashintel/hash/commit/23e295b42569101e25338af9b26f1daaf7868a57) Thanks [@kube](https://github.com/kube)! - Add Simulation Timeline Visualizer

- [#8143](https://github.com/hashintel/hash/pull/8143) [`0c8a82f`](https://github.com/hashintel/hash/commit/0c8a82fb7cd801b8c6f8205f02fc9eed1ca0a6b0) Thanks [@kube](https://github.com/kube)! - Add Menu option to Export without Visual Information

- [#8262](https://github.com/hashintel/hash/pull/8262) [`4ac5c57`](https://github.com/hashintel/hash/commit/4ac5c57b251a3094dd87978383902ea30b162d3c) Thanks [@kube](https://github.com/kube)! - Better animation of Transitions and flow inside Arcs

- [#8083](https://github.com/hashintel/hash/pull/8083) [`469eb01`](https://github.com/hashintel/hash/commit/469eb01a176e94f9ba881701e9d41f3c4390ca67) Thanks [@CiaranMn](https://github.com/CiaranMn)! - implement SDCPN features, update UI

- [#8195](https://github.com/hashintel/hash/pull/8195) [`da0c7b9`](https://github.com/hashintel/hash/commit/da0c7b9a197be422c898e47f34c4abe4ca5cd9c0) Thanks [@kube](https://github.com/kube)! - Quick Simulation in Edit mode, and disable Simulate tab for now.

- Updated dependencies [[`658b9a4`](https://github.com/hashintel/hash/commit/658b9a4040029059099b43a77a757ff32e0b5c38), [`658b9a4`](https://github.com/hashintel/hash/commit/658b9a4040029059099b43a77a757ff32e0b5c38)]:
  - @hashintel/refractive@0.0.1
  - @hashintel/ds-components@0.0.2
  - @hashintel/ds-helpers@0.0.2
