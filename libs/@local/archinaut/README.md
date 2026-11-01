# `@local/archinaut`

Builds an architecture model from annotations in the source and symbol facts
from the compilers, checks it on every build, emits a portable documentation
bundle, and builds or serves the website that renders it.

```sh
archinaut check                   # report, never write
archinaut bundle [--diff-base ref]  # write the bundle
archinaut build --out dist        # bundle, then the website into dist/
archinaut dev --port 4322         # serve the website, rebuild on change
```

Every command reads `archinaut.config.ts` from the working directory, or the
file `--config` names.

A config file default-exports `defineConfig({...})`: the packages to cover,
the layer-crossing rules, where content, output and cache live, and the
site's title, URL, logo and favicon. `apps/petrinaut-docs` is the first
instance.

## The pipeline

Four stages over plain data, in `src/pipeline.ts`:

1. `scan` walks the packages and reads the annotations: `@layerRoot` and
   `@role` declare a layer on a folder (README frontmatter `layer`/`role`
   does the same), every descendant file inherits it; `@talksTo` declares
   an edge no import carries.
2. `facts` collects, for every covered file, the symbols it defines and the
   symbols it references, each named by its defining file. This is all the
   model reads from the code, so a provider is anything that produces that
   shape for a language; `src/pipeline/facts.ts` holds the shape and chooses
   the provider. Facts are cached under `cacheDirectory/facts`, one entry per
   language, keyed by the content of the covered files, so an edit undone
   finds its entry again.
3. `model` turns symbol references into file dependencies, aggregates them to
   layer edges, and adds the declared edges.
4. `check` fails the build on an undeclared ancestor, a violated rule, a rule
   that cannot fire, or a file no layer resolves to.

An edge lands on the layer that defines the symbol, so the model is finer than
one that stops at barrels: `react → core.handle`, not `react → core`.

## Pages beside the code

An `.mdx` page or a `.d2` diagram inside a covered package belongs to the
layer of its folder, found by the same scan that resolves source files, and
the model lists it on the layer (`pages`, `diagrams`). The emitter renders
the page beneath the layer's page, with the slug `<layer>/<file stem>` as the
key `doc:` links use, and renders the diagram like any other. A page
references a diagram relative to itself, as `![alt](./flow.d2)`, and the
emitter rewrites that to a plain image of the rendered SVG, so the package
needs no MDX or D2 tooling and the bundle stays framework-neutral. Pages that belong to no
layer, and diagrams several pages share, live under `contentDirectory`.

Every node of a generated diagram carries its layer's role as a tooltip and
links to the layer's page, relative to the page the diagram is embedded in;
the badges d2 draws for both are stripped, since the tooltip is the node's
own `<title>` and the link wraps the node. A host that inlines the SVG gets
hover text and navigation for free; one that embeds it as an image gets the
drawing alone.

## Facts providers

**TypeScript** facts come from the native TypeScript compiler, the 7.1 line,
through its API (`typescript-7/sync`). Every covered TypeScript package goes
into one program, with `paths` mapping workspace packages to their source
entries so a cross-package reference lands on the defining source file rather
than on a built declaration file. The program lives in a worker thread
(`src/pipeline/facts/typescript/worker.ts`), so the main thread never waits on
the compiler and a server beside it keeps serving. An edit updates the
program's snapshot in place; only the edited files and the files referencing
what they define are walked again.

**Python** facts come from the import-statement scan in
`src/pipeline/facts/python/imports.ts` under both analyses, plus scip-python's
symbol index under `program`. The scan is the safety net for the modules
scip-python leaves unresolved; the union is the edge set. The index is read
straight from the protobuf wire format by `scip-decode.ts`, so no generated
bindings are needed.

## The providers

One provider per language, each asking the language's own tooling, so a
reference the tooling infers counts as structural coupling.

The TypeScript provider asks the type checker about every identifier that
can resolve outside its file: a property read off a value whose type another
file declares counts as a reference to that file, with no import between the
two. A name bound below the module scope, by a parameter, a local declaration
or a type parameter, is skipped, since no other file can reference it; member
names are always asked. On the Petrinaut instance, 971 TypeScript files, a
UI view reading `.kind` off a simulation frame it received as a prop draws
`ui.views → core.simulation` this way; the cold facts stage takes about 5 s
and a warm one, from the cache, well under 0.1 s.

