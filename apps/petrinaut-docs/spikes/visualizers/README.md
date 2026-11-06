# Visualizer spikes

The scripts behind the numbers in
[Visualizers off the main thread](../../content/visualizers/pipeline.mdx).
They are measurement code, not part of any package: no workspace, no lint, no
tests.

## Setup

Copy this folder outside the repository so its `package.json` is not picked up
as a workspace, install the packages, and point `HASH_REPO` at a checkout that
has run `yarn install` (the scripts read TypeScript, `@types/react` and the
example nets from it).

```sh
cp -r apps/petrinaut-docs/spikes/visualizers /tmp/visualizer-spikes
cd /tmp/visualizer-spikes
npm init -y
npm install --legacy-peer-deps @babel/standalone@7.28 babel-plugin-react-compiler@1 preact@11 react@19 react-dom@19 solid-js@1 svelte@5 sucrase@3 vite@8 vite-plugin-solid@2 @sveltejs/vite-plugin-svelte@7 playwright@1
npx playwright install chromium webkit
export HASH_REPO=/path/to/hash
```

## Scripts

| Script                                  | Measures                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `scripts/s1-jsx-service.mjs [--dom]`    | A JSX-aware `ts.LanguageService` with React's types: cold and warm diagnostics, completions, what it catches |
| `scripts/s2-transpile-bench.mjs`        | `ts.transpileModule` against `@babel/standalone` and `sucrase` on the largest example visualizer             |
| `scripts/s3-syntax-inventory.mjs`       | The syntax and calls each example visualizer uses, and which fall outside the HIR subset                     |
| `scripts/s4-iframe-isolation.mjs`       | Host `requestAnimationFrame` rate while an iframe variant busy-loops, plus what the frame can reach          |
| `scripts/s4b-chromium-flags.mjs`        | The same in Chromium's headless shell and full build, with and without `IsolateSandboxedIframes`             |
| `scripts/s6-react-compiler-browser.mjs` | The React Compiler through `@babel/standalone`: compile time and whether the output is memoized              |

Run any of them with `node scripts/<name>.mjs` from this folder.

## Benchmark

`bench/` builds one page per rendering variant and drives them headless.

```sh
cd bench
node prebuild.mjs                    # compiles the React variants, with and without the React Compiler
../node_modules/vite/bin/vite.js build
node run.mjs                         # VARIANTS, SIZES and FRACTIONS narrow the matrix; TRANSFER=1 adds the worker transfer rows
```

Each page exposes `window.runBench({ n, changedFraction })`, which mounts the
variant, feeds it a fresh token array per animation frame, and reports script
and frame-interval percentiles. `pages/transfer.html` measures what a worker's
element tree costs to post to the main thread in three encodings.
