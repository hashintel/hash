import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";
import { createElement } from "react";

import { loader as reference, withHast } from "../../lib/source.js";

import type { Location } from "../../lib/Location.js";
import type * as PageTree from "fumadocs-core/page-tree";
import type { ReactNode } from "react";

// The hand-written pages. The macro resolves `dir` against the working
// directory, which is `preview/`. A host compiles them with its own MDX
// options, so the preview keeps fumadocs' defaults.
const docs = defineDocs({ dir: "../content" });

/** The directory the reference's pages go in. */
const dir = "reference";

// No commit names the working tree the preview builds. A declaration links to its line on the main branch.
const sourceUrl = ({ file, line }: Location): string =>
  `https://github.com/hashintel/hash/blob/main/${file}#L${line}`;

/** A name in the navigation, set in monospace as the reference's code is. */
const codeName = (name: ReactNode): ReactNode =>
  createElement("span", { className: "api-nav-name" }, name);

export const source = loader({
  baseUrl: "/docs/hashql",
  source: await withHast(docs.toFumadocsSource(), [
    { dir, load: reference({ sourceUrl }) },
  ]),
  pageTree: {
    transformers: [
      {
        file(node, path): PageTree.Item {
          if (path?.startsWith(`${dir}/`) !== true) {
            return node;
          }

          return { ...node, name: codeName(node.name) };
        },
        // The reference's own folder keeps its title, and every folder below it is an entrypoint or a module.
        folder(node, path): PageTree.Folder {
          if (!path.startsWith(`${dir}/`)) {
            return node;
          }

          return { ...node, name: codeName(node.name) };
        },
      },
    ],
  },
});
