import { Array, Result, Schema } from "effect";
import { Children, isValidElement } from "react";

import type * as Components from "../components.js";
import type { Components as HtmlComponents } from "fumadocs-core/utils/hast-to-jsx";
import type { ReactElement, ReactNode } from "react";

type HierarchyNode = Components.HierarchyNode;
type CodeLink = Components.CodeLink;
type CodeQuickInfo = Components.CodeQuickInfo;
type CodeProps = Components.CodeProps;
type HierarchyProps = Components.HierarchyProps;

/** An array property as the page wrote it, from the space-separated string an element arrives with. */
const words = (value: string | number | undefined): readonly string[] => {
  if (value === undefined) {
    return [];
  }

  return String(value)
    .split(" ")
    .filter((word) => word !== "");
};

const numbers = (value: string | number | undefined): readonly number[] =>
  Array.map(words(value), Number);

const decodeNames = Schema.decodeUnknownResult(
  Schema.fromJsonString(Schema.Array(Schema.String)),
);

/** A list of names from the JSON the page writes it as, because a name may contain a space. */
const namesOf = (value: string | number | undefined): readonly string[] => {
  if (value === undefined) {
    return [];
  }

  return Result.getOrThrow(decodeNames(String(value)));
};

/** The overloads an element names, or none when it holds in every overload. */
const overloadsOf = (
  value: string | number | undefined,
): readonly number[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return numbers(value);
};

/**
 * Reads the text, links and quick info of an `api-code` element back from its children.
 *
 * The element holds its source as text with an `a` around each linked name and a `span` around each other name with quick info, so a page drawn without these components still reads as code with links, and shows quick info as a tooltip. By the time a component sees it, each `a` is an element of the host's `a` component, which keeps `href`, the name's kind, its quick info as `title` and the name as its props.
 */
export const readCode = (
  children: ReactNode,
): Pick<CodeProps, "code" | "links" | "quickInfo"> => {
  let code = "";
  const links: CodeLink[] = [];
  const quickInfo: CodeQuickInfo[] = [];

  // oxlint-disable-next-line react/no-react-children -- the children are the text, `a` and `span` elements of an `api-code`, which the extraction writes
  for (const child of Children.toArray(children)) {
    if (typeof child === "string") {
      code += child;
    } else if (
      isValidElement<{
        href?: string;
        title?: string;
        children: string;
        "data-kind"?: string;
      }>(child) &&
      typeof child.props.children === "string"
    ) {
      const { href, title, children: name, "data-kind": kind } = child.props;
      if (href !== undefined) {
        links.push({ offset: code.length, length: name.length, href, kind });
      }
      if (title !== undefined) {
        quickInfo.push({
          offset: code.length,
          length: name.length,
          text: title,
        });
      }
      code += name;
    }
  }

  return { code, links, quickInfo };
};

const isNode = (
  child: ReactNode,
): child is ReactElement<HierarchyNode & { readonly index: number }> =>
  isValidElement<Partial<HierarchyNode>>(child) &&
  typeof child.props.role === "string" &&
  typeof child.props.label === "string";

const isEdge = (
  child: ReactNode,
): child is ReactElement<{ readonly base: number; readonly derived: number }> =>
  isValidElement<{ base?: number; derived?: number }>(child) &&
  typeof child.props.base === "number" &&
  typeof child.props.derived === "number";

/** Reads the nodes and edges of an `api-hierarchy` element back from its `api-hierarchy-node` and `api-hierarchy-edge` children. */
export const readHierarchy = (
  children: ReactNode,
): Pick<HierarchyProps, "nodes" | "edges"> => {
  // oxlint-disable-next-line react/no-react-children -- the children are the `api-hierarchy-node` and `api-hierarchy-edge` elements the extraction writes
  const all = Children.toArray(children);

  return {
    nodes: all.filter(isNode).map(({ props: { href, label, role } }) => ({
      href,
      label,
      role,
    })),
    edges: all
      .filter(isEdge)
      .map(({ props: { base, derived } }) => [base, derived] as const),
  };
};

