/**
 * Generates the published docs surface under `dist/docs` after `tsup` has
 * built the component and doc-block entries:
 *
 * - `dist/docs/mdx/<slug>.mdx` — each `src/components/*\/*.docs.mdx` page as
 *   portable MDX for MDX-native documentation sites (e.g. fumadocs). Per
 *   page: the Storybook `Meta` import and `<Meta title>` element are
 *   dropped; relative imports are rewritten to published package specifiers
 *   (`@hashintel/ds-components/<component>` and
 *   `@hashintel/ds-components/docs/blocks/<block>`); each `<Stage>`'s Code
 *   tab source is baked in as a literal `code` attribute (and `data-harness`
 *   markers are stripped) by running the same extraction Storybook applies at
 *   compile time (`.storybook/remark-stage-code.ts`), so consumers need no
 *   custom remark plugin; the `meta` export is duplicated into YAML
 *   frontmatter (the export itself stays because page bodies reference it,
 *   e.g. `meta.links.source`); and the leading `# Title` heading and its
 *   description paragraph are dropped when they duplicate the frontmatter,
 *   which frontmatter-driven sites render themselves.
 * - `dist/docs/blocks/<name>.d.ts` — hand-maintained declarations for the
 *   doc-block entry points (tsc's declaration build is rooted at `src/`, so
 *   it cannot emit for `docs/blocks`; types are loosened where they would
 *   otherwise reach into component internals, e.g. IconName → string).
 *
 * Each page is verified end-to-end: the transformed MDX is compiled with
 * @mdx-js/mdx (mirroring a consumer pipeline) and server-rendered against
 * the published entry points, which is also where the `meta` object for the
 * frontmatter comes from.
 */
