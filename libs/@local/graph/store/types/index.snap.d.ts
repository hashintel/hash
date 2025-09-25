// This file was generated from `libs/@local/graph/store/tests/codegen.rs`

import type { ActionName, Effect, PrincipalConstraint } from "@rust/hash-graph-authorization/types";
import type { EntityEditionId } from "@blockprotocol/type-system-rs/types";
export interface CreateEntityPolicyParams {
	name: string;
	effect: Effect;
	principal: (PrincipalConstraint | null);
	actions: ActionName[];
}
export interface EntityPermissions {
	update: EntityEditionId[];
}
export type EntityTraversalEdgeDirection = "incoming" | "outgoing";
export type OntologyTraversalEdgeDirection = "outgoing";
export type TraversalEdge = {
	kind: "inherits-from"
	direction: OntologyTraversalEdgeDirection
} | {
	kind: "constrains-values-on"
	direction: OntologyTraversalEdgeDirection
} | {
	kind: "constrains-properties-on"
	direction: OntologyTraversalEdgeDirection
} | {
	kind: "constrains-links-on"
	direction: OntologyTraversalEdgeDirection
} | {
	kind: "constrains-link-destinations-on"
	direction: OntologyTraversalEdgeDirection
} | {
	kind: "is-of-type"
	direction: OntologyTraversalEdgeDirection
} | {
	kind: "has-left-entity"
	direction: EntityTraversalEdgeDirection
} | {
	kind: "has-right-entity"
	direction: EntityTraversalEdgeDirection
};
export type TraversalEdgeKind = {
	kind: "inherits-from"
} | {
	kind: "constrains-values-on"
} | {
	kind: "constrains-properties-on"
} | {
	kind: "constrains-links-on"
} | {
	kind: "constrains-link-destinations-on"
} | {
	kind: "is-of-type"
} | {
	kind: "has-left-entity"
} | {
	kind: "has-right-entity"
};
export interface TraversalPath {
	edges: TraversalEdge[];
}
