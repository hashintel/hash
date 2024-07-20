import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Team } from "@linear/sdk";
import type { Entity, SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";

export interface PartialEntity {
  properties: Partial<Entity["properties"]>;
  entityTypeId: VersionedUrl;
}

export const supportedLinearTypes = ["Issue", "User"] as const;

export type SupportedLinearType = (typeof supportedLinearTypes)[number];

export type CreateHashEntityFromLinearData = <
  T extends SupportedLinearType = SupportedLinearType,
>(params: {
  authentication: { actorId: AccountId };
  linearId: string;
  linearType: T;
  linearApiKey: string;
  ownedById: OwnedById;
}) => Promise<void>;

export type UpdateHashEntityFromLinearData = <
  T extends SupportedLinearType = SupportedLinearType,
>(params: {
  authentication: { actorId: AccountId };
  linearId: string;
  linearType: T;
  linearApiKey: string;
  ownedById: OwnedById;
}) => Promise<void>;

export type ReadLinearTeamsWorkflow = (params: {
  apiKey: string;
}) => Promise<Team[]>;

export type SyncWorkspaceWorkflow = (params: {
  authentication: { actorId: AccountId };
  apiKey: string;
  workspaceOwnedById: OwnedById;
  teamIds: string[];
}) => Promise<void>;

export type UpdateLinearDataWorkflow = (params: {
  apiKey: string;
  authentication: { actorId: AccountId };
  linearId: string;
  entityTypeId: VersionedUrl;
  entity: SerializedEntity;
}) => Promise<void>;

export type SyncQueryToGoogleSheetWorkflow = (params: {
  integrationEntityId: EntityId;
  userAccountId: AccountId;
}) => Promise<void>;

export interface WorkflowTypeMap {
  syncWorkspace: SyncWorkspaceWorkflow;
  readLinearTeams: ReadLinearTeamsWorkflow;

  createHashEntityFromLinearData: CreateHashEntityFromLinearData;
  updateHashEntityFromLinearData: UpdateHashEntityFromLinearData;

  updateLinearData: UpdateLinearDataWorkflow;
  /** @todo: add `createLinearData` */
}
