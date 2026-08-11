# `@local/petrinaut-arch-docs`

Generates the Petrinaut architecture documentation from annotations in the
source, and bundles it with hand-written MDX into one portable artefact.

```sh
# Regenerate the bundle after changing annotations or code
yarn workspace @local/petrinaut-arch-docs doc:architecture

# Check the annotations without writing anything (what CI runs)
yarn workspace @local/petrinaut-arch-docs lint:arch-docs
```

## Why this exists

Architecture docs rot because nothing fails when they stop being true. Two
specific failures motivated this package:

- `petrinaut-core/scripts/generate-dependency-diagrams.mjs` held the architecture
  as ~180 lines of `if (path.startsWith("simulation/monte-carlo/"))` mappings,
  far from the code they described, with a fallback that silently mis-bucketed
  anything renamed. It also hard-coded seven of `petrinaut-core`'s ten entry
  points, so imports through `./ai`, `./optimization` and `./compiled-model`
  were missing from the diagram entirely.
- `petrinaut-core/docs/architecture/*.html` was 3,100 lines of hand-written HTML
  that nothing verified against the code. Its content has been migrated into
  authored MDX under `content/simulation/`, where it sits beside the generated
  pages; migrating it surfaced claims that had already gone stale.

Here the architecture is declared next to the code it describes, and CI fails
when a declaration stops matching reality.

## Declaring a layer

A declaration is two lines — an id and a one-line role:

```ts
/**
 * @layerRoot core.simulation.monte-carlo
 * @role Runs many simulations with bounded frame memory
 */
```

That is a complete declaration. Everything below is optional, and worth adding
only where the fact is real.

| Tag           | Adds                                                       |
| ------------- | ---------------------------------------------------------- |
| `@layerName`  | Display name. Defaults to the last id segment.             |
| `@entryPoint` | A public import specifier reaching this layer. Repeatable. |
| `@boundary`   | `<kind> — <what may not cross>`. Repeatable.               |
| `@invariant`  | Something that must stay true here. Repeatable.            |
| `@layer`      | Assigns **this file alone** to an already-declared layer.  |

`@boundary` kinds are `thread`, `worker`, `process`, `network`, `package` and
`sandbox`; the separator may be `—`, `-` or `:`.

`@layer` is the escape hatch for a single misplaced file. Reach for it rarely — a
file that needs it is usually a file in the wrong folder.

Tags are read from any block comment, only at the start of a line, so mentioning
`@layerRoot` in prose declares nothing. A tag's text wraps across lines until the
next tag or a blank line.

### Declaring from a README instead

A folder `README.md` can declare the same thing in frontmatter, and its prose
becomes the layer's page body — so a folder README that already explains itself
becomes an architecture page for free. Use it when the folder has real prose to
carry, or when no single file is the obvious host. Otherwise prefer the doc
comment: it needs no new file.

```yaml
---
layer: core.simulation.monte-carlo
role: Runs many simulations with bounded frame memory
name: Monte Carlo runtime
entryPoints:
  - "@hashintel/petrinaut-core/workers/monte-carlo"
boundaries:
  - kind: worker
    note: Frame buffers stay inside the worker
invariants:
  - Frame memory is bounded regardless of run length
---
```

Use one or the other on a folder, never both. A README with no `layer` key is
left alone as an ordinary document, and is linked from its layer page under
"Further reading".

Layer ids are dotted and hierarchical, and every ancestor must itself be
declared — `core.simulation.monte-carlo` requires `core.simulation` and `core`.

### Inheritance is what keeps this small

A file with no tags belongs to the nearest ancestor folder that declares a layer.
That is why ~40 declarations cover 412 files: you declare a layer where the
architecture actually changes, not on every file.

## The output: a portable bundle

Written to `bundle/`, which is **git-ignored build output** — it is derived
entirely from the annotations and from `content/`, so committing it would mean
reviewing the same change twice and resolving conflicts in generated files.
Regenerate it whenever you need it; nothing depends on a stored copy.

The bundle is framework-neutral by design — the Starlight site in
`apps/petrinaut-docs` and hash.dev are both just consumers.

