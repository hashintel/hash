# `@local/petrinaut-arch-docs`

The Petrinaut instance of [archinaut](../archinaut/README.md): the config in
`archinaut.config.ts`, the hand-written pages under `content/`, and the logo
and favicon the site shows.

```sh
yarn workspace @local/petrinaut-arch-docs lint:arch-docs     # check the annotations, write nothing
yarn workspace @local/petrinaut-arch-docs doc:architecture   # write bundle/
yarn workspace @apps/petrinaut-docs dev                       # serve the site and rebuild on change
```

The layer taxonomy is declared in the packages themselves, as `@layerRoot`
annotations and README frontmatter; this package holds only what the code
cannot say. `bundle/` is build output and is not committed.

## Hand-written pages

Anything under `content/` is copied into the bundle and merged into the same
manifest as the generated pages. A page with `attachTo: <layer id>` in its
frontmatter sits beneath that layer's generated page; links between pages use
`[text](layer:core.simulation)` and `[text](doc:simulation/memory-model)`, and
diagram components and D2 sources under `content/components/` and
`content/diagrams/` are imported as `@diagrams/<name>`. The archinaut README
holds the full contract.
