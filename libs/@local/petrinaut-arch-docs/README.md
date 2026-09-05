# `@local/petrinaut-arch-docs`

Generates the Petrinaut architecture documentation from annotations in the
source, and bundles it with hand-written MDX into one portable artefact.

```sh
# Regenerate the bundle after changing annotations or code
yarn workspace @local/petrinaut-arch-docs doc:architecture

# Check the annotations without writing anything
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
  that nothing verified against the code. #9205 moves its content into authored
  MDX under `content/simulation/`, where it sits beside the generated pages.

Here the architecture is declared next to the code it describes, and the build fails
when a declaration stops matching reality.

## Declaring a layer

A declaration is two lines — an id and a one-line role:

```ts
/**
 * @layerRoot core.simulation.monte-carlo
 * @role Runs many simulations with bounded frame memory
 */
```

`@layerRoot` names the layer this folder _and its descendants_ form; `@role`
says what it is for. Between them they place a node in the graph and label it.
One more tag, `@talksTo`, declares an edge no import produces (see below). That
is the whole vocabulary, because anything more would be a claim the generator
cannot check.

Tags are read from any block comment, only at the start of a line, so mentioning
`@layerRoot` in prose declares nothing. A tag's text wraps across lines until the
next tag or a blank line. Any other tag is ignored — `@param`, `@deprecated`
and the rest are someone else's business — except a miscasing of one of these
three, which is reported as a probable typo.

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
---
```

`layer` and `role` are the only keys, and an unknown one alongside them fails
the build rather than being ignored — a misspelled `role` would otherwise leave
the layer with no responsibility statement and no complaint.

Use one or the other on a folder, never both. A README with no `layer` key is
left alone as an ordinary document, and is linked from its layer page under
"Further reading".

Layer ids are dotted and hierarchical, and every ancestor must itself be
declared — `core.simulation.monte-carlo` requires `core.simulation` and `core`.

### Declaring a protocol edge

Some dependencies cross no import: the Python bindings spawn the CLI and speak
JSON lines to it over stdio. `@talksTo` records such an edge, in the same doc
comment or docstring the scanner already reads:

```python
"""One Petrinaut CLI process, spoken to over JSON lines on stdio.

@talksTo cli via JSON lines over stdio (spawned subprocess)
"""
```

The declaring file's own layer is the edge source, the id before `via` is the
target, and the text after `via` is required and becomes the edge label. The
tag is repeatable. Declared edges render dashed with their protocol in every
diagram that shows the pair, and the relations card on a layer page marks them
with a dashed protocol label, apart from the edges aggregated from imports.

The build fails when the target is not a declared layer, and when the pair is
already derived from imports; remove the declaration in the second case, since
the imports already prove the edge. A layer rule applies to a declared edge as
it does to an imported one: a rule states which layers may couple, whatever
carries the coupling.

### Inheritance is what keeps this small

A file with no tags belongs to the nearest ancestor folder that declares a layer.
That is why 58 declarations cover 555 files: you declare a layer where the
architecture actually changes, not on every file.

## The output: a portable bundle

Written to `bundle/`, which is **git-ignored build output** — it is derived
entirely from the annotations and from `content/`, so committing it would mean
reviewing the same change twice and resolving conflicts in generated files.
Regenerate it whenever you need it; nothing depends on a stored copy.

The bundle is framework-neutral by design — the Starlight site in
`apps/petrinaut-docs` and hash.dev are both just consumers.

| File                | What it is                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `architecture.json` | The model: layers, edges, enforced rules                                                                      |
| `architecture.md`   | The whole architecture as one file — the cheapest read for an AI                                              |
| `manifest.json`     | Page tree for building navigation without crawling `pages/`                                                   |
| `pages/**.mdx`      | Generated layer pages, plus authored pages merged in                                                          |
| `components/*.tsx`  | React components: the layer card components every bundle ships, plus diagram components authored pages import |
| `diagrams/**.d2`    | Diagram sources (diffable)                                                                                    |
| `diagrams/**.svg`   | Rendered diagrams                                                                                             |

