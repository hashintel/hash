import { readFileSync } from "node:fs";

import {
  ApiDeclaredItem,
  ApiFunction,
  ApiModel,
} from "@microsoft/api-extractor-model";
import { DocCodeSpan, DocPlainText, DocSoftBreak } from "@microsoft/tsdoc";
import { format } from "oxfmt";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import ts from "typescript";
import { unified } from "unified";

import formatOptions from "../../../../../oxfmt.config.ts";

import type {
  ApiItem,
  ApiVariable,
  Excerpt,
} from "@microsoft/api-extractor-model";
import type { DocNode } from "@microsoft/tsdoc";
import type { Nodes, PhrasingContent, Root, RootContent } from "mdast";

export interface TypePart {
  text: string;
  href?: string;
}

export interface ParameterView {
  name: string;
  optional: boolean;
  type: TypePart[];
  description: string;
}

export interface SignatureView {
  anchor: string;
  title: string;
  code: string;
  parameters: ParameterView[];
  returns: TypePart[];
}

export interface ExampleResult {
  code: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  sourceSha256: string;
  exampleSha256: string;
}

// Documenter emits plain Markdown with HTML comments, not MDX expressions.
const markdown = unified().use(remarkParse);
// Escape literal text for MDX only when serializing the rewritten prose.
const mdx = unified()
  .use(remarkStringify, { fences: true, bullet: "-" })
  .use(remarkMdx);

export const bodyOf = (source: string): Root => {
  const tree = markdown.parse(source);
  const heading = tree.children.findIndex((node) => node.type === "heading");
  if (heading === -1) {
    throw new Error("Documenter page has no heading");
  }
  return { type: "root", children: tree.children.slice(heading + 1) };
};

export const nodeText = (node: Nodes): string => {
  if (node.type === "html") {
    return node.value.replaceAll(/<!--[\s\S]*?-->/gu, "");
  }
  if ("value" in node) {
    return node.value;
  }
  if ("children" in node) {
    return node.children.map(nodeText).join("");
  }
  return "";
};

const plainDescription = (node: DocNode | undefined): string => {
  if (node === undefined) {
    return "";
  }
  if (node instanceof DocPlainText) {
    return node.text;
  }
  if (node instanceof DocCodeSpan) {
    return node.code;
  }
  if (node instanceof DocSoftBreak) {
    return " ";
  }
  if (node.kind !== "Section" && node.kind !== "Paragraph") {
    throw new Error(`Unsupported parameter prose: ${node.kind}`);
  }
  return node.getChildNodes().map(plainDescription).join("").trim();
};

export const loadItems = (modelPath: string): readonly ApiItem[] => {
  const model = new ApiModel();
  const entry = model.loadPackage(modelPath).entryPoints[0];
  if (entry === undefined) {
    throw new Error("API model has no entry point");
  }
  return entry.members;
};

export const typeParts = (
  excerpt: Excerpt,
  links: ReadonlyMap<string, string>,
  options: { start?: number; end?: number } = {},
): TypePart[] => {
  const { start = 0, end = excerpt.text.length } = options;
  const parts: TypePart[] = [];
  let offset = 0;
  for (const token of excerpt.spannedTokens) {
    const next = offset + token.text.length;
    if (next > start && offset < end) {
      const text = token.text.slice(
        Math.max(0, start - offset),
        Math.min(token.text.length, end - offset),
      );
      const part: TypePart = { text };
      if (token.canonicalReference !== undefined) {
        const href = links.get(token.canonicalReference.toString());
        if (href !== undefined && href !== "") {
          part.href = href;
        }
      }
      parts.push(part);
    }
    offset = next;
  }
  return parts;
};

export const inputSignatures = (
  items: readonly ApiItem[],
  links: ReadonlyMap<string, string>,
): SignatureView[] => {
  const functions = items.filter(
    (item): item is ApiFunction =>
      item instanceof ApiFunction && item.displayName === "input",
  );
  const documented = functions.find((item) => item.tsdocComment !== undefined);
  return functions.map((item) => ({
    anchor: `input-${item.overloadIndex}`,
    title: `Overload ${item.overloadIndex}`,
    code: item.excerpt.text,
    parameters: item.parameters.map((parameter) => ({
      name: parameter.name,
      optional: parameter.isOptional,
      type: typeParts(parameter.parameterTypeExcerpt, links),
      description: plainDescription(
        parameter.tsdocParamBlock?.content ??
          documented?.parameters.find(
            (candidate) => candidate.name === parameter.name,
          )?.tsdocParamBlock?.content,
      ),
    })),
    returns: typeParts(item.returnTypeExcerpt, links),
  }));
};

