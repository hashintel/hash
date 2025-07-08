import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  EntityId,
} from "@blockprotocol/type-system";

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