The Python provider runs scip-python for the symbol-level index and an
import-statement scan beside it, as the safety net for the modules scip-python
leaves unresolved; the union is the edge set.

## The bundle

Written to `outputDirectory`, framework-neutral, and consumed by the site:

| File                     | What it is                                                                    |
| ------------------------ | ----------------------------------------------------------------------------- |
| `architecture.json`      | The model, version 3: packages, layers, edges, rules                          |
| `search.json`            | Every page cut into sections, each reduced to plain text, for a host's search |
| `architecture.md`        | The whole architecture as one file, the cheapest read for an agent            |
| `manifest.json`          | The page tree, and on a diff build each page's status                         |
| `pages/**.mdx`           | Generated layer pages, plus the authored pages merged in                      |
| `components/*.tsx`       | The React cards generated pages import, and authored diagram components       |
| `diagrams/**.d2`, `.svg` | Diagram sources, and their renderings when `d2` is installed                  |

Only files whose content changed are written, so a watcher downstream sees one
event per real change. Every diagram is checked against the rendering cache
under `cacheDirectory/diagrams`, keyed by the source's content and d2's
version, so an unchanged diagram costs a read, a branch switch or an edit
undone costs a copy, and a d2 upgrade re-renders everything; what needs d2
renders in parallel with one process per core.

## Diff mode

`--diff-base <ref>` (or `ARCHINAUT_DIFF_BASE`) marks what the build changes
against a git ref. The base side is the same generator run over the base tree,
extracted with `git archive` or fetched sparsely from the public repository,
with the head's `node_modules` linked in so both sides resolve dependencies
the same way. It is cached under `cacheDirectory/base` by generator inputs
and base commit, and every clean build seeds the cache with its own side. The
diff decorates a build and never gates it: when the base cannot be built, the
plain bundle is written with a warning. Changed pages carry block markers,
removed pages become tombstones, and `manifest.json` records every page's
status.

## The site

`site/` is a Vite and React project shipped with the tool: TanStack Router
for navigation that never leaves the document, MDX compiled by Vite with the
same remark and rehype steps the pages were written against, code blocks
highlighted by shiki, formulas between `$` signs rendered by KaTeX when the
page compiles, with one KaTeX cannot parse failing the build, and one HTML
file per page in the output. Before Vite
runs, the tool writes the bundle into `site/src/content/` and `site/public/`,
together with the instance's title, logo and favicon.

`build` bundles the client and a server entry, then renders every page in the
manifest through the server entry into `dist/<slug>.html`, with the client's
own script tags kept, so a page is complete on arrival and the browser
hydrates it and navigates in place from there.

Search reads the bundle's `search.json`, every page cut into its sections
with a formula reduced to the names it mentions, and ranks the sections in
the browser with MiniSearch: title, heading and
description outweigh body text, words match by prefix, and a near miss
still counts. A result is a section, so it lands on the heading that
matched, and results group under their page with the page's kind beside
it. The index and the engine load on the first search, so a page costs
nothing until one is made; the field opens with `/` or `⌘K`, and the same
search works under the dev server, since the index comes from the bundle
and not from built HTML.

`dev` serves first and builds second: when a bundle from an earlier run is on
disk, the server starts on it at once and the first build replaces what
differs. Rebuilds go through a session that keeps every package's scan and
every language's facts in memory: a content edit rebuilds the model alone, a
Python edit re-scans that package, and a TypeScript edit goes to the worker,
which walks the edited files and their dependents. Only the bundle files that
differ are written and copied into the site tree; Vite's own reload does the
rest, with a plugin that reloads the pages when a re-rendered diagram lands,
since the pages inline SVGs at compile time. The last good bundle keeps
serving while an error stands.

## Source links

Generated pages link to the source they describe at the ref resolved from
`ARCHINAUT_SOURCE_REF`, then Vercel's and GitHub's commit and branch
variables, then `main`. `ARCHINAUT_CACHE_DIR` relocates the cache.
