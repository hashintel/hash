# HashQL documentation

- `content/` holds the hand-written pages as MDX. The site that publishes them compiles them with its own MDX options.
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
