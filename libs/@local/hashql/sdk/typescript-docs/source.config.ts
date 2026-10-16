import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { transformerTwoslash } from "fumadocs-twoslash";

import { referenceTwoslash } from "./lib/reference-twoslash";

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
              module: "ESNext",
              moduleResolution: "Bundler",
            },
          },
        }),
        referenceTwoslash(),
      ],
    },
  },
});
