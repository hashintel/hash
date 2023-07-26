import { Connection, LinearClient, LinearDocument } from "@linear/sdk";

import {
  attachmentToEntity,
  commentToEntity,
  customViewToEntity,
  cycleToEntity,
  documentToEntity,
  issueLabelToEntity,
  issueToEntity,
  organizationToEntity,
  projectMilestoneToEntity,
  projectToEntity,
  teamToEntity,
  userToEntity,
} from "./mappings";
import { GraphApi } from "@local/hash-graph-client";

const readNodes = async <T>(connection: Connection<T>): Promise<T[]> => {
  const nodes = connection.nodes;
  while (connection.pageInfo.hasNextPage) {
    // eslint-disable-next-line no-param-reassign
    connection = await connection.fetchNext();
    nodes.push(...connection.nodes);
  }
  return nodes;
};

export const createLinearIntegrationActivities = ({
  linearClient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  graphApiClient,
}: {
  linearClient: LinearClient;
  graphApiClient: GraphApi;
}) => ({
  async me(): Promise<object> {
    return linearClient.viewer.then(userToEntity);
  },

  async organization(): Promise<object> {
    return linearClient.organization.then(organizationToEntity);
  },

  async teams(): Promise<object[]> {
    return linearClient
      .teams()
      .then(readNodes)
      .then((teams) => teams.map(teamToEntity));
  },

  async issues(filter?: { teamId?: string }): Promise<object[]> {
    const issuesQueryVariables: LinearDocument.IssuesQueryVariables = {
      filter: {},
    };
    if (filter?.teamId) {
      issuesQueryVariables.filter!.team = { id: { eq: filter.teamId } };
    }
    return linearClient
      .issues(issuesQueryVariables)
      .then(readNodes)
      .then((issues) => issues.map(issueToEntity));
  },

  async users(): Promise<object[]> {
    return linearClient
      .users()
      .then(readNodes)
      .then((users) => users.map(userToEntity));
  },

  async cycles(filter?: { teamId?: string }): Promise<object[]> {
    const cyclesQueryVariables: LinearDocument.CyclesQueryVariables = {
      filter: {},
    };
    if (filter?.teamId) {
      cyclesQueryVariables.filter!.team = { id: { eq: filter.teamId } };
    }
    return linearClient
      .cycles(cyclesQueryVariables)
      .then(readNodes)
      .then((cycles) => cycles.map(cycleToEntity));
  },

  async customViews(): Promise<object[]> {
    return linearClient
      .customViews()
      .then(readNodes)
      .then((customViews) => customViews.map(customViewToEntity));
  },

  async projects(): Promise<object[]> {
    return linearClient
      .projects()
      .then(readNodes)
      .then((projects) => projects.map(projectToEntity));
  },

  async comments(filter?: { teamId?: string }): Promise<object[]> {
    const commentsQueryVariables: LinearDocument.CommentsQueryVariables = {
      filter: {},
    };
    if (filter?.teamId) {
      commentsQueryVariables.filter!.issue = {
        team: { id: { eq: filter.teamId } },
      };
    }
    return linearClient
      .comments(commentsQueryVariables)
      .then(readNodes)
      .then((comments) => comments.map(commentToEntity));
  },

  async projectMilestones(): Promise<object[]> {
    return (
      await Promise.all(
        (
          await linearClient.projects().then(readNodes)
        ).map(
          async (project) =>
            await project
              .projectMilestones()
              .then(readNodes)
              .then((projectMilestones) =>
                projectMilestones.map(projectMilestoneToEntity),
              ),
        ),
      )
    ).flat();
  },

  async documents(): Promise<object[]> {
    return linearClient
      .documents()
      .then(readNodes)
      .then((documents) => documents.map(documentToEntity));
  },

  async issueLabels(filter?: { teamId?: string }): Promise<object[]> {
    const issueLabelsQueryVariables: LinearDocument.IssueLabelsQueryVariables =
      { filter: {} };
    if (filter?.teamId) {
      issueLabelsQueryVariables.filter = {
        team: { id: { eq: filter.teamId } },
      };
    }
    return linearClient
      .issueLabels()
      .then(readNodes)
      .then((issueLabels) => issueLabels.map(issueLabelToEntity));
  },

  async attachments(): Promise<object[]> {
    return linearClient
      .attachments()
      .then(readNodes)
      .then((attachments) => attachments.map(attachmentToEntity));
  },
});
