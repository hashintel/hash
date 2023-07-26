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

export const linearMe = async (): Promise<object> => linear.me();
export const linearUsers = async (): Promise<object[]> => linear.users();

export const linearOrganization = async (): Promise<object> =>
  linear.organization();
export const linearTeams = async (): Promise<object[]> => linear.teams();
export const linearIssues = async (filter?: {
  teamId?: string;
}): Promise<object[]> => linear.issues(filter);
export const linearIssueLabels = async (filter?: {
  teamId?: string;
}): Promise<object[]> => linear.issueLabels(filter);
export const linearCycles = async (filter?: {
  teamId?: string;
}): Promise<object[]> => linear.cycles(filter);
export const linearCustomViews = async (): Promise<object[]> =>
  linear.customViews();
export const linearProjects = async (): Promise<object[]> => linear.projects();
export const linearComments = async (filter?: {
  teamId?: string;
}): Promise<object[]> => linear.comments(filter);
export const linearProjectMilestones = async (): Promise<object[]> =>
  linear.projectMilestones();
export const linearDocuments = async (): Promise<object[]> =>
  linear.documents();
export const linearAttachments = async (): Promise<object[]> =>
  linear.attachments();
