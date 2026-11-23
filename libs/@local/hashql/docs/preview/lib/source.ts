import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";

// The hand-written pages. The macro resolves `dir` against the working
// directory, which is `preview/`. A host compiles them with its own MDX
// options, so the preview keeps fumadocs' defaults.
const docs = defineDocs({ dir: "../content" });

export const source = loader({
  baseUrl: "/docs/hashql",
  source: docs.toFumadocsSource(),
});
