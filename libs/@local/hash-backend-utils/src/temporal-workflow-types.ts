import { VersionedUrl } from "@blockprotocol/type-system";
import { Issue, Team, User } from "@linear/sdk";
import { Entity, EntityPropertiesObject } from "@local/hash-subgraph";

export type PartialEntity = {
  properties: Partial<Entity["properties"]>;
  entityTypeId: VersionedUrl;
};

export type CreateHashIssueWorkflow = (params: {
  payload: Issue;
  ownedById: string;
  actorId: string;
}) => Promise<void>;

export type CreateHashUserWorkflow = (params: {
  payload: User;
  ownedById: string;
  actorId: string;
}) => Promise<void>;

export type ReadLinearTeamsWorkflow = (params: {
  apiKey: string;
}) => Promise<Team[]>;

export type SyncWorkspaceWorkflow = (params: {
  apiKey: string;
  workspaceAccountId: string;
  actorId: string;
  teamIds: string[];
}) => Promise<void>;

export type UpdateHashIssueWorkflow = (params: {
  payload: Issue;
  actorId: string;
}) => Promise<void>;

export type UpdateLinearIssueWorkflow = (params: {
  apiKey: string;
  issueId: Issue["id"];
  payload: EntityPropertiesObject;
}) => Promise<PartialEntity | undefined>;

export type UpdateHashUserWorkflow = (params: {
  payload: User;
  actorId: string;
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