export const callableSignatures = (
  item: ApiVariable,
  links: ReadonlyMap<string, string>,
): SignatureView[] => {
  // The API model retains a callable variable as one excerpt. Parse its syntax without invoking a checker or replacing its types.
  const prefix = "declare const ";
  const source = ts.createSourceFile(
    "callable.d.ts",
    `${prefix}${item.excerpt.text};`,
    ts.ScriptTarget.Latest,
    true,
  );
  const statement = source.statements[0];
  if (statement === undefined || !ts.isVariableStatement(statement)) {
    throw new Error("Expected a callable variable declaration");
  }
  const type = statement.declarationList.declarations[0]?.type;
  if (type === undefined || !ts.isTypeLiteralNode(type)) {
    throw new Error("Expected an object of call signatures");
  }
  const members = type.members;
  return members.map((member, index) => {
    if (!ts.isCallSignatureDeclaration(member) || member.type === undefined) {
      throw new Error("Expected a call signature with an explicit return type");
    }
    return {
      anchor: `${item.displayName}-${index + 1}`,
      title: `Call signature ${index + 1}`,
      code: member.getText(source),
      parameters: member.parameters.map((parameter) => {
        if (parameter.type === undefined || !ts.isIdentifier(parameter.name)) {
          throw new Error("Expected a named parameter with an explicit type");
        }
        return {
          name: parameter.name.text,
          optional: parameter.questionToken !== undefined,
          type: typeParts(item.excerpt, links, {
            start: parameter.type.getStart(source) - prefix.length,
            end: parameter.type.end - prefix.length,
          }),
          description: "",
        };
      }),
      returns: typeParts(item.excerpt, links, {
        start: member.type.getStart(source) - prefix.length,
        end: member.type.end - prefix.length,
      }),
    };
  });
};

export const rewriteProse = (
  tree: Root,
  options: {
    files: ReadonlyMap<string, string>;
    symbols: ReadonlyMap<string, string>;
    section: string;
  },
): Root => {
  const { files, symbols, section } = options;
  const maximumHeadingDepth = 6;
  let headingIndex = 0;
  const linkInlineCode = (children: PhrasingContent[]): void => {
    for (const [index, child] of children.entries()) {
      if (child.type === "inlineCode") {
        const name =
          /^(?:Expression\.)?(?<name>[A-Za-z_$][\w$]*)(?=[(<]|$)/u.exec(
            child.value,
          )?.groups?.name;
        if (name !== undefined && name !== "") {
          const destination = symbols.get(name);
          if (destination !== undefined && destination !== "") {
            children[index] = {
              type: "link",
              url: destination,
              children: [child],
            };
          }
        }
      }
    }
  };
  const visit = (node: Nodes, insideLink: boolean): void => {
    if (node.type === "link") {
      const destination = files.get(node.url.replace(/^\.\//u, ""));
      if (destination !== undefined && destination !== "") {
        node.url = destination;
      } else if (node.url.endsWith(".md")) {
        node.url = `../../../api-documenter/${node.url.replace(/^\.\//u, "")}`;
      }
    }
    if (node.type === "heading") {
      headingIndex += 1;
      if (node.depth !== maximumHeadingDepth) {
        node.depth += 1;
      }
      node.children.push({
        type: "text",
        value: ` [#${section}-detail-${headingIndex}]`,
      });
    }
    if (node.type === "html") {
      node.value = node.value
        .replaceAll(/<!--[\s\S]*?-->/gu, "")
        .replaceAll(/<\/?caption>/gu, "");
    }
    const withinLink =
      insideLink || node.type === "link" || node.type === "linkReference";
    // Only these mdast parents accept phrasing children; block/container arrays are never rewritten.
    if (
      !withinLink &&
      (node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "emphasis" ||
        node.type === "strong" ||
        node.type === "delete" ||
        node.type === "tableCell")
    ) {
      linkInlineCode(node.children);
    }
    if ("children" in node) {
      for (const child of node.children) {
        visit(child, withinLink);
      }
    }
  };
  visit(tree, false);
  return tree;
};

export const renderMarkdown = (tree: Root): string => mdx.stringify(tree);

export const renderIndexSummary = (node: Nodes): string =>
  renderMarkdown({
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: nodeText(node).replaceAll("\n", " ") },
        ],
      },
    ],
  })
    .trimEnd()
    .replaceAll("|", String.raw`\|`);

