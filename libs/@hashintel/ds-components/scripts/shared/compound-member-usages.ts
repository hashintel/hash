/**
 * Finds compound-component member usages in a docs MDX page body — JSX like
 * `<Banner.ActionButton>` and attribute expressions like
 * `of={Dialog.Body}` — where the base identifier is a component imported in
 * the page header. Under React Server Components those imports are client
 * *references*, and property access through a reference does not resolve, so
 * the publish pipeline rewrites each usage to a flat name exported from a
 * generated client module (`docs/demos/compound-parts.gen.tsx`) that performs
 * the member access itself.
 *
 * `meta.links.source`-style data access is untouched: only member chains
 * rooted at an imported component binding (and with capitalized segments)
 * count.
 */
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { Root, RootContent } from "mdast";

export interface CompoundMemberUsage {
  /** The dotted chain as written, e.g. "Form.Field.Label". */
  dotted: string;
  /** The generated flat binding, e.g. "FormFieldLabel". */
  flat: string;
  /** The page-header import specifier of the base binding. */
  baseSpecifier: string;
  /** The base binding name, e.g. "Form". */
  base: string;
}

const dottedComponentPattern = /^[A-Z]\w*(?:\.[A-Z]\w*)+$/;

const collectEstreeMembers = (
  value: unknown,
  report: (dotted: string) => void,
  seen = new Set<unknown>(),
): void => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectEstreeMembers(entry, report, seen);
    }
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);
  const node = value as { type?: unknown } & Record<string, unknown>;
  // `of={Dialog.Body}` parses as MemberExpression; `<Form.Field.Errors>`
  // nested inside an attribute expression parses as JSXMemberExpression.
  if (node.type === "MemberExpression" || node.type === "JSXMemberExpression") {
    const memberTypes = new Set(["MemberExpression", "JSXMemberExpression"]);
    const identifierTypes = new Set(["Identifier", "JSXIdentifier"]);
    const parts: string[] = [];
    let current: unknown = node;
    while (
      typeof current === "object" &&
      current !== null &&
      memberTypes.has((current as { type: string }).type)
    ) {
      const member = current as {
        property?: { type?: string; name?: unknown };
        object?: unknown;
      };
      if (
        member.property?.type !== undefined &&
        identifierTypes.has(member.property.type) &&
        typeof member.property.name === "string"
      ) {
        parts.unshift(member.property.name);
      } else {
        return;
      }
      current = member.object;
    }
    if (
      typeof current === "object" &&
      current !== null &&
      identifierTypes.has((current as { type: string }).type)
    ) {
      parts.unshift((current as { name: string }).name);
      report(parts.join("."));
    }
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key !== "loc") {
      collectEstreeMembers(child, report, seen);
    }
  }
};

/**
 * Scans the page for compound member usages. `source` is the authored page
 * (any stage of the transform — detection only relies on the header imports
 * and the body JSX).
 */
export const collectCompoundMemberUsages = (
  source: string,
): CompoundMemberUsage[] => {
  const file = unified().use(remarkParse).use(remarkMdx).parse(source) as Root;

  // Imports come from the ESM nodes' syntax trees — both fenced example code
  // and template-literal code strings contain import statements as display
  // text, which must not count.
  const importedComponents = new Map<string, string>();
  const collectImports = (node: Root | RootContent): void => {
    if (node.type === "mdxjsEsm") {
      const statements =
        (node.data?.estree?.body as
          | {
              type: string;
              source?: { value?: unknown };
              specifiers?: {
                type: string;
                local?: { name?: unknown };
              }[];
            }[]
          | undefined) ?? [];
      for (const statement of statements) {
        if (statement.type !== "ImportDeclaration") {
          continue;
        }
        const specifier = statement.source?.value;
        if (
          typeof specifier !== "string" ||
          specifier.startsWith("@storybook/") ||
          specifier === "react"
        ) {
          continue;
        }
        for (const imported of statement.specifiers ?? []) {
          const name = imported.local?.name;
          if (
            imported.type === "ImportSpecifier" &&
            typeof name === "string" &&
            /^[A-Z]/.test(name)
          ) {
            importedComponents.set(name, specifier);
          }
        }
      }
    }
    if ("children" in node) {
      for (const child of node.children) {
        collectImports(child);
      }
    }
  };
  collectImports(file);

  const usages = new Map<string, CompoundMemberUsage>();
  const record = (dotted: string): void => {
    if (!dottedComponentPattern.test(dotted)) {
      return;
    }
    const base = dotted.split(".")[0] ?? "";
    const baseSpecifier = importedComponents.get(base);
    if (baseSpecifier === undefined) {
      return;
    }
    usages.set(dotted, {
      dotted,
      flat: dotted.replaceAll(".", ""),
      baseSpecifier,
      base,
    });
  };

  const visit = (node: Root | RootContent): void => {
    if (
      (node.type === "mdxJsxFlowElement" ||
        node.type === "mdxJsxTextElement") &&
      node.name !== null &&
      node.name.includes(".")
    ) {
      record(node.name);
    }
    if (
      node.type === "mdxJsxFlowElement" ||
      node.type === "mdxJsxTextElement"
    ) {
      for (const attribute of node.attributes) {
        if (
          attribute.type === "mdxJsxAttribute" &&
          typeof attribute.value === "object" &&
          attribute.value !== null
        ) {
          collectEstreeMembers(attribute.value.data?.estree, record);
        }
      }
    }
    if (
      (node.type === "mdxFlowExpression" ||
        node.type === "mdxTextExpression") &&
      node.data?.estree
    ) {
      collectEstreeMembers(node.data.estree, record);
    }
    if ("children" in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(file);

  return [...usages.values()].sort((a, b) => a.dotted.localeCompare(b.dotted));
};
