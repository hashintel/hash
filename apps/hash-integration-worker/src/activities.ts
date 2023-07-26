import {
  Attachment,
  Comment,
  Connection,
  CustomView,
  Cycle,
  Document,
  Issue,
  IssueLabel,
  LinearClient,
  LinearDocument,
  Organization,
  Project,
  ProjectMilestone,
  Team,
  User,
} from "@linear/sdk";
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
  graphApiClient,
}: {
  linearClient: LinearClient;
  graphApiClient: GraphApi;
}) => ({
  async me(): Promise<User> {
    return await linearClient.viewer;
  },

  async organization(): Promise<Organization> {
    return await linearClient.organization;
  },

  async teams(): Promise<Team[]> {
    return await linearClient.teams().then(readNodes);
  },

  async issues(filter?: { teamId?: string }): Promise<Issue[]> {
    const issuesQueryVariables: LinearDocument.IssuesQueryVariables = {
      filter: {},
    };
    if (filter?.teamId) {
      issuesQueryVariables.filter!.team = { id: { eq: filter.teamId } };
    }
    return linearClient.issues(issuesQueryVariables).then(readNodes);
  },

  async users(): Promise<User[]> {
    return linearClient.users().then(readNodes);
  },

  async cycles(filter?: { teamId?: string }): Promise<Cycle[]> {
    const cyclesQueryVariables: LinearDocument.CyclesQueryVariables = {
      filter: {},
    };
    if (filter?.teamId) {
      cyclesQueryVariables.filter!.team = { id: { eq: filter.teamId } };
    }
    return linearClient.cycles(cyclesQueryVariables).then(readNodes);
  },

  async customViews(): Promise<CustomView[]> {
    return linearClient.customViews().then(readNodes);
  },

  async projects(): Promise<Project[]> {
    return linearClient.projects().then(readNodes);
  },

  async comments(filter?: { teamId?: string }): Promise<Comment[]> {
    const commentsQueryVariables: LinearDocument.CommentsQueryVariables = {
      filter: {},
    };
    if (filter?.teamId) {
      commentsQueryVariables.filter!.issue = {
        team: { id: { eq: filter.teamId } },
      };
    }
    return linearClient.comments(commentsQueryVariables).then(readNodes);
  },

  async projectMilestones(): Promise<ProjectMilestone[]> {
    return (
      await Promise.all(
        (
          await linearClient.projects().then(readNodes)
        ).map(
          async (project) => await project.projectMilestones().then(readNodes),
        ),
      )
    ).flat();
  },

  async documents(): Promise<Document[]> {
    return await linearClient.documents().then(readNodes);
  },

  async issueLabels(filter?: { teamId?: string }): Promise<IssueLabel[]> {
    const issueLabelsQueryVariables: LinearDocument.IssueLabelsQueryVariables =
      { filter: {} };
    if (filter?.teamId) {
      issueLabelsQueryVariables.filter = {
        team: { id: { eq: filter.teamId } },
      };
    }
    return await linearClient.issueLabels().then(readNodes);
  },

  async attachments(): Promise<Attachment[]> {
    return await linearClient.attachments().then(readNodes);
  },
});