| File                                 | What it is                                                       |
| ------------------------------------ | ---------------------------------------------------------------- |
| `architecture.json`                  | The model: layers, edges, boundaries, invariants, enforced rules |
| `architecture.md`                    | The whole architecture as one file — the cheapest read for an AI |
| `manifest.json`                      | Page tree for building navigation without crawling `pages/`      |
| `pages/**.mdx`                       | Generated layer pages, plus authored pages merged in             |
| `components/*.tsx`                   | React diagram components imported by authored pages              |
| `components/architecture-layouts.ts` | Pre-computed diagram geometry (generated)                        |
| `diagrams/*.d2`                      | Diagram sources (diffable)                                       |
| `diagrams/*.svg`                     | Rendered diagrams                                                |

**Generated** MDX is YAML frontmatter plus plain CommonMark — no JSX, no
imports, no framework components — which is what lets it render in Astro, in
hash.dev's Next.js MDX pipeline, and as plain text.

**Authored** pages may additionally import the diagram components below, which is
where every requirement the bundle places on a host comes from:

| A host must provide                | For                                                                 |
| ---------------------------------- | ------------------------------------------------------------------- |
| A React-capable MDX pipeline       | Any authored page that imports a diagram component                  |
| `d3-zoom` and `d3-selection`       | Pan and zoom on the layer map, and nothing else                     |
| A hydration directive on that page | Folding the layer map; without one it still renders as a static SVG |

Nothing else. In particular the bundle asks for **no Markdown or Rehype
plugins** — a host renders it with its Markdown pipeline exactly as configured,
which is what keeps "render the bundle" a small job rather than a negotiation.

### Embedding the bundle elsewhere

A host reads `manifest.json`, maps each page's `slug` onto its own URL space, and
renders `pages/<path>`.

One contract to honour: **links between generated pages are relative and assume
slugs map to URLs without a trailing slash.** A host that serves
`/architecture/core/simulation/` rather than `/architecture/core/simulation`
must rewrite them; `manifest.json` gives you every slug to do so. The Starlight
consumer sets `trailingSlash: "never"` for this reason.

## The interactive layer map

`components/architecture-graph.tsx` renders the layer tree as a diagram a reader
can fold and unfold. It is the one part of the bundle with a dependency beyond
React — `d3-zoom`, which a host must install — so it is worth knowing what that
buys and what it costs.

**One renderer, not two.** The same component draws the diagram on the server and
in the browser; hydrating adds a zoom transform and working fold controls, and
changes nothing else. An earlier version handed the interactive view to a
node-editor library, which meant two code paths that had to agree about the same
picture and quietly stopped agreeing — that library marks a node
`pointer-events: none` unless it is selectable, draggable or connectable, so a
read-only node full of links became unclickable. A read-only diagram wants a
viewer, not an editor: there is nothing here to select, drag or connect.

**No layout runs in the browser.** The reachable fold states are enumerable — 30
for the current model, because folding a layer makes its descendants' own states
unobservable — so the build lays out every one of them with ELK and emits the
coordinates as `components/architecture-layouts.ts`. That keeps `elkjs` a
devDependency of this package, never shipped, which matters because it is
EPL-2.0 rather than MIT/Apache.

**It renders without JavaScript.** The server emits a plain inline `<svg>` from
those coordinates, with a real `<a href>` per layer and ELK's routed edges. A
host that never hydrates the island still gets a correct, navigable diagram —
just a fixed one, since folding and panning need a script.

Two props are the host's business, because the bundle cannot know them:

```jsx
<ArchitectureGraph hrefPrefix="/" hrefSuffix=".html" />
```

Markdown links in the pages are rewritten by the host's own pipeline; these are
built in JSX and are not. `hrefSuffix` matches however the host addresses pages —
`.html` for the Starlight consumer, usually empty elsewhere.

### What is drawn, and what is not

Folding re-points every edge at whatever is still visible. Two cases stop being
drawable and are reported on the node as _internal_ instead:

- an edge between two layers folded into the same box, and
- an edge between a layer and something nested inside it — an arrow from a box
  into itself.

Reciprocal pairs are merged into one edge with two arrowheads, keeping both
counts. None of this invents a dependency: an aggregated edge sums real
`fileDependencies`, and an internal count reports real imports.

