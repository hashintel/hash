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
import type { Brand } from "@blockprotocol/type-system";
export type PolicyId = Brand<string, "PolicyId">;
export interface ResolvedPolicy {
	effect: Effect;
	actions: ActionName[];
	resource: (ResourceConstraint | null);
}
export type ActionName = "createPolicy" | "createDataType" | "createEntity" | "createEntityType" | "createPropertyType" | "createWeb" | "viewPolicy" | "viewDataType" | "viewEntity" | "viewEntityType" | "viewPropertyType" | "updatePolicy" | "updateDataType" | "updateEntity" | "updateEntityType" | "updatePropertyType" | "archivePolicy" | "archiveDataType" | "archiveEntity" | "archiveEntityType" | "archivePropertyType" | "deletePolicy" | "instantiate";
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
	type: "meta"
} & MetaResourceConstraint | {
	type: "web"
	webId: WebId
} | {
	type: "entity"
} & EntityResourceConstraint | {
	type: "entityType"
} & EntityTypeResourceConstraint | {
	type: "propertyType"
} & PropertyTypeResourceConstraint | {
	type: "dataType"
} & DataTypeResourceConstraint;
export type DataTypeId = string;
export type DataTypeResourceConstraint = {
	filter: DataTypeResourceFilter
} | {
	id: DataTypeId
} | {
	webId: WebId
	filter: DataTypeResourceFilter
};
export type DataTypeResourceFilter = {
	type: "all"
	filters: DataTypeResourceFilter[]
} | {
	type: "any"
	filters: DataTypeResourceFilter[]
} | {
	type: "not"
	filter: DataTypeResourceFilter
} | {
	type: "isBaseUrl"
	baseUrl: BaseUrl
} | {
	type: "isVersion"
	version: OntologyTypeVersion
} | {
	type: "isRemote"
};
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
export type MetaResourceConstraint = {
	filter: MetaResourceFilter
} | {
	webId: WebId
	filter: MetaResourceFilter
};
export type MetaResourceFilter = {
	type: "all"
	filters: MetaResourceFilter[]
} | {
	type: "any"
	filters: MetaResourceFilter[]
} | {
	type: "not"
	filter: MetaResourceFilter
} | {
	type: "hasAction"
	action: ActionName
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
	actions: ActionName[];
}
