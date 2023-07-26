import {
  Connection,
  Issue,
  LinearClient,
  LinearDocument,
  Team,
  User,
} from "@linear/sdk";
import { GraphApi } from "@local/hash-graph-client";

import {
  attachmentToEntity,
  commentToEntity,
  customViewToEntity,
  cycleToEntity,
  documentToEntity,
  issueLabelToEntity,
  issueToEntity,
  organizationToEntity,
  PartialEntity,
  projectMilestoneToEntity,
  projectToEntity,
  userToEntity,
} from "./mappings";

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

  graphApiClient,
}: {
  linearClient: LinearClient;
  graphApiClient: GraphApi;
}) => ({
  async createPartialEntities(params: {
    entities: PartialEntity[];
    actorId: string;
    ownedById: string;
  }): Promise<void> {
    await Promise.all(
      params.entities.map(({ properties, entityTypeId }) =>
        graphApiClient.createEntity({
          actorId: params.actorId,
          entityTypeId,
          ownedById: params.ownedById,
          properties,
        }),
      ),
    );
  },

  async readOrganization(): Promise<PartialEntity> {
    return linearClient.organization.then(organizationToEntity);
  },

  async createUsers(params: {
    users: User[];
    actorId: string;
    ownedById: string;
  }): Promise<void> {
    await this.createPartialEntities({
      entities: params.users.map(userToEntity),
      actorId: params.actorId,
      ownedById: params.ownedById,
    });
  },

  async readUsers(): Promise<PartialEntity[]> {
    return linearClient
      .users()
      .then(readNodes)
      .then((users) => users.map(userToEntity));
  },

  async createIssues(params: {
    issues: Issue[];
    actorId: string;
    ownedById: string;
  }): Promise<void> {
    await this.createPartialEntities({
      entities: params.issues.map(issueToEntity),
      actorId: params.actorId,
      ownedById: params.ownedById,
    });
  },

  async readIssues(filter?: { teamId?: string }): Promise<PartialEntity[]> {
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

  async readTeams(): Promise<Team[]> {
    return linearClient.teams().then(readNodes);
  },

  async readCycles(filter?: { teamId?: string }): Promise<object[]> {
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

  async readCustomViews(): Promise<object[]> {
    return linearClient
      .customViews()
      .then(readNodes)
      .then((customViews) => customViews.map(customViewToEntity));
  },

  async readProjects(): Promise<object[]> {
    return linearClient
      .projects()
      .then(readNodes)
      .then((projects) => projects.map(projectToEntity));
  },

  async readComments(filter?: { teamId?: string }): Promise<object[]> {
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

  async readProjectMilestones(): Promise<object[]> {
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

  async readDocuments(): Promise<object[]> {
    return linearClient
      .documents()
      .then(readNodes)
      .then((documents) => documents.map(documentToEntity));
  },

  async readIssueLabels(filter?: { teamId?: string }): Promise<object[]> {
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

  async readAttachments(): Promise<object[]> {
    return linearClient
      .attachments()
      .then(readNodes)
      .then((attachments) => attachments.map(attachmentToEntity));
  },
});
