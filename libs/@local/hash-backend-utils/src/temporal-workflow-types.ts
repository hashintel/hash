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
  payload: Issue;
  ownedById: OwnedById;
  actorId: AccountId;
}) => Promise<void>;

export type CreateHashUserWorkflow = (params: {
  payload: User;
  ownedById: OwnedById;
  actorId: AccountId;
}) => Promise<void>;

export type ReadLinearTeamsWorkflow = (params: {
  apiKey: string;
}) => Promise<Team[]>;

export type SyncWorkspaceWorkflow = (params: {
  apiKey: string;
  workspaceAccountId: AccountId;
  actorId: AccountId;
  teamIds: string[];
}) => Promise<void>;

export type UpdateHashIssueWorkflow = (params: {
  payload: Issue;
  actorId: AccountId;
}) => Promise<void>;

export type UpdateLinearIssueWorkflow = (params: {
  apiKey: string;
  issueId: Issue["id"];
  payload: EntityPropertiesObject;
}) => Promise<void>;

export type UpdateHashUserWorkflow = (params: {
  payload: User;
  actorId: AccountId;
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
