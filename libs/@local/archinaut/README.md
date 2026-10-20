# `@local/archinaut`

Builds an architecture model from annotations in the source and symbol facts
from SCIP indexers, checks it on every build, emits a portable documentation
bundle, and builds or serves the website that renders it.

```sh
archinaut check  --config archinaut.config.ts                 # report, never write
archinaut bundle --config archinaut.config.ts [--diff-base ref]  # write the bundle
archinaut build  --config archinaut.config.ts --out dist       # bundle, then the website into dist/
archinaut dev    --config archinaut.config.ts --port 4322      # serve the website, rebuild on change
```

A config file default-exports `defineConfig({...})`: the packages to cover,
the layer-crossing rules, the tag vocabulary, the external parties that take
part in interfaces, where content, output and cache live, and the site's
title, URL, logo and favicon. `libs/@local/petrinaut-arch-docs` is the first
instance.

## The pipeline

Four stages over plain data, in `src/pipeline.ts`:

1. `scan` walks the packages and reads the annotations: `@layerRoot` and
   `@role` declare a layer on a folder (README frontmatter `layer`/`role`
   does the same), every descendant file inherits it; `@tags` and
   `@audience` say what a layer is about and who reads it; `@talksTo` declares
   an edge no import carries; `@interface` marks the file that defines an
   interface, with `@summary` beside it; `@participates` declares a role in one.
2. `index` runs scip-typescript and scip-python per package, in parallel,
   cached under `cacheDirectory` by the package's source listing. Workspace
   packages resolve to their source entries through a generated tsconfig, so a
   reference lands on the defining file rather than on a declaration bundle.
3. `model` turns symbol references into file dependencies, aggregates them to
   layer edges, adds the declared edges, and derives each interface's
   participants: every layer referencing a symbol the defining file exports is
   a consumer, and a declared role the code confirms is marked `type-ref`.
   Python edges also take the import-statement scan in
   `src/pipeline/edges/python-imports.ts`, since scip-python leaves some
   workspace imports unresolved.
4. `check` fails the build on an undeclared ancestor, a violated rule, a rule
   that cannot fire, a file no layer resolves to, or a participation in an
   interface nothing declares; an unknown tag or an interface with no
   participants is a warning.

An edge lands on the layer that defines the symbol, so the model is finer than
one that stops at barrels: `react → core.handle`, not `react → core`.

## The bundle

Written to `outputDirectory`, framework-neutral, and consumed by the site:

| File                     | What it is                                                                        |
| ------------------------ | --------------------------------------------------------------------------------- |
| `architecture.json`      | The model, version 3: packages, layers, edges, interfaces, externals, tags, rules |
| `architecture.md`        | The whole architecture as one file, the cheapest read for an agent                |
| `manifest.json`          | The page tree, and on a diff build each page's status                             |
| `pages/**.mdx`           | Generated layer and interface pages, plus the authored pages merged in            |
| `components/*.tsx`       | The React cards generated pages import, and authored diagram components           |
| `diagrams/**.d2`, `.svg` | Diagram sources, and their renderings when `d2` is installed                      |

Only files whose content changed are written, so a watcher downstream sees one
event per real change. Diagrams render only when their source changed.

## Diff mode

`--diff-base <ref>` (or `ARCHINAUT_DIFF_BASE`) marks what the build changes
against a git ref. The base side is the same generator run over the base tree,
extracted with `git archive` or fetched sparsely from the public repository,
with the head's `node_modules` linked in so both sides index under one
resolution. It is cached under `cacheDirectory/base` by generator inputs and
base commit, and every clean build seeds the cache with its own side. The
diff decorates a build and never gates it: when the base cannot be built, the
plain bundle is written with a warning. Changed pages carry block markers,
removed pages become tombstones, and `manifest.json` records every page's
status.

## The site

`site/` is an Astro and Starlight project. Before Astro runs, the tool writes
the bundle into `site/src/content/` and `site/public/`, together with the
instance's title, logo and favicon, and runs Astro from that directory. `dev`
watches the covered packages and the content directory, reruns the pipeline
on change (only the touched package re-indexes), and writes what differs;
Astro's own reload does the rest, and the last good bundle keeps serving
while an error stands.

`cookie` is a direct dependency, though no source file imports it. Astro's
generated prerender entry imports `cookie`, and Node resolves it from this
package rather than from Astro's own directory; without the dependency the
lookup reaches the root-hoisted `cookie@0.7.2` that `express` pins and the
build fails on a missing `parseCookie` export. Keep the pin inside Astro's
declared `cookie` range when bumping `astro`.

## Source links

Generated pages link to the source they describe at the ref resolved from
`ARCHINAUT_SOURCE_REF`, then Vercel's and GitHub's commit and branch
variables, then `main`. `ARCHINAUT_CACHE_DIR` relocates the cache.
