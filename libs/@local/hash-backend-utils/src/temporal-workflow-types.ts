import { VersionedUrl } from "@blockprotocol/type-system";
import { Issue, Team, User } from "@linear/sdk";
import {
  AccountId,
  Entity,
  EntityPropertiesObject,
  OwnedById,
} from "@local/hash-subgraph";

export type PartialEntity = {
  properties: Partial<Entity["properties"]>;
  entityTypeId: VersionedUrl;
};

export type LinearWebhookPayload = {
  Issue: Issue;
  User: User;
};

export type LinearWebhookPayloadKind = keyof LinearWebhookPayload;

export type CreateHashEntityFromLinearData = <
  K extends LinearWebhookPayloadKind = LinearWebhookPayloadKind,
>(params: {
  authentication: { actorId: AccountId };
  payload: LinearWebhookPayload[K];
  payloadKind: K;
  ownedById: OwnedById;
}) => Promise<void>;

export type UpdateHashEntityFromLinearData = <
  K extends LinearWebhookPayloadKind = LinearWebhookPayloadKind,
>(params: {
  authentication: { actorId: AccountId };
  payload: LinearWebhookPayload[K];
  payloadKind: K;
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

export type UpdateLinearIssueWorkflow = (params: {
  apiKey: string;
  issueId: Issue["id"];
  payload: EntityPropertiesObject;
}) => Promise<void>;

export type WorkflowTypeMap = {
  syncWorkspace: SyncWorkspaceWorkflow;
  readLinearTeams: ReadLinearTeamsWorkflow;

  createHashEntityFromLinearData: CreateHashEntityFromLinearData;
  updateHashEntityFromLinearData: UpdateHashEntityFromLinearData;

  /** @todo: replace these with a generic `updateLinearData` workflow */
  updateLinearIssue: UpdateLinearIssueWorkflow;
};