**Generated** MDX is YAML frontmatter plus CommonMark, with one exception: each
layer page imports the bundle's `LayerFacts` and `LayerRelations` cards and
passes its facts and edges as structured props, so a host restyles the cards
rather than re-parsing prose. The same facts stay plain text in
`architecture.md`, the cheapest read for an agent.

**Authored** pages may additionally import the bundle's diagram components.
Together that is every requirement the bundle places on a host:

| A host must provide          | For                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------- |
| A React-capable MDX pipeline | Generated layer pages, and any authored page that imports a diagram component |

Nothing else — in particular nothing hydrates, so no client-side runtime is
required. In particular the bundle asks for **no Markdown or Rehype
plugins** — a host renders it with its Markdown pipeline exactly as configured,
which is what keeps "render the bundle" a small job rather than a negotiation.

### Source links

Generated pages link back to the source they describe: each layer's "Declared
in" link, its source root, its further-reading list, and any relative link in a
declaring README's prose. Those URLs carry a git ref, resolved once per build
from the first of these variables that holds a value:

| Variable                         | Set by                        |
| -------------------------------- | ----------------------------- |
| `PETRINAUT_ARCH_DOCS_SOURCE_REF` | You, overriding the rest      |
| `VERCEL_GIT_COMMIT_SHA`          | Vercel                        |
| `GITHUB_SHA`                     | GitHub Actions                |
| `VERCEL_GIT_COMMIT_REF`          | Vercel (branch name)          |
| `GITHUB_HEAD_REF`                | GitHub Actions (pull request) |
| `GITHUB_REF_NAME`                | GitHub Actions (push)         |

A commit SHA beats a branch name, because the link still resolves once the
branch has moved on or been deleted. The branch-name fallbacks assume the
branch lives in `hashintel/hash`: on a pull request from a fork,
`GITHUB_HEAD_REF` names a branch this repository does not have, so those links
404 — the SHA variables, which win when present, resolve regardless. With none of them set the ref is `main`,
which is what a local build gets; set `PETRINAUT_ARCH_DOCS_SOURCE_REF` to aim a
local build at another ref. A preview deployment of `apps/petrinaut-docs`
reads Vercel's variables, so its links point at the commit it was built from
instead of at a file `main` may not have yet.

### Highlighting changes against a base ref

A build can compare itself against another version of the repository and mark
what differs, which is how a PR preview shows a reviewer where to look:

```sh
# Locally
yarn workspace @local/petrinaut-arch-docs doc:architecture --diff-base main

# In CI (what vercel-build.sh sets on preview deployments)
PETRINAUT_ARCH_DOCS_DIFF_BASE=<ref> turbo build --filter '@apps/petrinaut-docs'
```

Which ref to compare against is the caller's decision, not this package's: the
generator takes any ref and never knows about pull requests. On Vercel
previews, `apps/petrinaut-docs/scripts/resolve-diff-base.mjs` resolves the
PR's _target branch_ (via the GitHub API, anonymously) and sets the variable —
so a stacked PR is compared against the PR below it and shows only its own
delta, and a PR targeting `main` is compared against `main`.

The build extracts the covered package trees at the base ref with `git archive`
and runs the _same_ generator over them — same config, same emitter, same
source-URL prefix — so nothing but a real change can differ between the two
sides. No install and no `node_modules` are needed for the base tree: workspace
imports resolve through aliases derived from each package's `exports` map.

What it produces:

- `manifest.json` gains a `diff` section mapping page slugs to `added`,
  `changed` or `removed`, for a host to build navigation badges from.
- Changed pages carry `<DiffMarker>` elements between blocks; the shipped
  `diff-marker` component and its stylesheet render a green bar on added
  blocks, a blue bar on edited ones, and removed content as a red, collapsed
  block in place.
- A removed page becomes a tombstone stub at its old slug, carrying the
  removed source, so navigation can show it (struck through) instead of it
  silently disappearing.

