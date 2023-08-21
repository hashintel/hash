import {
  Connection,
  Issue,
  LinearClient,
  LinearDocument,
  Team,
  User,
} from "@linear/sdk";
import { PartialEntity } from "@local/hash-backend-utils/temporal-workflow-types";
import { GraphApi } from "@local/hash-graph-client";
import { linearTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountId,
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
  projectMilestoneToEntity,
  projectToEntity,
  userToEntity,
} from "./mappings";

const createOrUpdateHashEntity = async (params: {
  graphApiClient: GraphApi;
  entity: PartialEntity;
  actorId: AccountId;
  workspaceAccountId?: AccountId;
}): Promise<void> => {
  const idBaseUrl = extractBaseUrl(linearTypes.propertyType.id.propertyTypeId);
  const updatedAtBaseUrl = extractBaseUrl(
    linearTypes.propertyType.updatedAt.propertyTypeId,
  );
  const linearId = params.entity.properties[idBaseUrl];
  const updatedAt = params.entity.properties[updatedAtBaseUrl];
  if (!linearId) {
    throw new Error(`No linear id found.`);
  }

  const filters = [
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
  ];
  if (params.workspaceAccountId) {
    filters.push({
      equal: [
        {
          path: ["ownedById"],
        },
        { parameter: params.workspaceAccountId },
      ],
    });
  }
  const entities = await params.graphApiClient
    .getEntitiesByQuery({
      filter: {
        all: filters,
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

  for (const existingEntity of entities) {
    if (
      updatedAt &&
      existingEntity.properties[updatedAtBaseUrl] &&
      existingEntity.properties[updatedAtBaseUrl]! >= updatedAt
    ) {
      continue;
    }

    await params.graphApiClient.updateEntity({
      actorId: params.actorId,
      archived: false,
      entityId: existingEntity.metadata.recordId.entityId,
      entityTypeId: existingEntity.metadata.entityTypeId,
      properties: params.entity.properties,
    });
  }

  if (entities.length === 0 && params.workspaceAccountId) {
    await params.graphApiClient.createEntity({
      actorId: params.actorId,
      ownedById: params.workspaceAccountId,
      ...params.entity,
    });
  }
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
    actorId: AccountId;
    workspaceAccountId: AccountId;
  }): Promise<void> {
    await Promise.all(
      params.entities.map((entity) =>
        createOrUpdateHashEntity({
          graphApiClient,
          actorId: params.actorId,
          workspaceAccountId: params.workspaceAccountId,
          entity,
        }),
      ),
    );
  },

  async readLinearOrganization({
    apiKey,
  }: ParamsWithApiKey<{}>): Promise<PartialEntity> {
    return createLinearClient(apiKey).organization.then(organizationToEntity);
  },

  async createHashUser(params: {
    user: User;
    actorId: AccountId;
    workspaceAccountId: AccountId;
  }): Promise<void> {
    const entity = userToEntity(params.user);
    await createOrUpdateHashEntity({
      graphApiClient,
      actorId: params.actorId,
      workspaceAccountId: params.workspaceAccountId,
      entity,
    });
  },

  async updateHashUser(params: {
    user: User;
    actorId: AccountId;
  }): Promise<void> {
    await createOrUpdateHashEntity({
      graphApiClient,
      entity: userToEntity(params.user),
      actorId: params.actorId,
    });
  },

  async readLinearUsers({
    apiKey,
  }: ParamsWithApiKey): Promise<PartialEntity[]> {
    return createLinearClient(apiKey)
      .users()
      .then(readNodes)
      .then((users) => users.map(userToEntity));
  },

  async createHashIssue(params: {
    issue: Issue;
    actorId: AccountId;
    workspaceAccountId: AccountId;
  }): Promise<void> {
    const entity = issueToEntity(params.issue);
    await createOrUpdateHashEntity({
      graphApiClient,
      actorId: params.actorId,
      workspaceAccountId: params.workspaceAccountId,
      entity,
    });
  },

  async readLinearIssues({
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

  async updateHashIssue(params: {
    issue: Issue;
    actorId: AccountId;
  }): Promise<void> {
    await createOrUpdateHashEntity({
      graphApiClient,
      entity: issueToEntity(params.issue),
      actorId: params.actorId,
    });
  },

  async readLinearTeams({ apiKey }: ParamsWithApiKey): Promise<Team[]> {
    return createLinearClient(apiKey).teams().then(readNodes);
  },

  async readLinearCycles({
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

  async readLinearComments({
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

  async readLinearProjectMilestones({
    apiKey,
  }: ParamsWithApiKey): Promise<object[]> {
    const linearClient = createLinearClient(apiKey);

    return (
      await Promise.all(
        (await linearClient.projects().then(readNodes)).map(
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

  async readLinearDocuments({ apiKey }: ParamsWithApiKey): Promise<object[]> {
    return createLinearClient(apiKey)
      .documents()
      .then(readNodes)
      .then((documents) => documents.map(documentToEntity));
  },

  async readLinearIssueLabels({
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

  async readLinearAttachments({ apiKey }: ParamsWithApiKey): Promise<object[]> {
    return createLinearClient(apiKey)
      .attachments()
      .then(readNodes)
      .then((attachments) => attachments.map(attachmentToEntity));
  },

  async updateLinearIssue({
    apiKey,
    issueId,
    payload,
  }: {
    apiKey: string;
    issueId: Issue["id"];
    payload: EntityPropertiesObject;
  }): Promise<PartialEntity | undefined> {
    const client = createLinearClient(apiKey);

    const linearUpdate = entityPropertiesToIssueUpdate(payload);

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