`src/emit/collapse.ts` holds all of it as pure functions over the model, with
tests. Nothing about folding is decided in the browser.

## Hand-written pages (optional)

`content/` is entirely optional. With no `content/` directory at all, the
generator emits a bundle of generated pages only, and the docs site renders it —
`/` redirects to the generated overview instead of an authored home page. Add
pages when you have something to say that an import graph cannot express; delete
them freely.

Anything in `content/` is copied into the bundle and merged into the same
manifest as the generated pages. Slugs mirror the directory layout; `title`,
`description` and `sidebar_order` come from frontmatter.

### Attaching a page to a layer

By default an authored page sits at the top level, as a standalone narrative
entry. Add `attachTo` and it moves _inside_ the generated tree instead, beneath
the page for the layer it explains:

```yaml
---
title: Memory model
description: Where simulation state actually lives.
attachTo: core.simulation # a layer declared in the source
sidebar_order: 10
---
```

The page's slug becomes `architecture/core/simulation/memory-model`, the layer's
page gains a **Guides** section linking to it, and any host that nests by slug
shows the guide beside the generated reference for the same code.

`attachTo` is not a layer declaration — it references a layer declared in a
package, and CI fails if that layer does not exist. Declaring layers from
`content/` remains forbidden.

Generated pages occupy `sidebar_order` 1000 and above, so within a layer the
attached guides (low numbers) sort ahead of its sub-layers.

### Diagram components

`content/components/` holds React components that authored pages import:

```mdx
import { ByteMap } from "@diagrams/byte-map";

<ByteMap segments={[{ offset: 0, name: "header", type: "64 B fixed" }]} />
```

The `@diagrams/` alias is rewritten to a real relative path at emit time, for
the same reason as `layer:` and `doc:` — a page's depth depends on `attachTo`.
The components ship _inside_ the bundle (`components/`), so a host renders them
from the artefact rather than needing its own copy.

Two rules keep them portable, and both are load-bearing:

- **Plain React, no dependencies.** No design system, no Astro, no `next/*`.
  Styling lives in `components/diagram.css`, which derives its colours from the
  host's `currentColor` so it works on light and dark themes it has never seen.
- **String props, never JSX.** JSX written inside MDX is compiled by the _host's_
  MDX renderer, and passing that to a React component fails at render. Props are
  strings, and `` `backticks` `` render as `<code>`.

This is the one place the bundle asks something of its host: rendering these
pages needs a React-capable MDX pipeline. Generated pages remain plain
CommonMark and need nothing, and `architecture.md` — the single-file artefact
for agents — contains no components at all.

### Linking between pages

Because `attachTo` decides where a page ends up, an authored page cannot know its
own depth and so cannot write a correct relative link by hand. Name the target
instead, and the generator computes the path:

| Syntax                                 | Resolves to                                         |
| -------------------------------------- | --------------------------------------------------- |
| `[text](layer:core.simulation.engine)` | that layer's generated page                         |
| `[text](doc:simulation/memory-model)`  | another authored page, by its path under `content/` |

Fragments are preserved (`layer:core.hir#invariants`). A target that does not
resolve is a build error rather than a broken link nobody notices. Ordinary
relative and absolute links are left untouched, so a top-level page that will
never move can still use them.

Authored pages carry the reasoning — why a boundary is where it is, what was
tried before — which no import graph can supply. They may not declare a layer;
layer declarations belong in the packages.

## What CI enforces

`lint:arch-docs` fails on:

- a source file that no declaration covers
- a layer whose dotted id implies an undeclared ancestor
- a duplicate layer id, or two declarations on one folder
- an unknown `@boundary` kind, a boundary with no note, a duplicated singular tag
- a `@entryPoint` that is not an export of any covered package
- a dependency violating a rule in `architecture.config.ts`
- an `attachTo` naming a layer that does not exist
- a `layer:` or `doc:` link target that does not resolve
- an `@diagrams/` import naming a component that does not exist

Warnings (reported, non-fatal): a layer with no files and no sub-layers, an
`exports` subpath with no resolvable source entry.

## Adding a package

Add it to `packages` in `architecture.config.ts`, declare a root layer in its
source, and run a build. `sourceDirectory` defaults to `src`, so build
configuration outside it is deliberately not part of any layer.
