import { readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { transformerTwoslash } from "fumadocs-twoslash";

import { referenceLinks } from "./lib/reference-links.js";

// Signature blocks compile against the declaration files `doc:declarations` emits, which they name through `#declarations/`.
const ApiConfig = Schema.fromJsonString(
  Schema.Struct({ compilerOptions: Schema.Struct({ outDir: Schema.String }) }),
);
const declarations = path.resolve(
  Schema.decodeSync(ApiConfig)(readFileSync("tsconfig.api.json", "utf8"))
    .compilerOptions.outDir,
);

export const docs = defineDocs({
  dir: "content/docs",
  docs: { compiler: "satteri" },
});

export default defineConfig({
  compiler: "satteri",
  satteriOptions: {
    rehypeCodeOptions: {
      themes: { light: "github-light", dark: "github-dark" },
      langs: ["js", "jsx", "ts", "tsx"],
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash({
          twoslashOptions: {
            compilerOptions: {
              types: ["node"],
              paths: { "#declarations/*": [`${declarations}/*`] },
            },
          },
          // Hovers show the compiler's types. The page beside them carries the documentation.
          rendererRich: { jsdoc: false },
        }),
        referenceLinks(),
      ],
    },
  },
});
