import { Array, Struct } from "effect";
import { toJsx } from "fumadocs-core/utils/hast-to-jsx";

import * as Elements from "./internal/elements.js";

import type * as Tree from "./Tree/index.js";
import type { Components as HtmlComponents } from "fumadocs-core/utils/hast-to-jsx";
import type { Element, ElementContent, Root, RootContent } from "hast";
import type { ComponentType, ReactNode } from "react";

/** A link inside a code block: `length` UTF-16 code units from `offset`, to `href`, naming something of `kind`, such as a `function`, or of no kind the page knows. */
export interface CodeLink {
  readonly offset: number;
  readonly length: number;
  readonly href: string;
  readonly kind?: string | undefined;
}

/** What an editor shows on hover over a name inside a code block, such as `const query: ExpressionType`: the name is `length` UTF-16 code units from `offset`. */
export interface CodeQuickInfo {
  readonly offset: number;
  readonly length: number;
  readonly text: string;
}

/** What a declaration's comment states besides prose, and where its source is. */
export interface FactProps {
  readonly since?: string | undefined;
  readonly stability?: string | undefined;
  /** An `@internal` says the declaration is no part of the package's API, which a reader still meets in its types. */
  readonly internal?: boolean | undefined;
  /** An `@deprecated` says to stop using it. A host may strike its name through. */
  readonly deprecated?: boolean | undefined;
  /** The URL of its source. */
  readonly source?: string | undefined;
}

/** The overloads something holds in, counting from 1, absent when it holds in every overload. */
export interface OverloadProps {
  readonly overloads?: readonly number[] | undefined;
}

export interface ChildrenProps {
  readonly children?: ReactNode;
}

/** The facts under a module's or an entrypoint's title. */
export interface MetaProps extends FactProps {
  readonly kind: "module" | "entrypoint";
  readonly exports: number;
}

/** One source comment and its sections, in the overloads of its owner it documents. */
export interface CommentProps extends OverloadProps, ChildrenProps {}

/** A configured block without a section of its own, under its tag. */
export interface CustomProps extends ChildrenProps {
  readonly tag: string;
}

/** One group of a module's index. */
export interface GroupProps extends ChildrenProps {
  readonly title: string;
  readonly grouping: Tree.Page.Grouping["_tag"];
}

/** One row of an index, which names what it links to with the first sentence of its documentation. */
export interface RowProps {
  readonly href: string;
  readonly kind: Tree.Row.Kind;
  /** How deep the row is under another, such as a member under its interface. */
  readonly depth: number;
  /** The names a reader sees, outermost first. */
  readonly names: readonly string[];
  readonly summary: string;
  readonly deprecated?: boolean | undefined;
}

/** An export. Its children are its parts in the order of its Markdown body, each in its own element. The child whose `slot` is `header` is the type hierarchy of an export without declarations, and belongs on its heading's line. */
export interface ExportProps extends FactProps, ChildrenProps {
  /** The export's anchor. */
  readonly name: string;
  readonly title: string;
  /** The names of the namespaces it is in, then its own. */
  readonly names: readonly string[];
  readonly kind: Tree.Row.Kind;
}

/** Every declaration of an export or a member, and how many overloads they number between them. The child whose `slot` is `title` is an export's type hierarchy, and belongs on the line that names them. */
export interface SignaturesProps extends ChildrenProps {
  readonly overloads: number;
}

/** One declaration's code, with the overloads it numbers, absent when it is the only declaration, and the facts of its own comment that its export or member does not already state. Its deprecation is always its own. */
export interface SignatureProps
  extends FactProps, OverloadProps, ChildrenProps {}

/** A member. Its children are its declarations, then its comments and documented calls. An accessor's children are its getter and its setter, each with its own declaration, comment and documented calls. */
export interface MemberProps extends FactProps, ChildrenProps {
  /** The member's anchor. */
  readonly name: string;
  readonly title: string;
  readonly static?: boolean | undefined;
}

export interface TypeParameterProps extends ChildrenProps {
  readonly name: string;
}

export interface ParameterProps extends ChildrenProps {
  readonly name: string;
  /** Every declaration of the parameter is optional. */
  readonly optional?: boolean | undefined;
  /** A declaration of the parameter collects the remaining arguments. */
  readonly rest?: boolean | undefined;
}

