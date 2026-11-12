# HashQL documentation

- `content/` holds the hand-written pages as MDX. The site that publishes them compiles them with its own MDX options and supplies their components. Beyond Fumadocs' defaults, the pages use `Accordion`, `Accordions`, `Callout`, `Tabs` and `Tab` (with `groupId`, `persist` and `defaultIndex`), `SideBySide`, which sets its children beside each other and stacks them in a narrow article, and `Result`, which shows a program's result when opened (`kind` is `"output"` or `"error"`, and `expected` marks a result that wasn't recorded from a run). `preview/components/mdx.ts` is the preview's set.
- `content/index.mdx` introduces the language. `content/sdk/typescript/` holds the TypeScript guides and cheatsheet. Its root-folder metadata enables Fumadocs' SDK selector. The generated TypeScript API reference is mounted at `sdk/typescript/reference` alongside those guides.
- `preview/` is a local Next.js app that renders those pages with Fumadocs.
- `reference/` holds the language reference, HashQL's intended behavior written in Typst. The current implementation may differ or may not yet support the features described.

## Preview

From the repository root, start the preview:

```sh
mise exec -- turbo run dev --filter=@local/hashql-docs
```

Open <http://127.0.0.1:4323/docs/hashql>. `PORT` moves it to another port.

## Language reference

From the repository root, start continuous compilation:

```sh
mise exec -- turbo run dev:reference --filter=@local/hashql-docs
```

Open `libs/@local/hashql/docs/reference/dist/index.html` in a browser. Reload it after edits.