import {
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { compile } from "@mdx-js/mdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { VFile } from "vfile";

import { remarkStageCode } from "../.storybook/remark-stage-code";
import { fileImportSpecifier } from "./generate-docs-mdx/file-import-specifier";
import { collectCompoundMemberUsages } from "./shared/compound-member-usages";
import {
  extractInlineDemos,
  serverSafeReactNames,
} from "./shared/extract-inline-demos";

import type { Root, RootContent } from "mdast";
import type {
  MdxJsxAttribute,
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from "mdast-util-mdx-jsx";
import type { ComponentType } from "react";

type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;

const outDir = path.join("dist", "docs", "mdx");
const checkDir = path.join(".build", "docs-mdx-check");

const storybookImportPattern =
  /^import \{ Meta \} from "@storybook\/addon-docs\/blocks";$/;

const rewriteSpecifier = (slug: string, specifier: string): string => {
  const blocksMatch = /^(?:\.\.\/)+docs\/blocks\/(.+)$/.exec(specifier);
  if (blocksMatch) {
    const block = blocksMatch[1] ?? "";
    if (!existsSync(path.join("dist", "docs", "blocks", `${block}.js`))) {
      throw new Error(`${slug}: no published entry for doc block "${block}"`);
    }
    return `@hashintel/ds-components/docs/blocks/${block}`;
  }
  const demosMatch = /^(?:\.\.\/)+docs\/demos\/(.+)$/.exec(specifier);
  if (demosMatch) {
    const demo = demosMatch[1] ?? "";
    if (!existsSync(path.join("dist", "docs", "demos", `${demo}.js`))) {
      throw new Error(`${slug}: no published entry for demo module "${demo}"`);
    }
    return `@hashintel/ds-components/docs/demos/${demo}`;
  }
  const flatName = path.posix.basename(specifier);
  if (!existsSync(path.join("dist", "components", `${flatName}.js`))) {
    throw new Error(
      `${slug}: import "${specifier}" has no published entry "${flatName}"`,
    );
  }
  return `@hashintel/ds-components/${flatName}`;
};

const normalizeWhitespace = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

/**
 * Moves the page's inline demo components out of the published MDX: their
 * export blocks are removed, the names are imported back from the generated
 * `docs/demos/<slug>` client module (written by `generate-docs-demos.ts`),
 * and react imports are pruned to the server-safe names — hooks are illegal
 * in the server-compiled module the page becomes under RSC.
 */
const applyDemoExtraction = (slug: string, source: string): string => {
  const extraction = extractInlineDemos(source);
  const lines = source.split("\n");
  const metaLine = lines.findIndex((line) => line.startsWith("<Meta "));
  if (metaLine === -1) {
    throw new Error(`${slug}: no <Meta /> element found`);
  }

  const drop = new Set<number>();
  for (const block of extraction.moved) {
    for (let index = block.startLine; index < block.endLine; index += 1) {
      drop.add(index);
    }
  }

  const reactIndex = lines.findIndex(
    (line, index) =>
      index < metaLine && /^import \{ [^}]+ \} from "react";$/.test(line),
  );
  if (reactIndex !== -1) {
    const kept = extraction.reactImportNames.filter((name) =>
      serverSafeReactNames.has(name),
    );
    if (kept.length === 0) {
      drop.add(reactIndex);
    } else {
      lines[reactIndex] = `import { ${kept.join(", ")} } from "react";`;
    }
  }

  let lastHeaderImport = -1;
  for (let index = 0; index < metaLine; index += 1) {
    const line = lines[index] ?? "";
    if (line.includes(' from "') && line.includes('";') && !drop.has(index)) {
      lastHeaderImport = index;
    }
  }
  const demosImport =
    extraction.movedNames.length > 0
      ? `import { ${extraction.movedNames.join(", ")} } from "../../../docs/demos/${slug}";`
      : null;

  const out: string[] = [];
  lines.forEach((line, index) => {
    if (drop.has(index)) {
      return;
    }
    out.push(line);
    if (index === lastHeaderImport && demosImport !== null) {
      out.push(demosImport);
    }
  });
  return out.join("\n");
};

/** Drops the Storybook `Meta` usage and rewrites imports to package specifiers. */
const rewritePageImports = (slug: string, source: string): string => {
  const lines = source.split("\n");

  const metaTagIndex = lines.findIndex((line) => line.startsWith("<Meta "));
  if (metaTagIndex === -1) {
    throw new Error(`${slug}: no <Meta /> element found`);
  }

  const header = lines
    .slice(0, metaTagIndex)
    .filter((line) => !storybookImportPattern.test(line))
    .map((line) =>
      line.replace(
        /from "(\.{1,2}\/[^"]+)"/g,
        (_match, specifier: string) =>
          `from "${rewriteSpecifier(slug, specifier)}"`,
      ),
    );

  return [...header, ...lines.slice(metaTagIndex + 1)].join("\n");
};

const parseMdx = (source: string): { tree: Root; file: VFile } => {
  const file = new VFile({ value: source });
  const tree = unified().use(remarkParse).use(remarkMdx).parse(file) as Root;
  return { tree, file };
};

const isJsxElement = (node: Root | RootContent): node is JsxElement =>
  node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";

const visitJsxElements = (
  node: Root | RootContent,
  visitor: (element: JsxElement) => void,
): void => {
  if (isJsxElement(node)) {
    visitor(node);
  }
  if ("children" in node) {
    for (const child of node.children) {
      visitJsxElements(child, visitor);
    }
  }
};

const findAttribute = (
  node: JsxElement,
  name: string,
): MdxJsxAttribute | undefined =>
  node.attributes.find(
    (attribute): attribute is MdxJsxAttribute =>
      attribute.type === "mdxJsxAttribute" && attribute.name === name,
  );

/**
 * Rewrites compound-component member usages (`<Banner.ActionButton>`,
 * `of={Dialog.Body}`) to the flat bindings exported by the generated
 * `docs/demos/compound-parts` client module: the published page compiles as a
 * server module under RSC, where property access through a client component
 * reference does not resolve.
 */
