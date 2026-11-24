import type * as AST from "../AST/index.js";
import type * as Node from "./Node.js";
import type { Array } from "effect";

/** A type in a hierarchy, by its node in the AST, in one of four roles: `current` for the export's own, `trait`, `type` for one the reference documents, and `external` for one documented elsewhere. */
export interface HierarchyNode extends Node.Node<
  "hierarchyNode",
  AST.Target.Interned
> {
  readonly role: "current" | "trait" | "type" | "external";
  readonly label: string;
}

export interface Edge {
  readonly base: HierarchyNode;
  readonly derived: HierarchyNode;
}

/** The graph of a type's bases and of the types that extend it, around the type it belongs to. Its edges hold the nodes themselves. */
export interface Hierarchy extends Node.Node<"hierarchy", AST.Target.Interned> {
  readonly nodes: Array.NonEmptyReadonlyArray<HierarchyNode>;
  readonly edges: Array.NonEmptyReadonlyArray<Edge>;
}