/** The components for a page's comments, pages and indexes, which read each element's properties back into its typed props. */
const documentation = (
  drawn: Components.Components,
): Partial<HtmlComponents> => ({
  "api-meta": drawn.Meta,
  "api-comment": ({ overloads, children }) => (
    <drawn.Comment overloads={overloadsOf(overloads)}>{children}</drawn.Comment>
  ),
  "api-description": drawn.Description,
  "api-deprecation": drawn.Deprecation,
  "api-remarks": drawn.Remarks,
  "api-custom": drawn.Custom,
  "api-example": drawn.Example,
  "api-caption": drawn.Caption,
  "api-see": drawn.See,
  "api-import": drawn.Import,
  "api-contents": drawn.Contents,
  "api-group": drawn.Group,
  "api-index": drawn.Index,
  "api-row": ({ href, kind, depth, names, summary, deprecated }) => (
    <drawn.Row
      href={href}
      kind={kind}
      depth={depth}
      names={namesOf(names)}
      summary={summary}
      deprecated={deprecated}
    />
  ),
  "api-export": ({
    name,
    title,
    names,
    kind,
    since,
    stability,
    internal,
    deprecated,
    source,
    children,
  }) => (
    <drawn.Export
      name={name}
      title={title}
      names={namesOf(names)}
      kind={kind}
      since={since}
      stability={stability}
      internal={internal}
      deprecated={deprecated}
      source={source}
    >
      {children}
    </drawn.Export>
  ),
  "api-signatures": drawn.Signatures,
  "api-signature": ({
    overloads,
    since,
    stability,
    internal,
    deprecated,
    source,
    children,
  }) => (
    <drawn.Signature
      overloads={overloadsOf(overloads)}
      since={since}
      stability={stability}
      internal={internal}
      deprecated={deprecated}
      source={source}
    >
      {children}
    </drawn.Signature>
  ),
});

/** The components for a page's declarations, members, calls and relations. */
const declarations = (
  drawn: Components.Components,
): Partial<HtmlComponents> => ({
  "api-members": drawn.Members,
  "api-property": drawn.Property,
  "api-method": drawn.Method,
  "api-accessor": drawn.Accessor,
  "api-enum-member": drawn.EnumMember,
  "api-getter": drawn.Getter,
  "api-setter": drawn.Setter,
  "api-type-parameters": drawn.TypeParameters,
  "api-type-parameter": drawn.TypeParameter,
  "api-parameters": drawn.Parameters,
  "api-parameter": drawn.Parameter,
  "api-returns": drawn.Returns,
  "api-throws": drawn.Throws,
  "api-throw": ({ overloads, children }) => (
    <drawn.Throw overloads={overloadsOf(overloads)}>{children}</drawn.Throw>
  ),
  "api-error": drawn.Error,
  "api-form": ({ overloads, children }) => (
    <drawn.Form overloads={overloadsOf(overloads)}>{children}</drawn.Form>
  ),
  "api-described": ({ overloads, children }) => (
    <drawn.Described overloads={overloadsOf(overloads)}>
      {children}
    </drawn.Described>
  ),
  "api-related": drawn.Related,
  "api-relation": drawn.Relation,
  "api-namespace": drawn.Namespace,
  "api-trait": drawn.Trait,
  "api-explanation": drawn.Explanation,
  "api-hierarchy": ({ name, children }) => {
    const { nodes, edges } = readHierarchy(children);

    return <drawn.Hierarchy name={name} nodes={nodes} edges={edges} />;
  },
  "api-code": ({ lang, context, children }) => {
    const { code, links, quickInfo } = readCode(children);

    return (
      <drawn.Code
        lang={lang}
        context={context}
        code={code}
        links={links}
        quickInfo={quickInfo}
      />
    );
  },
});

/** Each generated element's component, which reads the element's properties back into the typed props of the host's component. */
export const of = (drawn: Components.Components): Partial<HtmlComponents> => ({
  ...documentation(drawn),
  ...declarations(drawn),
});
