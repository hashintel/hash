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

export type EntityTypeInstantiatorSubject =
  BrandSubject<EntityTypeInstantiatorSubjectGraph>;

export type WebRelationAndSubject =
  BrandRelationship<WebRelationAndSubjectGraph>;
export type WebAuthorizationRelationship = {
  resource: {
    kind: "web";
    resourceId: WebId;
  };
} & WebRelationAndSubject;

export type EntityRelationAndSubject =
  BrandRelationship<EntityRelationAndSubjectGraph>;
export type EntityAuthorizationRelationship = {
  resource: {
    kind: "entity";
    resourceId: EntityId;
  };
} & EntityRelationAndSubject;

export type EntityTypeRelationAndSubject =
  BrandRelationship<EntityTypeRelationAndSubjectGraph>;
export type EntityTypeAuthorizationRelationship = {
  resource: {
    kind: "entityType";
    resourceId: VersionedUrl;
  };
} & EntityTypeRelationAndSubject;

export type PropertyTypeRelationAndSubject =
  BrandRelationship<PropertyTypeRelationAndSubjectGraph>;
export type PropertyTypeAuthorizationRelationship = {
  resource: {
    kind: "propertyType";
    resourceId: VersionedUrl;
  };
} & PropertyTypeRelationAndSubject;

export type DataTypeRelationAndSubject =
  BrandRelationship<DataTypeRelationAndSubjectGraph>;
export type DataTypeAuthorizationRelationship = {
  resource: {
    kind: "dataType";
    resourceId: VersionedUrl;
  };
} & DataTypeRelationAndSubject;
