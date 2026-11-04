# `@apps/petrinaut-docs`

The Petrinaut instance of [archinaut](../../libs/@local/archinaut/README.md)
and the Vercel project behind docs.petrinaut.org: the config in
`archinaut.config.ts`, the hand-written pages under `content/`, the logo and
favicon the site shows, and the deployment scripts.

```sh
yarn workspace @apps/petrinaut-docs lint:arch-docs     # check the annotations, write nothing
yarn workspace @apps/petrinaut-docs doc:architecture   # write bundle/
yarn workspace @apps/petrinaut-docs dev                # http://localhost:4322, rebuilds on change
yarn workspace @apps/petrinaut-docs build              # dist/
```

The layer taxonomy is declared in the packages themselves, as `@layerRoot`
annotations and README frontmatter; this package holds only what the code
cannot say. `bundle/` and `dist/` are build output and are not committed.

## Hand-written pages

A guide about a layer is an `.mdx` file beside that layer's code, rendered
beneath the layer's generated page. Anything under `content/` is copied into
the bundle and merged into the same manifest, for the pages about the docs
themselves. Links between pages use `[text](layer:core.simulation)` and
`[text](doc:core.simulation/memory-model)`; a D2 diagram sits beside its page,
or under `content/diagrams/` as `@diagrams/<name>.svg` when pages share it;
formulas go between `$` signs and KaTeX renders them when the site builds.
The archinaut README holds the full contract.

## Deployment

Vercel builds from [`vercel.json`](vercel.json), which runs
[`vercel-install.sh`](vercel-install.sh) then [`vercel-build.sh`](vercel-build.sh).
Both `cd ../..` and build from the repo root, so the Vercel project sets
**Root Directory** to `apps/petrinaut-docs` and enables **Include files
outside of the Root Directory in the Build Step**.

Preview deployments highlight what the branch changes against its base:
`vercel-build.sh` resolves the PR's target branch with
[`scripts/resolve-diff-base.mjs`](scripts/resolve-diff-base.mjs) (falling
back to `main`) and sets `ARCHINAUT_DIFF_BASE`, so a stacked PR shows only
its own delta. Production builds of `main` never diff. The header chips naming
the two sides are resolved in the site from the manifest and Vercel's
variables.

The site is served from `docs.petrinaut.org` and is internal, so reaching it
needs access. The canonical URL is the `site.url` of the archinaut config.