**What counts as a change** is deliberately narrower than a byte diff, because
a generated page embeds facts that shift whenever _neighbouring_ code moves.
Masked before comparison: import counts and the count-driven ordering of the
depends-on list, file and line totals, sidebar positions, and the whole
"depended on by" list — an incoming edge is the
importing layer's change and is flagged there, on its `dependsOn` side. A page
is `changed` when anything else differs: its role, prose, name, declaring
file, outgoing edges, sub-layers, attached guides — or when the layer's file
membership moved, the one structural change the masked content cannot show.
Editing code inside a layer without moving files or edges changes nothing the
architecture describes, and flags nothing.

The build extracts the base tree from the local clone when it can. When it
cannot — a Vercel build gets a snapshot of the sources with no usable clone
behind it — it fetches the ref anonymously from the public repository
(`VERCEL_GIT_REPO_OWNER`/`VERCEL_GIT_REPO_SLUG` when set, `hashintel/hash`
otherwise) into a scratch repository: a blobless fetch plus a sparse checkout
of only the covered directories, so the transfer stays small. The build log
says `base tree fetched from …` when this path ran.

The built base side is cached under `node_modules/.cache/petrinaut-arch-docs`
(`PETRINAUT_ARCH_DOCS_CACHE_DIR` relocates it, for a CI whose persisted
location differs),
keyed in the entry's file name by a hash of the generator's own sources,
config and pinned dependencies, then the base commit — CI providers persist
that directory between builds, so any later commit whose base has not moved
skips the base build entirely (the log says `base bundle from cache (…)`),
and builds running different generator versions against one base keep
separate entries. Every clean build also stores its _own_ side as a future
base: the CI cache is restored per branch with a fallback to the production
deployment, so the entry a `main` build writes is what a PR targeting `main`
finds on its first build — the common case computes no base at all. A cached entry is trusted exactly as far as the build that
wrote it — its pages are compiled as MDX — which is sound while only this
project's own builds write the directory; a shared remote cache would need
this analysis redone. Source-link URLs carry the built
commit and are masked per side before comparison, which is what makes a base
side built by an earlier build comparable at all.

The diff decorates the bundle, it never gates it: when the base ref cannot be
resolved either way (no network, a repository that is not public) the build
warns and writes a plain bundle. Production builds of `main` never set the
variable, so they never diff.

### Embedding the bundle elsewhere

A host reads `manifest.json`, maps each page's `slug` onto its own URL space, and
renders `pages/<path>`.

One contract to honour: **links between generated pages are relative and assume
slugs map to URLs without a trailing slash.** A host that serves
`/architecture/core/simulation/` rather than `/architecture/core/simulation`
must rewrite them; `manifest.json` gives you every slug to do so. The Starlight
consumer sets `trailingSlash: "never"` for this reason.

## Diagrams

Diagrams are D2, rendered to SVG at build time. Three kinds, each bounding its
node count a different way, because a node-link diagram stops being readable
somewhere around twenty boxes:

| Diagram       | Shows                                           | Bounded by         |
| ------------- | ----------------------------------------------- | ------------------ |
| `overview`    | The top-level layers                            | Roots              |
| `around/<id>` | What a layer depends on, and what depends on it | The layer's degree |
| `within/<id>` | A layer's direct children                       | Its fan-out        |

Every layer gets an `around/` diagram, leaves included — those are where readers
land, and "what does this touch" is the question they arrive with. Only layers
with sub-layers get a `within/` one.

A neighbourhood draws only edges _incident to the focus_. Edges among the
neighbours are real but belong to those layers' own pages; drawing them rebuilds
the tangle the overview exists to avoid.

Aggregation never invents a dependency: an import edge appears because imports
exist, and its count sums real `fileDependencies`. A `@talksTo` edge is the one
annotation-drawn kind, and it is always dashed with its protocol as the label,
so the two kinds cannot be confused. Neighbours are capped at twelve, and
the remainder becomes a single dashed "+N further layers" node carrying their
combined count — elided where it would be unreadable, never dropped where it
would read as absent.

Names are namespaced by directory rather than by prefix: a layer id is unique
only among layer ids, so a flat `around-<id>` would collide with a top-level
layer actually called `around-something`.

