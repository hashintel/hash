// fumadocs-mdx's declarations import `mdx/types`. `@types/mdx` has no
// `exports` map, so NodeNext resolution can't find that path, and a page's
// `body` would be `any`. The path with an extension resolves.
declare module "mdx/types" {
  export type * from "mdx/types.js";
}
