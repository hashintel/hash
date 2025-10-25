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
	update?: [EntityEditionId, ...EntityEditionId[]];
}
export type EdgeDirection = "incoming" | "outgoing";
export interface GraphResolveDepths {
	inheritsFrom?: number;
	constrainsValuesOn?: number;
	constrainsPropertiesOn?: number;
	constrainsLinksOn?: number;
	constrainsLinkDestinationsOn?: number;
	isOfType?: boolean;
}
export type EntityTraversalEdge = {
	kind: "has-left-entity";
	direction: EdgeDirection;
} | {
	kind: "has-right-entity";
	direction: EdgeDirection;
};
export type EntityTraversalEdgeKind = {
	kind: "has-left-entity";
} | {
	kind: "has-right-entity";
};
export interface EntityTraversalPath {
	edges: EntityTraversalEdge[];
}
export type TraversalEdge = {
	kind: "inherits-from";
} | {
	kind: "constrains-values-on";
} | {
	kind: "constrains-properties-on";
} | {
	kind: "constrains-links-on";
} | {
	kind: "constrains-link-destinations-on";
} | {
	kind: "is-of-type";
} | {
	kind: "has-left-entity";
	direction: EdgeDirection;
} | {
	kind: "has-right-entity";
	direction: EdgeDirection;
};
export type TraversalEdgeKind = {
	kind: "inherits-from";
} | {
	kind: "constrains-values-on";
} | {
	kind: "constrains-properties-on";
} | {
	kind: "constrains-links-on";
} | {
	kind: "constrains-link-destinations-on";
} | {
	kind: "is-of-type";
} | {
	kind: "has-left-entity";
} | {
	kind: "has-right-entity";
};
export interface TraversalPath {
	edges: TraversalEdge[];
}
