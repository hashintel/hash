import {
  Attachment as LinearAttachment,
  Comment as LinearComment,
  CustomView as LinearCustomView,
  Cycle as LinearCycles,
  Document as LinearDocument,
  Issue as LinearIssue,
  IssueLabel as LinearIssueLabel,
  Organization as LinearOrganization,
  Project as LinearProject,
  ProjectMilestone as LinearProjectMilestone,
  Team as LinearTeam,
  User as LinearUser,
} from "@linear/sdk";
import { proxyActivities } from "@temporalio/workflow";

import { createLinearIntegrationActivities } from "./activities";

export const linear = proxyActivities<
  ReturnType<typeof createLinearIntegrationActivities>
>({
  startToCloseTimeout: "180 second",
  retry: {
    maximumAttempts: 3,
  },
});

export const linearMe = async (): Promise<LinearUser> => await linear.me();
export const linearOrganization = async (): Promise<LinearOrganization> =>
  await linear.organization();
export const linearTeams = async (): Promise<LinearTeam[]> =>
  await linear.teams();
export const linearIssues = async (filter?: {
  teamId?: string;
}): Promise<LinearIssue[]> => await linear.issues(filter);
export const linearIssueLabels = async (filter?: {
  teamId?: string;
}): Promise<LinearIssueLabel[]> => await linear.issueLabels(filter);
export const linearUsers = async (): Promise<LinearUser[]> =>
  await linear.users();
export const linearCycles = async (filter?: {
  teamId?: string;
}): Promise<LinearCycles[]> => await linear.cycles(filter);
export const linearCustomViews = async (): Promise<LinearCustomView[]> =>
  await linear.customViews();
export const linearProjects = async (): Promise<LinearProject[]> =>
  await linear.projects();
export const linearComments = async (filter?: {
  teamId?: string;
}): Promise<LinearComment[]> => await linear.comments(filter);
export const linearProjectMilestones = async (): Promise<
  LinearProjectMilestone[]
> => await linear.projectMilestones();
export const linearDocuments = async (): Promise<LinearDocument[]> =>
  await linear.documents();
export const linearAttachments = async (): Promise<LinearAttachment[]> =>
  await linear.attachments();