### How they are rendered

`d2` runs with the Inter faces vendored in `fonts/`, and with padding well under
its 100px default. The font is not decoration: `d2` measures every label with
the face it renders with and sizes the boxes from that, so a diagram drawn in
one face and shown in another has labels that no longer fit their boxes. The
faces are Inter, under the SIL Open Font License 1.1, whose text sits beside
them.

Every colour in a rendered SVG is then restated as a custom property, so a host
can retheme a diagram without this package knowing anything about that host's
themes:

```css
:root[data-theme="dark"] {
  --pnd-diagram-n1: #f3f3f3; /* d2's strongest foreground */
  --pnd-diagram-n7: transparent; /* the drawing's own background */
  --pnd-diagram-core-fill: #16273a;
}
```

Each property carries the colour `d2` drew as its fallback, so a host that
defines none of them renders exactly what it always did. The rules are appended
as a stylesheet rather than written into the markup, because `var()` is not
reliably honoured inside SVG presentation attributes but is honoured in a
declaration that overrides them.

Reaching those properties needs the SVG inlined into the page: behind an `<img>`
it is a separate document and nothing on the page reaches it. The bundle still
emits a plain markdown image, which is what keeps it portable; a host that wants
themed diagrams inlines them itself. `apps/petrinaut-docs` does this in a rehype
plugin, and is worth copying from.

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
package, and the build fails if that layer does not exist. Declaring layers from
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

### Hand-written D2 diagrams

`content/diagrams/` holds `.d2` sources. The build renders each to SVG in the
bundle's `diagrams/` directory, next to the generated ones, and authored pages
embed them as images:

```mdx
![One request through the CLI](@diagrams/cli-request-flow.svg)
```

An unknown name, or a name colliding with a generated diagram, fails the
check.

### Linking between pages

Because `attachTo` decides where a page ends up, an authored page cannot know its
own depth and so cannot write a correct relative link by hand. Name the target
instead, and the generator computes the path:

| Syntax                                 | Resolves to                                         |
| -------------------------------------- | --------------------------------------------------- |
| `[text](layer:core.simulation.engine)` | that layer's generated page                         |
| `[text](doc:simulation/memory-model)`  | another authored page, by its path under `content/` |

Fragments are preserved (`layer:core.hir#sub-layers`). A target that does not
resolve is a build error rather than a broken link nobody notices. Ordinary
relative and absolute links are left untouched, so a top-level page that will
never move can still use them.

Authored pages carry the reasoning no import graph can supply: why a boundary is
where it is, and what was tried before. They may not declare a layer; layer
declarations belong in the packages.

## What the checks enforce

These run on every build of the bundle: `doc:architecture` refuses to write while
any of them fails. `lint:arch-docs` runs the same checks and reports without
writing, which is the form to reach for in a pre-commit hook or a CI step. Either
fails on:

- a source file that no declaration covers
- a source file the import graph reached that no layer claims, which means the
  extractor and the graph disagree about what is in scope
- a layer whose dotted id implies an undeclared ancestor
- a duplicate layer id, or two declarations on one folder
- a duplicated singular tag, a tag with no value, or an unknown key in a
  declaring README
- a package configured for a language with no extractor
- an `exports` subpath with no resolvable source entry, since imports through it
  would be missing from the graph
- a rule naming a layer that does not exist, which would leave it inert
- a dependency violating a rule in `architecture.config.ts`
- an `attachTo` naming a layer that does not exist
- a `layer:` or `doc:` link target that does not resolve
- an `@diagrams/` import naming a component that does not exist

The last four in the graph group exist because each failure removes coverage
rather than adding a visible error. An `exports` subpath that stops resolving, or
a rule with a typo, leaves a build that passes while checking less than it
claims.

Warnings (reported, non-fatal): a layer with no files and no sub-layers, an
`exports` subpath with no resolvable source entry.

## Adding a package

Add it to `packages` in `architecture.config.ts`, declare a root layer in its
source, and run a build. `sourceDirectory` defaults to `src`, so build
configuration outside it is deliberately not part of any layer.
