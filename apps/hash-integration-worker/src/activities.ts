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

const readNodes = async <T>(connection: Connection<T>): Promise<T[]> => {
  const nodes = connection.nodes;
  while (connection.pageInfo.hasNextPage) {
    // eslint-disable-next-line no-param-reassign
    connection = await connection.fetchNext();
    nodes.push(...connection.nodes);
  }
  return nodes;
};

export const createLinearIntegrationActivities = (createInfo: {
  linearClient: LinearClient;
}) => ({
  async me(): Promise<User> {
    return await createInfo.linearClient.viewer;
  },

  async organization(): Promise<Organization> {
    return await createInfo.linearClient.organization;
  },

  async teams(): Promise<Team[]> {
    return await createInfo.linearClient.teams().then(readNodes);
  },

  async issues(filter?: { teamId?: string }): Promise<Issue[]> {
    const issuesQueryVariables: LinearDocument.IssuesQueryVariables = {
      filter: {},
    };
    if (filter && filter.teamId) {
      issuesQueryVariables.filter!.team = { id: { eq: filter.teamId } };
    }
    return createInfo.linearClient.issues(issuesQueryVariables).then(readNodes);
  },

  async users(): Promise<User[]> {
    return createInfo.linearClient.users().then(readNodes);
  },

  async cycles(filter?: { teamId?: string }): Promise<Cycle[]> {
    const cyclesQueryVariables: LinearDocument.CyclesQueryVariables = {
      filter: {},
    };
    if (filter && filter.teamId) {
      cyclesQueryVariables.filter!.team = { id: { eq: filter.teamId } };
    }
    return createInfo.linearClient.cycles(cyclesQueryVariables).then(readNodes);
  },

  async customViews(): Promise<CustomView[]> {
    return createInfo.linearClient.customViews().then(readNodes);
  },

  async projects(): Promise<Project[]> {
    return createInfo.linearClient.projects().then(readNodes);
  },

  async comments(filter?: { teamId?: string }): Promise<Comment[]> {
    const commentsQueryVariables: LinearDocument.CommentsQueryVariables = {
      filter: {},
    };
    if (filter && filter.teamId) {
      commentsQueryVariables.filter!.issue = {
        team: { id: { eq: filter.teamId } },
      };
    }
    return createInfo.linearClient
      .comments(commentsQueryVariables)
      .then(readNodes);
  },

  async projectMilestones(): Promise<ProjectMilestone[]> {
    return (
      await Promise.all(
        (
          await createInfo.linearClient.projects().then(readNodes)
        ).map(
          async (project) => await project.projectMilestones().then(readNodes),
        ),
      )
    ).flat();
  },

  async documents(): Promise<Document[]> {
    return await createInfo.linearClient.documents().then(readNodes);
  },

  async issueLabels(filter?: { teamId?: string }): Promise<IssueLabel[]> {
    const issueLabelsQueryVariables: LinearDocument.IssueLabelsQueryVariables =
      { filter: {} };
    if (filter && filter.teamId) {
      issueLabelsQueryVariables.filter = {
        team: { id: { eq: filter.teamId } },
      };
    }
    return await createInfo.linearClient.issueLabels().then(readNodes);
  },

  async attachments(): Promise<Attachment[]> {
    return await createInfo.linearClient.attachments().then(readNodes);
  },
});
