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

export type CreateHashIssueWorkflow = (params: {
  authentication: { actorId: AccountId };
  payload: Issue;
  ownedById: OwnedById;
}) => Promise<void>;

export type CreateHashUserWorkflow = (params: {
  authentication: { actorId: AccountId };
  payload: User;
  ownedById: OwnedById;
}) => Promise<void>;

export type ReadLinearTeamsWorkflow = (params: {
  apiKey: string;
}) => Promise<Team[]>;

export type SyncWorkspaceWorkflow = (params: {
  authentication: { actorId: AccountId };
  apiKey: string;
  workspaceAccountId: AccountId;
  teamIds: string[];
}) => Promise<void>;

export type UpdateHashIssueWorkflow = (params: {
  authentication: { actorId: AccountId };
  payload: Issue;
}) => Promise<void>;

export type UpdateLinearIssueWorkflow = (params: {
  apiKey: string;
  issueId: Issue["id"];
  payload: EntityPropertiesObject;
}) => Promise<void>;

export type UpdateHashUserWorkflow = (params: {
  authentication: { actorId: AccountId };
  payload: User;
}) => Promise<void>;

export type WorkflowTypeMap = {
  createHashIssue: CreateHashIssueWorkflow;
  createHashUser: CreateHashUserWorkflow;
  readLinearTeams: ReadLinearTeamsWorkflow;
  syncWorkspace: SyncWorkspaceWorkflow;
  updateHashIssue: UpdateHashIssueWorkflow;
  updateHashUser: UpdateHashUserWorkflow;
  updateLinearIssue: UpdateLinearIssueWorkflow;
};