export const introOf = (tree: Root): Root => {
  const boundary = tree.children.findIndex(
    (node) => node.type === "heading" || nodeText(node) === "Signature:",
  );
  let children = tree.children;
  if (boundary !== -1) {
    children = tree.children.slice(0, boundary);
  }
  return { type: "root", children };
};

const returnProse = (tree: Root): Root => {
  const marker = tree.children.findIndex(
    (node) => nodeText(node) === "Returns:",
  );
  if (marker === -1) {
    return { type: "root", children: [] };
  }
  const children: RootContent[] = [];
  // The first paragraph is Documenter's rendered return type; types come from model excerpts instead.
  for (const node of tree.children.slice(marker + 2)) {
    if (node.type === "heading") {
      break;
    }
    children.push(node);
  }
  return { type: "root", children };
};

export const signatureBlock = async (
  signature: SignatureView,
  options: { preamble: string; callable: boolean; name: string },
): Promise<string> => {
  let before = options.preamble;
  let after = "";
  if (options.callable) {
    before = `${options.preamble}\ninterface CallSignature {`;
    after = "\n// ---cut-after---\n}";
  }
  const formatted = await format(
    "signature.ts",
    `${before}\n// ---cut---\n${signature.code}${after}`,
    formatOptions,
  );
  if (formatted.errors.length > 0) {
    throw new Error(
      `Cannot format ${signature.anchor}: ${JSON.stringify(formatted.errors)}`,
    );
  }
  return `\`\`\`ts twoslash reference title="Expression.${options.name}"\n${formatted.code.trimEnd()}\n\`\`\``;
};

export const polishedMember = async (options: {
  name: string;
  source: string;
  signatures: readonly SignatureView[];
  preamble: string;
  example: ExampleResult;
  files: ReadonlyMap<string, string>;
  symbols: ReadonlyMap<string, string>;
}): Promise<string> => {
  const { name, source, signatures, preamble, example, files, symbols } =
    options;
  if (example.exitCode !== 0 || example.stdout.trim() === "") {
    throw new Error(`Missing successful captured output for ${name}`);
  }
  const original = bodyOf(source);
  const prose = (tree: Root): string =>
    renderMarkdown(rewriteProse(tree, { files, symbols, section: name }));
  const returnDescription = nodeText(returnProse(original)).trim();
  const sectionBlocks = await Promise.all(
    signatures.map(
      async (signature) => `### ${signature.title} [#${signature.anchor}]

${await signatureBlock(signature, { preamble, callable: name === "adaptCallable", name })}

<ReferenceSignature id=${JSON.stringify(`${signature.anchor}-params`)} parameters={${JSON.stringify(signature.parameters)}} returns={${JSON.stringify(signature.returns)}} returnDescription={${JSON.stringify(returnDescription)}} />
`,
    ),
  );
  const sections = sectionBlocks.join("\n");
  const caption = original.children.find(
    (node) => node.type === "html" && node.value.includes("<caption>"),
  );
  let captionText = "";
  if (caption?.type === "html") {
    captionText = caption.value.replaceAll(/<\/?caption>/gu, "").trim();
  }
  return `## Expression.${name} [#${name}]

${prose(introOf(original))}
${sections}
### Example [#${name}-example]

${captionText}

\`\`\`ts twoslash
${example.code.trimEnd()}
\`\`\`

#### Output [#${name}-output]

\`\`\`text
${example.stdout.trimEnd()}
\`\`\`
`;
};

export const moduleOverview = (sourcePath: string): string => {
  const source = readFileSync(sourcePath, "utf8");
  const comment = ts.getLeadingCommentRanges(source, 0)?.[0];
  if (comment === undefined || !source.startsWith("/**")) {
    throw new Error("Module overview comment is missing");
  }
  const openingCommentLength = "/**".length;
  const closingCommentLength = "*/".length;
  return source
    .slice(
      comment.pos + openingCommentLength,
      comment.end - closingCommentLength,
    )
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/u, ""))
    .filter((line) => line.trim() !== "@module")
    .join("\n")
    .trim();
};

export const declarationLinks = (
  items: readonly ApiItem[],
): Map<string, string> =>
  new Map(
    items
      .filter((item) => item instanceof ApiDeclaredItem)
      .map((item) => [
        item.canonicalReference.toString(),
        `#${item.displayName}`,
      ]),
  );
