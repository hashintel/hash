# `@local/archinaut`

Builds an architecture model from annotations in the source and symbol facts
from SCIP indexers, and checks the model on every build.

```sh
archinaut check --config archinaut.config.ts   # report, never write
archinaut build --config archinaut.config.ts   # write <outputDirectory>/architecture.json
```

The pipeline is four stages over plain data: `scan` reads `@layerRoot`,
`@role` and `@talksTo` from doc comments and README frontmatter and resolves
every source file to a layer; `index` runs scip-typescript and scip-python per
package, cached under `cacheDirectory` by the package's source listing;
`model` turns symbol references into file dependencies, aggregates them to
layer edges and adds the declared ones; `check` fails the build on an
undeclared ancestor, a violated rule, a rule that cannot fire, or a layer no
file resolves to.

A reference resolves to the file that defines the symbol, so an edge lands on
the defining layer rather than on the barrel that re-exported it. Cross-package
references resolve to sources through a generated tsconfig that maps each
covered package's `exports` to its source entries.

Python edges are the union of what scip-python resolves and what the
import-statement scan in `src/index/python-imports.ts` finds, because the
indexer leaves some workspace imports unresolved.

Hand-written content, the bundle emitter, the dev server and the site follow
in later increments; until then `@local/petrinaut-arch-docs` keeps producing
the bundle, and its `archinaut.config.ts` is the first instance of this tool.
