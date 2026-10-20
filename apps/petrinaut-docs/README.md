# `@apps/petrinaut-docs`

The Vercel project behind docs.petrinaut.org. It owns no code: `build` and
`dev` run [archinaut](../../libs/@local/archinaut/README.md) with the Petrinaut
config in `libs/@local/petrinaut-arch-docs`, which generates the bundle and
builds or serves the site shipped with the tool.

```sh
yarn workspace @apps/petrinaut-docs dev     # http://localhost:4322, rebuilds on change
yarn workspace @apps/petrinaut-docs build   # dist/
```

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
