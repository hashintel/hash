/**
 * Links in authored pages: relative README links made absolute, `doc:` and
 * `layer:` targets resolved to bundle pages, component imports and diagram
 * images resolved against the page's final slug. Fenced blocks and code
 * spans are left as written, since pages that document these schemes show
 * them in examples.
 */

import { posix } from "node:path";

import { assetPathFrom, relativeTo } from "./shared/page-paths";

export const rewriteRelativeLinks = (
  prose: string,
  declaredIn: string,
  sourceUrlPrefix: string,
): string => {
  const baseDirectory = posix.dirname(declaredIn);

  return prose.replace(
    /(!?\[[^\]]*\])\(([^)\s]+)(\s+"[^"]*")?\)/gu,
    (match, label: string, target: string, title: string | undefined) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu.test(target)) {
        return match;
      }

      const [path = "", fragment] = target.split("#");

      if (path === "") {
        return match;
      }

      const resolved = posix.normalize(posix.join(baseDirectory, path));

      // A link that escapes the repository root cannot be made absolute.
      if (resolved.startsWith("..")) {
        return match;
      }

      return `${label}(${sourceUrlPrefix}${resolved}${fragment === undefined ? "" : `#${fragment}`}${title ?? ""})`;
    },
  );
};

/**
 * Relative link from one bundle page to another, so the bundle works when
 * mounted at any base path.
 *
 * Resolved against the *slug* — page links are followed in URL space by a
 * reader, and assume slugs map to URLs without a trailing slash.
 */

const outsideCode = (
  contents: string,
  rewrite: (text: string) => string,
): string =>
  contents
    .split(/(```[\s\S]*?```|`[^`\n]*`)/gu)
    .map((part, index) => (index % 2 === 1 ? part : rewrite(part)))
    .join("");

/**
 * Resolves `doc:` and `layer:` link targets in authored pages.
 *
 * An authored page's final slug depends on its `attachTo`, so it cannot know
 * its own depth and therefore cannot write a correct relative link by hand.
 * These two schemes let a page name its target and have the path computed:
 *
 * - `[text](layer:core.simulation.engine)` → that layer's generated page
 * - `[text](doc:two-execution-paths)` → another authored page, by its file slug
 *
 * Unresolvable targets are reported rather than silently emitted, because a
 * broken link here is invisible until someone clicks it.
 */
export const resolveAuthoredLinks = (
  contents: string,
  fromSlug: string,
  options: {
    layerSlugs: Map<string, string>;
    docSlugs: Map<string, string>;
  },
): { contents: string; unresolved: string[] } => {
  const unresolved: string[] = [];

  const resolved = outsideCode(contents, (text) =>
    text.replace(
      /(\]\()(layer|doc):([^)\s#]+)(#[^)\s]*)?(\))/gu,
      (
        match,
        open: string,
        scheme: string,
        target: string,
        fragment: string | undefined,
        close: string,
      ) => {
        const slug =
          scheme === "layer"
            ? options.layerSlugs.get(target)
            : options.docSlugs.get(target);

        if (slug === undefined) {
          unresolved.push(`${scheme}:${target}`);
          return match;
        }

        return `${open}${relativeTo(fromSlug, slug)}${fragment ?? ""}${close}`;
      },
    ),
  );

  return { contents: resolved, unresolved };
};

/**
 * Rewrites `@diagrams/x` import specifiers to a path relative to the page.
 *
 * Same problem as `layer:`/`doc:` links: a page's depth depends on its
 * `attachTo`, so it cannot write a correct relative import by hand. Authors use
 * a stable alias and the real path is computed at emit time.
 */
export const resolveComponentImports = (
  contents: string,
  fromSlug: string,
  available: Set<string>,
): { contents: string; unresolved: string[] } => {
  const unresolved: string[] = [];
  const fromDirectory = posix.dirname(`pages/${fromSlug}`);

  const resolved = outsideCode(contents, (text) =>
    text.replace(
      /(["'])@diagrams\/([^"']+)\1/gu,
      (match, quote: string, name: string) => {
        if (!available.has(name)) {
          unresolved.push(`@diagrams/${name}`);
          return match;
        }

        const target = posix.relative(fromDirectory, `components/${name}`);
        return `${quote}${target.startsWith(".") ? target : `./${target}`}${quote}`;
      },
    ),
  );

  return { contents: resolved, unresolved };
};

/**
 * Rewrites `![alt](@diagrams/x.svg)` image references in authored pages to the
 * bundle's rendered SVG, relative to the page file. Same rationale as
 * `resolveComponentImports`: the page cannot know its own depth.
 *
 * With `emit` false the whole image is dropped, matching how generated pages
 * omit their diagrams when no renderer is available. An unknown name is
 * reported either way, so a typo still fails the check.
 */
export const resolveDiagramImages = (
  contents: string,
  fromSlug: string,
  available: Set<string>,
  emit = true,
): { contents: string; unresolved: string[] } => {
  const unresolved: string[] = [];

  const resolved = outsideCode(contents, (text) =>
    text.replace(
      /!\[([^\]]*)\]\(@diagrams\/([^)\s]+?)\.svg\)(\n?)/gu,
      (match, alt: string, name: string, newline: string) => {
        if (!available.has(name)) {
          unresolved.push(`@diagrams/${name}.svg`);
          return match;
        }
        if (!emit) {
          return "";
        }
        return `![${alt}](${assetPathFrom(fromSlug, `diagrams/${name}.svg`)})${newline}`;
      },
    ),
  );

  return { contents: resolved, unresolved };
};

/** One row of the relations card, mirroring `LayerRelation` in the component. */

/**
 * Resolves `.d2` references a page makes relative to its own source file, as
 * an image (`![alt](./flow.d2)`) or as a component (`import Flow from
 * "./flow.d2"`). Both become the rendered SVG in the bundle: the image stays
 * a plain Markdown image any host renders; the import becomes an SVG import,
 * which a host that turns SVG files into components, as Astro does, inlines.
 * Without a renderer the image is dropped and the component renders nothing.
 */
export const resolveLocalDiagrams = (
  contents: string,
  fromSlug: string,
  sourceFile: string,
  /** Repo-relative `.d2` source file → the bundle's diagram name. */
  diagramsBySource: Map<string, string>,
  emit = true,
): { contents: string; unresolved: string[] } => {
  const unresolved: string[] = [];
  const directory = posix.dirname(sourceFile);
  const nameOf = (target: string): string | null => {
    const file = posix.normalize(posix.join(directory, target));
    const name = diagramsBySource.get(file);
    if (name === undefined) {
      unresolved.push(target);
      return null;
    }
    return name;
  };
  const asset = (name: string): string =>
    assetPathFrom(fromSlug, `diagrams/${name}.svg`);

  const resolved = outsideCode(contents, (text) =>
    text
      .replace(
        /!\[([^\]]*)\]\((\.{1,2}\/[^)\s]+?\.d2)\)(\n?)/gu,
        (match, alt: string, target: string, newline: string) => {
          const name = nameOf(target);
          if (name === null) {
            return match;
          }
          return emit ? `![${alt}](${asset(name)})${newline}` : "";
        },
      )
      .replace(
        /^import\s+(\w+)\s+from\s+"(\.{1,2}\/[^"]+?\.d2)";?$/gmu,
        (match, binding: string, target: string) => {
          const name = nameOf(target);
          if (name === null) {
            return match;
          }
          return emit
            ? `import ${binding} from "${asset(name)}";`
            : `export const ${binding} = () => null;`;
        },
      ),
  );
  return { contents: resolved, unresolved };
};
