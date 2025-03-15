import type { ActorGroupId, ActorId } from "@blockprotocol/type-system";

/** An ID to uniquely identify an authorization subject (either a User or an Org) */
export type AuthorizationSubjectId = ActorId | ActorGroupId;
