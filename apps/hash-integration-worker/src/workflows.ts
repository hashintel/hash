import { proxyActivities } from "@temporalio/workflow";

import { createLinearIntegrationActivities } from "./activities";
import * as mappings from "./mappings";

export const linear = proxyActivities<
  ReturnType<typeof createLinearIntegrationActivities>
>({
  startToCloseTimeout: "180 second",
  retry: {
    maximumAttempts: 3,
  },
});

export const linearMe = async (): Promise<object> =>
  mappings.userToEntity(await linear.me());
export const linearOrganization = async (): Promise<object> =>
  mappings.organizationToEntity(await linear.organization());
export const linearTeams = async (): Promise<object[]> =>
  await linear.teams().then((teams) => teams.map(mappings.teamToEntity));
export const linearIssues = async (filter?: {
  teamId?: string;
}): Promise<object[]> =>
  await linear
    .issues(filter)
    .then((issues) => issues.map(mappings.issueToEntity));
export const linearIssueLabels = async (filter?: {
  teamId?: string;
}): Promise<object[]> =>
  await linear
    .issueLabels(filter)
    .then((issueLabels) => issueLabels.map(mappings.issueLabelToEntity));
export const linearUsers = async (): Promise<object[]> =>
  await linear.users().then((users) => users.map(mappings.userToEntity));
export const linearCycles = async (filter?: {
  teamId?: string;
}): Promise<object[]> =>
  await linear
    .cycles(filter)
    .then((cycles) => cycles.map(mappings.cycleToEntity));
export const linearCustomViews = async (): Promise<object[]> =>
  await linear
    .customViews()
    .then((customViews) => customViews.map(mappings.customViewToEntity));
export const linearProjects = async (): Promise<object[]> =>
  await linear
    .projects()
    .then((projects) => projects.map(mappings.projectToEntity));
export const linearComments = async (filter?: {
  teamId?: string;
}): Promise<object[]> =>
  await linear
    .comments(filter)
    .then((comments) => comments.map(mappings.commentToEntity));
export const linearProjectMilestones = async (): Promise<object[]> =>
  await linear
    .projectMilestones()
    .then((projectMilestones) =>
      projectMilestones.map(mappings.projectMilestoneToEntity),
    );
export const linearDocuments = async (): Promise<object[]> =>
  await linear
    .documents()
    .then((documents) => documents.map(mappings.documentToEntity));
export const linearAttachments = async (): Promise<object[]> =>
  await linear
    .attachments()
    .then((attachments) => attachments.map(mappings.attachmentToEntity));
