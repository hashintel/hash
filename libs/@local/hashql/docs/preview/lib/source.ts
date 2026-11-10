import { Struct } from "effect";
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { loader } from "fumadocs-core/source";
import { applyMdxPreset } from "fumadocs-mdx/config";
import { defineDocs } from "fumadocs-mdx/macro";
import { createElement } from "react";

import * as Source from "../../src/Source.js";

import type * as Location from "../../src/Location.js";
import type * as PageTree from "fumadocs-core/page-tree";
import type { ReactNode } from "react";

// The macro resolves `dir` against `preview/`. Collection options replace the defaults, so the preset keeps headings, code tabs and highlighting alongside Mermaid.
const docs = defineDocs({
  dir: "../content",
  docs: {
    mdxOptions: applyMdxPreset({ remarkPlugins: [remarkMdxMermaid] }),
  },
});

/** The directory the reference's pages go in. */
const dir = "sdk/typescript/reference";

// No commit names the working tree the preview builds. A declaration links to its line on the main branch.
const sourceUrl = ({ file, line }: Location.Location): string =>
  `https://github.com/hashintel/hash/blob/main/${file}#L${line}`;

/** A name in the navigation, set in monospace as the reference's code is. */
const codeName = (name: ReactNode): ReactNode =>
  createElement("span", { className: "api-nav-name" }, name);

export const source = loader({
  baseUrl: "/docs/hashql",
  source: await Source.withHast(docs.toFumadocsSource(), [
    { dir, load: Source.loader({ sourceUrl }) },
  ]),
  pageTree: {
    transformers: [
      {
        file(node, path): PageTree.Item {
          if (path?.startsWith(`${dir}/`) !== true) {
            return node;
          }

          return Struct.evolve(node, { name: codeName });
        },
        // The reference's own folder keeps its title, and every folder below it is an entrypoint or a module.
        folder(node, path): PageTree.Folder {
          if (!path.startsWith(`${dir}/`)) {
            return node;
          }

          return Struct.evolve(node, { name: codeName });
        },
      },
    ],
  },
});