const flattenCompoundMembers = (slug: string, source: string): string => {
  const usages = collectCompoundMemberUsages(source);
  if (usages.length === 0) {
    return source;
  }
  const byDotted = new Map(usages.map((usage) => [usage.dotted, usage]));

  const edits: { start: number; end: number; text: string }[] = [];
  const editMember = (start: number, end: number): void => {
    const dotted = source.slice(start, end);
    const usage = byDotted.get(dotted);
    if (usage) {
      edits.push({ start, end, text: usage.flat });
    }
  };
  const walkEstree = (value: unknown, seen = new Set<unknown>()): void => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        walkEstree(entry, seen);
      });
      return;
    }
    if (value === null || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);
    const node = value as {
      type?: unknown;
      start?: unknown;
      end?: unknown;
    } & Record<string, unknown>;
    if (
      (node.type === "MemberExpression" ||
        node.type === "JSXMemberExpression") &&
      typeof node.start === "number" &&
      typeof node.end === "number"
    ) {
      editMember(node.start, node.end);
      // Chains are handled at their outermost node; no need to recurse into
      // the object side (a nested rewrite would conflict with this one).
      // Opening and closing JSX tags carry separate name nodes, so both are
      // visited and rewritten.
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== "loc") {
        walkEstree(child, seen);
      }
    }
  };

  const { tree } = parseMdx(source);
  const visit = (node: Root | RootContent): void => {
    if (isJsxElement(node)) {
      const usage = node.name === null ? undefined : byDotted.get(node.name);
      const span = node.position;
      if (
        usage &&
        span?.start.offset !== undefined &&
        span.end.offset !== undefined
      ) {
        const openStart = span.start.offset + 1;
        if (
          source.slice(openStart, openStart + usage.dotted.length) !==
          usage.dotted
        ) {
          throw new Error(
            `${slug}: cannot locate <${usage.dotted}> opening tag`,
          );
        }
        edits.push({
          start: openStart,
          end: openStart + usage.dotted.length,
          text: usage.flat,
        });
        const closing = source.lastIndexOf(
          `</${usage.dotted}>`,
          span.end.offset,
        );
        if (closing > openStart) {
          edits.push({
            start: closing + 2,
            end: closing + 2 + usage.dotted.length,
            text: usage.flat,
          });
        }
      }
      for (const attribute of node.attributes) {
        if (
          attribute.type === "mdxJsxAttribute" &&
          typeof attribute.value === "object" &&
          attribute.value !== null
        ) {
          walkEstree(attribute.value.data?.estree);
        }
      }
    }
    if (
      (node.type === "mdxFlowExpression" ||
        node.type === "mdxTextExpression") &&
      node.data?.estree
    ) {
      walkEstree(node.data.estree);
    }
    if ("children" in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(tree);

  let flattened = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    flattened =
      flattened.slice(0, edit.start) + edit.text + flattened.slice(edit.end);
  }

  // Import the flat bindings. This pass runs after the imports were
  // rewritten (and after the Stage code was baked, so the displayed code
  // keeps the real `Banner.Title`-style API), so insert the package form.
  if (!existsSync(path.join("dist", "docs", "demos", "compound-parts.js"))) {
    throw new Error(`${slug}: dist/docs/demos/compound-parts.js is missing`);
  }
  // Anchor on the contiguous import block at the top of the page — import
  // lines further down are display text inside code fences.
  const lines = flattened.split("\n");
  let lastImport = -1;
  for (const [index, line] of lines.entries()) {
    if (line.startsWith("import ") && line.includes('";')) {
      lastImport = index;
    } else if (line.trim() !== "") {
      break;
    }
  }
  if (lastImport === -1) {
    throw new Error(`${slug}: no header import block to anchor on`);
  }
  lines.splice(
    lastImport + 1,
    0,
    `import { ${usages.map((usage) => usage.flat).join(", ")} } from "@hashintel/ds-components/docs/demos/compound-parts";`,
  );
  return lines.join("\n");
};

const functionNodeTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);