/** A type a parameter or a call's result has, as code, in the overloads it has it in. */
export interface FormProps extends OverloadProps, ChildrenProps {}

/** What comments say about a parameter, a type parameter, a result or an error, in the overloads they say it for. */
export interface DescribedProps extends OverloadProps, ChildrenProps {}

/** An error the calls throw: the error itself, then its descriptions. */
export interface ThrowProps extends OverloadProps, ChildrenProps {
  /** Every overload throws the error. Present when only some overloads throw another error of the same calls, so each error says which overloads throw it. */
  readonly every?: boolean | undefined;
}

/** One group of related exports. */
export interface RelationProps extends ChildrenProps {
  readonly relation: keyof Tree.Row.Related;
  readonly title: string;
}

/** A namespace merged with an export: its comment, its index and its exports. */
export interface NamespaceProps extends FactProps, ChildrenProps {
  readonly title: string;
}

/** A trait. The child whose `slot` is `header` is its type hierarchy, and belongs on its heading's line. */
export interface TraitProps extends ChildrenProps {
  /** The trait's anchor. */
  readonly name: string;
  readonly title: string;
}

/** The reference's own explanation of a trait. */
export interface ExplanationProps extends ChildrenProps {}

export interface HierarchyNode {
  readonly href?: string | undefined;
  readonly label: string;
  readonly role: Tree.Hierarchy.HierarchyNode["role"];
}

/** The graph of a type's bases and of the types that extend it. Each edge is a pair of node indices, base first. */
export interface HierarchyProps {
  /** The anchor of the export or trait the graph describes. */
  readonly name: string;
  readonly nodes: readonly HierarchyNode[];
  readonly edges: readonly (readonly [base: number, derived: number])[];
}

/** Source code for the host to highlight. A signature or an example links the names it mentions, and an example has the quick info of each name the compiler resolves in it. */
export interface CodeProps {
  readonly lang?: string | undefined;
  readonly code: string;
  readonly links: readonly CodeLink[];
  readonly quickInfo: readonly CodeQuickInfo[];
  /** What the code is part of, when it is not a whole declaration or example. A host sets a `type` on a line of text rather than as a block. */
  readonly context?: "type" | "member" | undefined;
}

/** The components a host draws the generated elements with. A host may share one visual component between several of them; each still names one kind of thing. */
export interface Components {
  readonly Meta: ComponentType<MetaProps>;
  readonly Comment: ComponentType<CommentProps>;
  readonly Description: ComponentType<ChildrenProps>;
  readonly Deprecation: ComponentType<ChildrenProps>;
  readonly Remarks: ComponentType<ChildrenProps>;
  readonly Custom: ComponentType<CustomProps>;
  readonly Example: ComponentType<ChildrenProps>;
  readonly Caption: ComponentType<ChildrenProps>;
  readonly See: ComponentType<ChildrenProps>;
  readonly Import: ComponentType<ChildrenProps>;
  readonly Contents: ComponentType<ChildrenProps>;
  readonly Group: ComponentType<GroupProps>;
  readonly Index: ComponentType<ChildrenProps>;
  readonly Row: ComponentType<RowProps>;
  readonly Export: ComponentType<ExportProps>;
  readonly Signatures: ComponentType<SignaturesProps>;
  readonly Signature: ComponentType<SignatureProps>;
  readonly Members: ComponentType<ChildrenProps>;
  readonly Property: ComponentType<MemberProps>;
  readonly Method: ComponentType<MemberProps>;
  readonly Accessor: ComponentType<MemberProps>;
  readonly EnumMember: ComponentType<MemberProps>;
  readonly Getter: ComponentType<ChildrenProps>;
  readonly Setter: ComponentType<ChildrenProps>;
  readonly TypeParameters: ComponentType<ChildrenProps>;
  readonly TypeParameter: ComponentType<TypeParameterProps>;
  readonly Parameters: ComponentType<ChildrenProps>;
  readonly Parameter: ComponentType<ParameterProps>;
  readonly Returns: ComponentType<ChildrenProps>;
  readonly Throws: ComponentType<ChildrenProps>;
  readonly Throw: ComponentType<ThrowProps>;
  readonly Error: ComponentType<ChildrenProps>;
  readonly Form: ComponentType<FormProps>;
  readonly Described: ComponentType<DescribedProps>;
  readonly Related: ComponentType<ChildrenProps>;
  readonly Relation: ComponentType<RelationProps>;
  readonly Namespace: ComponentType<NamespaceProps>;
  readonly Trait: ComponentType<TraitProps>;
  readonly Explanation: ComponentType<ExplanationProps>;
  readonly Hierarchy: ComponentType<HierarchyProps>;
  readonly Code: ComponentType<CodeProps>;
}

