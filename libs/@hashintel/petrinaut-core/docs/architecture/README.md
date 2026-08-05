# Illustrated simulation architecture

Hand-written, self-contained HTML pages covering the simulation internals in
detail: memory layouts, sequence diagrams and the worker protocol. Open them in
a browser.

| Page                                     | Covers                            |
| ---------------------------------------- | --------------------------------- |
| [`index.html`](./index.html)             | The two execution paths, overview |
| [`engine.html`](./engine.html)           | Stepping, frame layout, memory    |
| [`authoring.html`](./authoring.html)     | Compiling user code               |
| [`worker.html`](./worker.html)           | Worker protocol and backpressure  |
| [`monte-carlo.html`](./monte-carlo.html) | Bounded-memory batch runs         |

## Relationship to the generated architecture docs

These pages predate the generated architecture bundle and are **not** covered by
its drift checks — nothing verifies them against the code, so treat them as
explanatory background rather than ground truth.

For facts about the current shape of the system — which layers exist, what
depends on what, where the boundaries are — use the generated docs instead:

```sh
yarn workspace @apps/petrinaut-docs dev
```

The generated model lives in
[`libs/@local/petrinaut-arch-docs/bundle/`](../../../../@local/petrinaut-arch-docs/bundle),
and its `architecture.md` is the whole architecture in one file.

The diagrams that used to be generated into this folder
(`petrinaut-dependencies.svg` and `petrinaut-compilation-dependencies.svg`) were
produced from a hand-maintained path→layer mapping and have been replaced by the
bundle's diagrams, which derive their grouping from annotations in the source.

These pages are worth migrating into authored MDX in
`libs/@local/petrinaut-arch-docs/content/` so they sit alongside the generated
reference; that has not been done, because their custom lane-and-box CSS needs
rewriting page by page.
