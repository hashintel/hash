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
import {
  EntityPropertiesObject,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import {
  attachmentToEntity,
  commentToEntity,
  customViewToEntity,
  cycleToEntity,
  documentToEntity,
  entityPropertiesToIssueUpdate,
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
              { path: ["type", "versionedUrl"] },
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

const createLinearClient = (apiKey: string) => new LinearClient({ apiKey });

type ParamsWithApiKey<T = {}> = T & { apiKey: string };

export const createLinearIntegrationActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async createPartialEntities(params: {
    entities: PartialEntity[];
    actorId: string;
    workspaceAccountId: string;
  }): Promise<void> {
    await Promise.all(
      params.entities.map(({ properties, entityTypeId }) =>
        graphApiClient.createEntity({
          actorId: params.actorId,
          entityTypeId,
          ownedById: params.workspaceAccountId,
          properties,
        }),
      ),
    );
  },

  async readOrganization({
    apiKey,
  }: ParamsWithApiKey<{}>): Promise<PartialEntity> {
    return createLinearClient(apiKey).organization.then(organizationToEntity);
  },

  async createUser(params: {
    user: User;
    actorId: string;
    ownedById: string;
  }): Promise<void> {
    const entity = userToEntity(params.user);
    await graphApiClient.createEntity({
      actorId: params.actorId,
      ownedById: params.ownedById,
      entityTypeId: entity.entityTypeId,
      properties: entity.properties,
    });
  },

  async updateUser(params: { user: User; actorId: string }): Promise<void> {
    await updateEntity({
      graphApiClient,
      entity: userToEntity(params.user),
      actorId: params.actorId,
    });
  },

  async readUsers({ apiKey }: ParamsWithApiKey): Promise<PartialEntity[]> {
    return createLinearClient(apiKey)
      .users()
      .then(readNodes)
      .then((users) => users.map(userToEntity));
  },

  async createIssue(params: {
    issue: Issue;
    actorId: string;
    ownedById: string;
  }): Promise<void> {
    const entity = issueToEntity(params.issue);
    await graphApiClient.createEntity({
      actorId: params.actorId,
      ownedById: params.ownedById,
      entityTypeId: entity.entityTypeId,
      properties: entity.properties,
    });
  },

  async readIssues({
    apiKey,
    filter,
  }: ParamsWithApiKey<{ filter?: { teamId?: string } }>): Promise<
    PartialEntity[]
  > {
    const issuesQueryVariables: LinearDocument.IssuesQueryVariables = {
      filter: {},
    };
    if (filter?.teamId) {
      issuesQueryVariables.filter!.team = { id: { eq: filter.teamId } };
    }
    return createLinearClient(apiKey)
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

  async readTeams({ apiKey }: ParamsWithApiKey): Promise<Team[]> {
    return createLinearClient(apiKey).teams().then(readNodes);
  },

  async readCycles({
    apiKey,
    filter,
  }: ParamsWithApiKey<{ filter?: { teamId?: string } }>): Promise<object[]> {
    const cyclesQueryVariables: LinearDocument.CyclesQueryVariables = {
      filter: {},
    };
    if (filter?.teamId) {
      cyclesQueryVariables.filter!.team = { id: { eq: filter.teamId } };
    }
    return createLinearClient(apiKey)
      .cycles(cyclesQueryVariables)
      .then(readNodes)
      .then((cycles) => cycles.map(cycleToEntity));
  },

  async readCustomViews({ apiKey }: ParamsWithApiKey): Promise<object[]> {
    return createLinearClient(apiKey)
      .customViews()
      .then(readNodes)
      .then((customViews) => customViews.map(customViewToEntity));
  },

  async readProjects({ apiKey }: ParamsWithApiKey): Promise<object[]> {
    return createLinearClient(apiKey)
      .projects()
      .then(readNodes)
      .then((projects) => projects.map(projectToEntity));
  },

  async readComments({
    apiKey,
    filter,
  }: ParamsWithApiKey<{ filter?: { teamId?: string } }>): Promise<object[]> {
    const commentsQueryVariables: LinearDocument.CommentsQueryVariables = {
      filter: {},
    };
    if (filter?.teamId) {
      commentsQueryVariables.filter!.issue = {
        team: { id: { eq: filter.teamId } },
      };
    }
    return createLinearClient(apiKey)
      .comments(commentsQueryVariables)
      .then(readNodes)
      .then((comments) => comments.map(commentToEntity));
  },

  async readProjectMilestones({ apiKey }: ParamsWithApiKey): Promise<object[]> {
    const linearClient = createLinearClient(apiKey);

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

  async readDocuments({ apiKey }: ParamsWithApiKey): Promise<object[]> {
    return createLinearClient(apiKey)
      .documents()
      .then(readNodes)
      .then((documents) => documents.map(documentToEntity));
  },

  async readIssueLabels({
    apiKey,
    filter,
  }: ParamsWithApiKey<{ filter?: { teamId?: string } }>): Promise<object[]> {
    const issueLabelsQueryVariables: LinearDocument.IssueLabelsQueryVariables =
      { filter: {} };
    if (filter?.teamId) {
      issueLabelsQueryVariables.filter = {
        team: { id: { eq: filter.teamId } },
      };
    }
    return createLinearClient(apiKey)
      .issueLabels()
      .then(readNodes)
      .then((issueLabels) => issueLabels.map(issueLabelToEntity));
  },

  async readAttachments({ apiKey }: ParamsWithApiKey): Promise<object[]> {
    return createLinearClient(apiKey)
      .attachments()
      .then(readNodes)
      .then((attachments) => attachments.map(attachmentToEntity));
  },

  async updateLinearIssue(
    apiKey: string,
    issueId: Issue["id"],
    update: EntityPropertiesObject,
  ): Promise<PartialEntity | undefined> {
    const client = createLinearClient(apiKey);

    const linearUpdate = entityPropertiesToIssueUpdate(update);

    const updatedIssue = await client
      .updateIssue(issueId, linearUpdate)
      .then(async (data) => {
        const issue = await data.issue;
        if (issue) {
          return issueToEntity(issue);
        }
        return undefined;
      });

    return updatedIssue;
  },
});
