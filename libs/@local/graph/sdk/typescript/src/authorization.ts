import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  EntityId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type {
  DataTypeRelationAndSubject as DataTypeRelationAndSubjectGraph,
  EntityRelationAndSubject as EntityRelationAndSubjectGraph,
  EntityTypeInstantiatorSubject as EntityTypeInstantiatorSubjectGraph,
  EntityTypeRelationAndSubject as EntityTypeRelationAndSubjectGraph,
  PropertyTypeRelationAndSubject as PropertyTypeRelationAndSubjectGraph,
  WebRelationAndSubject as WebRelationAndSubjectGraph,
} from "@local/hash-graph-client";

type ReplaceAccount<T extends { kind: "account" }> = {
  [P in keyof T]: P extends "subjectId" ? ActorEntityUuid : T[P];
};
type ReplaceAccountGroup<T extends { kind: "accountGroup" }> = {
  [P in keyof T]: P extends "subjectId" ? ActorGroupEntityUuid : T[P];
};

type BrandSubject<T extends object> = T extends { kind: "account" }
  ? ReplaceAccount<T>
  : T extends { kind: "accountGroup" }
    ? ReplaceAccountGroup<T>
    : T;

type BrandRelationship<T extends { subject: object }> = {
  [K in keyof T]: K extends "subject" ? BrandSubject<T[K]> : T[K];
};

export type EntityTypeInstantiatorSubjectBranded =
  BrandSubject<EntityTypeInstantiatorSubjectGraph>;

export type WebRelationAndSubjectBranded =
  BrandRelationship<WebRelationAndSubjectGraph>;

export type WebAuthorizationRelationship = {
  resource: {
    kind: "web";
    resourceId: WebId;
  };
} & WebRelationAndSubjectBranded;

export type EntityRelationAndSubjectBranded =
  BrandRelationship<EntityRelationAndSubjectGraph>;

export type EntityAuthorizationRelationship = {
  resource: {
    kind: "entity";
    resourceId: EntityId;
  };
} & EntityRelationAndSubjectBranded;

export type EntityTypeRelationAndSubjectBranded =
  BrandRelationship<EntityTypeRelationAndSubjectGraph>;

export type EntityTypeAuthorizationRelationship = {
  resource: {
    kind: "entityType";
    resourceId: VersionedUrl;
  };
} & EntityTypeRelationAndSubjectBranded;

export type PropertyTypeRelationAndSubjectBranded =
  BrandRelationship<PropertyTypeRelationAndSubjectGraph>;

export type PropertyTypeAuthorizationRelationship = {
  resource: {
    kind: "propertyType";
    resourceId: VersionedUrl;
  };
} & PropertyTypeRelationAndSubjectBranded;

export type DataTypeRelationAndSubjectBranded =
  BrandRelationship<DataTypeRelationAndSubjectGraph>;

export type DataTypeAuthorizationRelationship = {
  resource: {
    kind: "dataType";
    resourceId: VersionedUrl;
  };
} & DataTypeRelationAndSubjectBranded;

/** An ID to uniquely identify an authorization subject (either a User or an Org) */
export type AuthorizationSubjectId = ActorEntityUuid | ActorGroupEntityUuid;

export type UserPermissions = {
  view: boolean;
  viewPermissions: boolean;
  edit: boolean;
  editMembers: boolean | null;
  editPermissions: boolean;
};

export type UserPermissionsOnEntityType = {
  view: boolean;
  edit: boolean;
  instantiate: boolean;
};

export type UserPermissionsOnDataType = {
  view: boolean;
  edit: boolean;
};

export type UserPermissionsOnEntities = {
  [key: EntityId]: UserPermissions | undefined;
};
