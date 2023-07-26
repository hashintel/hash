import {
  Connection,
  Issue,
  LinearClient,
  LinearDocument,
  Team,
  User,
} from "@linear/sdk";
import { GraphApi } from "@local/hash-graph-client";
import { linearTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/src/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

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

const updateEntity = async (params: {
  graphApiClient: GraphApi;
  entity: PartialEntity;
  actorId: string;
}): Promise<void> => {
  const idBaseUrl = extractBaseUrl(linearTypes.propertyType.id.propertyTypeId);
  const linearId = params.entity.properties[idBaseUrl];
  if (!linearId) {
    throw new Error(`No linear id found.`);
  }
  const [entity, ...unexpectedEntities] = await params.graphApiClient
    .getEntitiesByQuery({
      filter: {
        all: [
          {
            equal: [
              { path: ["versionedUrl"] },
              { parameter: params.entity.entityTypeId },
            ],
          },
          {
            equal: [
              {
                path: ["properties", idBaseUrl],
              },
              { parameter: linearId },
            ],
          },
        ],
      },
      graphResolveDepths: {
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn: { outgoing: 0 },
        constrainsPropertiesOn: { outgoing: 0 },
        constrainsLinksOn: { outgoing: 0 },
        constrainsLinkDestinationsOn: { outgoing: 0 },
        isOfType: { outgoing: 0 },
        hasLeftEntity: { incoming: 0, outgoing: 0 },
        hasRightEntity: { incoming: 0, outgoing: 0 },
      },
      temporalAxes: {
        pinned: {
          axis: "transactionTime",
          timestamp: null,
        },
        variable: {
          axis: "decisionTime",
          interval: {
            start: null,
            end: null,
          },
        },
      },
    })
    .then(({ data: linearEntities }) =>
      getRoots(linearEntities as Subgraph<EntityRootType>),
    );

  if (unexpectedEntities.length > 0) {
    throw new Error(`More than one entities returned.`);
  }

  if (!entity) {
    throw new Error(`No entity returned.`);
  }

  await params.graphApiClient.updateEntity({
    actorId: params.actorId,
    archived: false,
    entityId: entity.metadata.recordId.entityId,
    entityTypeId: entity.metadata.entityTypeId,
    properties: params.entity.properties,
  });
};

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

  async updateUsers(params: { user: User; actorId: string }): Promise<void> {
    await updateEntity({
      graphApiClient,
      entity: userToEntity(params.user),
      actorId: params.actorId,
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

  async updateIssue(params: { issue: Issue; actorId: string }): Promise<void> {
    await updateEntity({
      graphApiClient,
      entity: issueToEntity(params.issue),
      actorId: params.actorId,
    });
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