const containsFunctionNode = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some(containsFunctionNode);
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  const node = value as { type?: unknown } & Record<string, unknown>;
  if (typeof node.type === "string" && functionNodeTypes.has(node.type)) {
    return true;
  }
  return Object.entries(node).some(
    ([key, child]) =>
      key !== "loc" && key !== "position" && containsFunctionNode(child),
  );
};

/**
 * The published pages compile as *server* modules under React Server
 * Components (fumadocs on Next.js), where hooks are illegal and functions
 * created in the module cannot be passed to the (client) components. Fail the
 * build on any construct that would break there, so regressions surface here
 * rather than in consuming sites: handlers must use `noop`
 * (docs/blocks/demo-handlers) and stateful or render-prop examples must be
 * inline exported components, which the demo extraction moves out.
 */
const assertRscSafe = (slug: string, tree: Root): void => {
  const visit = (node: Root | RootContent): void => {
    if (node.type === "mdxjsEsm") {
      const reactImport = /^import \{ ([^}]+) \} from "react";$/m.exec(
        node.value,
      );
      for (const name of reactImport?.[1]?.split(", ") ?? []) {
        if (!serverSafeReactNames.has(name)) {
          throw new Error(
            `${slug}: published page imports \`${name}\` from react, which is illegal in a server-compiled module`,
          );
        }
      }
      if (
        !node.value.startsWith("import ") &&
        containsFunctionNode(node.data?.estree)
      ) {
        throw new Error(
          `${slug}: a module-level export contains a function, which cannot cross the server/client boundary`,
        );
      }
    }
    if (isJsxElement(node)) {
      for (const attribute of node.attributes) {
        if (
          attribute.type === "mdxJsxAttribute" &&
          typeof attribute.value === "object" &&
          attribute.value !== null &&
          containsFunctionNode(attribute.value.data?.estree)
        ) {
          throw new Error(
            `${slug}: <${node.name ?? "?"} ${attribute.name}={…}> (line ${
              node.position?.start.line ?? "?"
            }) contains a function, which cannot cross the server/client boundary — use \`noop\` or an inline exported demo component`,
          );
        }
      }
    }
    if (
      (node.type === "mdxFlowExpression" ||
        node.type === "mdxTextExpression") &&
      containsFunctionNode(node.data?.estree)
    ) {
      throw new Error(
        `${slug}: a JSX expression (line ${node.position?.start.line ?? "?"}) contains a function, which cannot cross the server/client boundary — wrap the example in an inline exported demo component`,
      );
    }
    if ("children" in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(tree);
};

/**
 * Bakes each `<Stage>`'s Code-tab source into the page text as a literal
 * `code={"…"}` attribute and deletes the `data-harness` markers, by applying
 * `remark-stage-code` (the plugin Storybook runs at compile time) and
 * splicing its results back into the source by position. Consumers then need
 * no custom remark plugin, and `Stage`'s required `code` prop is satisfied.
 */
const bakeStageCode = (slug: string, source: string): string => {
  const { tree, file } = parseMdx(source);

  const bareStages: { node: MdxJsxFlowElement; insertAt: number }[] = [];
  const deletions: { start: number; end: number }[] = [];
  visitJsxElements(tree, (element) => {
    const harness = findAttribute(element, "data-harness");
    if (harness?.position?.start.offset !== undefined) {
      deletions.push({
        start: harness.position.start.offset,
        end: harness.position.end?.offset ?? harness.position.start.offset,
      });
    }
    if (
      element.type === "mdxJsxFlowElement" &&
      element.name === "Stage" &&
      findAttribute(element, "code") === undefined
    ) {
      const offset = element.position?.start.offset;
      if (offset === undefined) {
        throw new Error(`${slug}: missing position on <Stage> element`);
      }
      bareStages.push({ node: element, insertAt: offset + "<Stage".length });
    }
  });

  remarkStageCode()(tree, file);

  const insertions = bareStages.map(({ node, insertAt }) => {
    const code = findAttribute(node, "code")?.value;
    if (typeof code !== "string" || code === "") {
      throw new Error(`${slug}: a <Stage> produced no Code-tab source`);
    }
    return { at: insertAt, text: ` code={${JSON.stringify(code)}}` };
  });

  // Apply edits back-to-front so earlier offsets stay valid. Deleting an
  // attribute also consumes the whitespace run before it, which always
  // leaves a valid attribute list.
  const edits = [
    ...deletions.map((deletion) => ({ at: deletion.start, deletion })),
    ...insertions.map((insertion) => ({ at: insertion.at, insertion })),
  ].sort((a, b) => b.at - a.at);

  let baked = source;
  for (const edit of edits) {
    if ("deletion" in edit && edit.deletion) {
      let { start } = edit.deletion;
      while (start > 0 && /\s/.test(baked[start - 1] ?? "")) {
        start -= 1;
      }
      baked = baked.slice(0, start) + baked.slice(edit.deletion.end);
    } else if ("insertion" in edit && edit.insertion) {
      baked =
        baked.slice(0, edit.insertion.at) +
        edit.insertion.text +
        baked.slice(edit.insertion.at);
    }
  }

  // Every Stage must now carry a code attribute — Stage requires the prop.
  const { tree: bakedTree } = parseMdx(baked);
  visitJsxElements(bakedTree, (element) => {
    if (
      element.type === "mdxJsxFlowElement" &&
      element.name === "Stage" &&
      findAttribute(element, "code") === undefined
    ) {
      throw new Error(`${slug}: a <Stage> is missing its baked code`);
    }
  });
  return baked;
};

/**
 * Compiles and server-renders the page the way a consuming MDX pipeline
 * would, returning its evaluated `meta` export for the frontmatter.
 */
const verifyPage = async (
  slug: string,
  mdxSource: string,
): Promise<Record<string, unknown>> => {
  const compiled = await compile(mdxSource, { remarkPlugins: [remarkGfm] });
  const checkFile = path.join(checkDir, `${slug}.mjs`);
  writeFileSync(checkFile, String(compiled));
  const pageModule = (await import(fileImportSpecifier(checkFile))) as {
    default: ComponentType;
    meta?: Record<string, unknown>;
  };
  const html = renderToStaticMarkup(createElement(pageModule.default));
  if (!html.includes("<h1") || !html.includes("<tbody><tr")) {
    throw new Error(`${slug}: rendered output is missing expected content`);
  }
  if (typeof pageModule.meta?.["title"] !== "string") {
    throw new Error(`${slug}: page does not export a meta object with title`);
  }
  return pageModule.meta;
};

/**
 * Frontmatter-driven sites render the title and description themselves, so
 * drop the duplicated leading heading and (defensively, only on an exact
 * match) its description paragraph.
 */
const stripDuplicatedTitle = (source: string, description: string): string => {
  const body = source.split("\n");
  const headingIndex = body.findIndex((line) => line.startsWith("# "));
  const fenceIndex = body.findIndex((line) => line.startsWith("```"));
  if (headingIndex !== -1 && (fenceIndex === -1 || headingIndex < fenceIndex)) {
    body.splice(headingIndex, 1);
    const paragraphStart = body.findIndex(
      (line, index) => index >= headingIndex && line.trim() !== "",
    );
    if (paragraphStart !== -1) {
      let paragraphEnd = paragraphStart;
      while (body[paragraphEnd + 1]?.trim()) {
        paragraphEnd += 1;
      }
      const paragraph = normalizeWhitespace(
        body.slice(paragraphStart, paragraphEnd + 1).join(" "),
      );
      if (paragraph === normalizeWhitespace(description)) {
        body.splice(paragraphStart, paragraphEnd - paragraphStart + 1);
      }
    }
  }
  return body.join("\n");
};

const pageFiles = globSync("./src/components/*/*.docs.mdx").sort();
if (pageFiles.length === 0) {
  throw new Error("No .docs.mdx pages found");
}

rmSync(checkDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(checkDir, { recursive: true });

for (const file of pageFiles) {
  const slug = path.basename(file, ".docs.mdx");
  const draft = flattenCompoundMembers(
    slug,
    bakeStageCode(
      slug,
      rewritePageImports(
        slug,
        applyDemoExtraction(slug, readFileSync(file, "utf8")),
      ),
    ),
  );
  const { tree: finalTree } = parseMdx(draft);
  assertRscSafe(slug, finalTree);
  const remainingCompound = collectCompoundMemberUsages(draft);
  if (remainingCompound.length > 0) {
    throw new Error(
      `${slug}: compound member usage survived flattening: ${remainingCompound
        .map((usage) => usage.dotted)
        .join(", ")}`,
    );
  }
  const meta = await verifyPage(slug, draft);

  // JSON values are valid YAML flow syntax, so each meta field serializes to
  // one frontmatter line without a YAML dependency.
  const frontmatter = Object.entries(meta)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  const page = `---\n${frontmatter}\n---\n\n${stripDuplicatedTitle(
    draft,
    String(meta["description"]),
  )}`
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n*$/, "\n");

  // The frontmatter block is machine-generated; syntax-check the final file
  // the way a frontmatter-aware consumer pipeline parses it.
  await compile(page, { remarkPlugins: [remarkFrontmatter, remarkGfm] });
  writeFileSync(path.join(outDir, `${slug}.mdx`), page);
}

// Hand-maintained declarations for the doc-block entry points.
const blockStubs: Record<string, string> = {
  "demo-state": `import type { ReactElement } from "react";

export declare const DemoState: (props: {
  children: ReactElement;
  prop?: string;
  handler?: string;
}) => ReactElement;
`,
  "do-dont-list": `import type { ReactElement, ReactNode } from "react";

export declare const DoList: (props: { items: ReactNode[] }) => ReactElement;
export declare const DontList: (props: {
  items: ReactNode[];
}) => ReactElement;
`,
  "overlay-demo": `import type { ReactElement, ReactNode, RefObject } from "react";

export declare const OverlayDemo: (props: {
  triggerLabel?: string;
  triggers?: readonly string[];
  children: (controls: {
    close: () => void;
    trigger: string;
    triggerRef: RefObject<HTMLButtonElement | null>;
  }) => ReactNode;
}) => ReactElement;
`,
  "props-table": `import type { ReactElement } from "react";

export declare const PropsTable: (props: {
  of: object;
  defaults?: Record<string, string>;
}) => ReactElement;
`,
  "reference-links": `import type { ReactElement } from "react";

export type ReferenceLink = {
  label: string;
  href: string;
  iconName?: string;
};

export declare const ReferenceLinks: (props: {
  links: ReferenceLink[];
}) => ReactElement;
`,
  stage: `import type { ReactElement, ReactNode } from "react";

export declare const Stage: (props: {
  children: ReactNode;
  code?: string;
  clampViewportPanels?: boolean;
}) => ReactElement;
`,
};

for (const blockFile of globSync("./dist/docs/blocks/*.js")) {
  const name = path.basename(blockFile, ".js");
  const stub = blockStubs[name];
  if (!stub) {
    throw new Error(
      `No declaration stub for doc block "${name}" — add one to generate-docs-mdx.ts`,
    );
  }
  writeFileSync(path.join("dist", "docs", "blocks", `${name}.d.ts`), stub);
}

const rehypePluginJs = path.join("dist", "docs", "rehype-markdown-class.js");
if (!existsSync(rehypePluginJs)) {
  throw new Error(`${rehypePluginJs} is missing — did tsup build its entry?`);
}
writeFileSync(
  path.join("dist", "docs", "rehype-markdown-class.d.ts"),
  `import type { Root } from "hast";

export type RehypeMarkdownClassOptions = {
  mode?: "class" | "not-prose";
};

export declare const rehypeMarkdownClass: (
  options?: RehypeMarkdownClassOptions,
) => (tree: Root) => void;
`,
);

console.log(`Wrote ${pageFiles.length} raw MDX pages to ${outDir}`);