/** The props an element arrives with: hast-to-jsx joins an array property with spaces, and a list of names arrives as JSON. */
type Wire<Props> = {
  readonly [Key in keyof Props]: Props[Key] extends
    | readonly (string | number)[]
    | undefined
    ? string | number | undefined
    : Props[Key];
};

declare module "react" {
  namespace JSX {
    // The elements a generated page uses besides HTML, with the properties the page gives them.
    interface IntrinsicElements {
      "api-meta": MetaProps;
      "api-comment": Wire<CommentProps>;
      "api-description": ChildrenProps;
      "api-deprecation": ChildrenProps;
      "api-remarks": ChildrenProps;
      "api-custom": CustomProps;
      "api-example": ChildrenProps;
      "api-caption": ChildrenProps;
      "api-see": ChildrenProps;
      "api-import": ChildrenProps;
      "api-contents": ChildrenProps;
      "api-group": GroupProps;
      "api-index": ChildrenProps;
      "api-row": Wire<RowProps>;
      "api-export": Wire<ExportProps>;
      "api-signatures": SignaturesProps;
      "api-signature": Wire<SignatureProps>;
      "api-members": ChildrenProps;
      "api-property": MemberProps;
      "api-method": MemberProps;
      "api-accessor": MemberProps;
      "api-enum-member": MemberProps;
      "api-getter": ChildrenProps;
      "api-setter": ChildrenProps;
      "api-type-parameters": ChildrenProps;
      "api-type-parameter": TypeParameterProps;
      "api-parameters": ChildrenProps;
      "api-parameter": ParameterProps;
      "api-returns": ChildrenProps;
      "api-throws": ChildrenProps;
      "api-throw": Wire<ThrowProps>;
      "api-error": ChildrenProps;
      "api-form": Wire<FormProps>;
      "api-described": Wire<DescribedProps>;
      "api-related": ChildrenProps;
      "api-relation": RelationProps;
      "api-namespace": NamespaceProps;
      "api-trait": TraitProps;
      "api-explanation": ExplanationProps;
      "api-hierarchy": {
        name: string;
        slot: "title" | "header";
        children?: ReactNode;
      };
      "api-hierarchy-node": HierarchyNode & { index: number };
      "api-hierarchy-edge": { base: number; derived: number };
      "api-code": {
        lang?: string;
        context?: CodeProps["context"];
        children?: ReactNode;
      };
    }
  }
}

export interface BodyProps {
  /** The page's body as the extraction writes it. */
  readonly tree: Root;
  readonly components: Components;
  /** The host's components for plain HTML elements, such as its MDX components. */
  readonly html?: Partial<HtmlComponents>;
  /** The URL of a link on the page. A link to another page is relative to the page's file, which the loader's `resolveHref` resolves. */
  readonly resolve: (href: string) => string;
}

/** `element` with `resolve` applied to its `href` and to those of the elements inside it, such as the links in code. */
const linked =
  (resolve: (href: string) => string) =>
  (element: Element): Element => {
    const children = Array.map(element.children, (child): ElementContent => {
      if (child.type !== "element") {
        return child;
      }

      return linked(resolve)(child);
    });
    const properties = { ...element.properties };
    for (const key of ["href", "declaration"]) {
      const value = properties[key];
      if (typeof value === "string") {
        properties[key] = resolve(value);
      }
    }

    return Struct.assign(element, { properties, children });
  };

/** Draws a generated page's body with the host's components. */
export const Body = ({
  tree,
  components: drawn,
  html,
  resolve,
}: BodyProps): ReactNode => {
  const body: Root = Struct.assign(tree, {
    children: Array.map(tree.children, (child): RootContent => {
      if (child.type !== "element") {
        return child;
      }

      return linked(resolve)(child);
    }),
  });
  return toJsx(body, {
    components: Struct.assign(html ?? {}, Elements.of(drawn)),
  });
};
