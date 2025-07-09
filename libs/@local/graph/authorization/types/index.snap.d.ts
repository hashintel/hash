// This file was generated from `libs/@local/graph/authorization/tests/codegen.rs`

import type { ActorId, ActorType, ActorGroupId, BaseUrl, EntityUuid, OntologyTypeVersion, RoleId, WebId } from "@blockprotocol/type-system-rs/types";
import type { VersionedUrl } from "@blockprotocol/type-system-rs";
export type Effect = "permit" | "forbid";
export interface Policy {
	id: PolicyId;
	name?: string;
	effect: Effect;
	principal: (PrincipalConstraint | null);
	actions: ActionName[];
	resource: (ResourceConstraint | null);
}
import type { Brand } from "@local/advanced-types/brand";
export type PolicyId = Brand<string, "PolicyId">;
export type ActionName = "createEntity" | "createEntityType" | "createPropertyType" | "createWeb" | "viewEntity" | "viewEntityType" | "viewPropertyType" | "updateEntity" | "updateEntityType" | "updatePropertyType" | "archiveEntity" | "archiveEntityType" | "archivePropertyType" | "instantiate";
export type PrincipalConstraint = {
	type: "actor"
} & ActorId | {
	type: "actorType"
	actorType: ActorType
} | {
	type: "actorGroup"
	actorType?: ActorType
} & ActorGroupId | {
	type: "role"
	actorType?: ActorType
} & RoleId;
export type ResourceConstraint = {
	type: "web"
	webId: WebId
} | {
	type: "entity"
} & EntityResourceConstraint | {
	type: "entityType"
} & EntityTypeResourceConstraint | {
	type: "propertyType"
} & PropertyTypeResourceConstraint;
export type EntityResourceConstraint = {
	filter: EntityResourceFilter
} | {
	id: EntityUuid
} | {
	webId: WebId
	filter: EntityResourceFilter
};
export type EntityResourceFilter = {
	type: "all"
	filters: EntityResourceFilter[]
} | {
	type: "any"
	filters: EntityResourceFilter[]
} | {
	type: "not"
	filter: EntityResourceFilter
} | {
	type: "isOfType"
	entityType: VersionedUrl
} | {
	type: "isOfBaseType"
	entityType: BaseUrl
} | {
	type: "createdByPrincipal"
};
export type EntityTypeId = string;
export type EntityTypeResourceConstraint = {
	filter: EntityTypeResourceFilter
} | {
	id: EntityTypeId
} | {
	webId: WebId
	filter: EntityTypeResourceFilter
};
export type EntityTypeResourceFilter = {
	type: "all"
	filters: EntityTypeResourceFilter[]
} | {
	type: "any"
	filters: EntityTypeResourceFilter[]
} | {
	type: "not"
	filter: EntityTypeResourceFilter
} | {
	type: "isBaseUrl"
	baseUrl: BaseUrl
} | {
	type: "isVersion"
	version: OntologyTypeVersion
} | {
	type: "isRemote"
};
export type PropertyTypeId = string;
export type PropertyTypeResourceConstraint = {
	filter: PropertyTypeResourceFilter
} | {
	id: PropertyTypeId
} | {
	webId: WebId
	filter: PropertyTypeResourceFilter
};
export type PropertyTypeResourceFilter = {
	type: "all"
	filters: PropertyTypeResourceFilter[]
} | {
	type: "any"
	filters: PropertyTypeResourceFilter[]
} | {
	type: "not"
	filter: PropertyTypeResourceFilter
} | {
	type: "isBaseUrl"
	baseUrl: BaseUrl
} | {
	type: "isVersion"
	version: OntologyTypeVersion
} | {
	type: "isRemote"
};
export interface PolicyCreationParams {
	name?: string;
	effect: Effect;
	principal: (PrincipalConstraint | null);
	actions: ActionName[];
	resource: (ResourceConstraint | null);
}
export interface PolicyFilter {
	name?: string;
	principal?: PrincipalFilter;
}
export type PolicyUpdateOperation = {
	type: "add-action"
	action: ActionName
} | {
	type: "remove-action"
	action: ActionName
} | {
	type: "set-resource-constraint"
	resourceConstraint: (ResourceConstraint | null)
} | {
	type: "set-effect"
	effect: Effect
};
export type PrincipalFilter = {
	filter: "unconstrained"
} | {
	filter: "constrained"
} & PrincipalConstraint;
export interface ResolvePoliciesParams {
	actor: (ActorId | null);
	actions: ActionName[];
}
