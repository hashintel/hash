import {
  Connection,
  Issue,
  LinearClient,
  LinearDocument,
  Team,
} from "@linear/sdk";
import {
  LinearWebhookPayload,
  LinearWebhookPayloadKind,
  PartialEntity,
} from "@local/hash-backend-utils/temporal-workflow-types";
import { GraphApi } from "@local/hash-graph-client";
import { linearPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  AccountId,
  BaseUrl,
  EntityId,
  EntityPropertiesObject,
  OwnedById,
} from "@local/hash-subgraph";

import {
  attachmentToEntity,
  commentToEntity,
  customViewToEntity,
  cycleToEntity,
  documentToEntity,
  entityPropertiesToIssueUpdate,
  issueLabelToEntity,
  mapLinearDataToEntity,
  mapLinearDataToEntityWithOutgoingLinks,
  projectMilestoneToEntity,
  projectToEntity,
} from "./mappings";
import {
  archiveEntity,
  getEntitiesByLinearId,
  getEntityOutgoingLinks,
} from "./util";

const createHashEntity = async (params: {
  authentication: { actorId: AccountId };
  graphApiClient: GraphApi;
  partialEntity: PartialEntity;
  outgoingLinks: {
    linkEntityTypeId: `${string}v/${number}`;
    destinationEntityId: EntityId;
  }[];
  ownedById: OwnedById;
}): Promise<void> => {
  const { graphApiClient, ownedById } = params;
  const { data: entity } = await graphApiClient.createEntity(
    params.authentication.actorId,
    {
      ownedById,
      owner: ownedById,
      ...params.partialEntity,
    },
  );

  await Promise.all(
    params.outgoingLinks.map(({ linkEntityTypeId, destinationEntityId }) =>
      graphApiClient.createEntity(params.authentication.actorId, {
        ownedById,
        owner: ownedById,
        linkData: {
          leftEntityId: entity.recordId.entityId,
          rightEntityId: destinationEntityId,
        },
        entityTypeId: linkEntityTypeId,
        properties: {},
      }),
    ),
  );
};

const createOrUpdateHashEntity = async (params: {
  authentication: { actorId: AccountId };
  graphApiClient: GraphApi;
  partialEntity: PartialEntity;
  outgoingLinks: {
    linkEntityTypeId: `${string}v/${number}`;
    destinationEntityId: EntityId;
  }[];
  ownedById: OwnedById;
}): Promise<void> => {
  const { partialEntity, graphApiClient } = params;

  const linearIdBaseUrl = linearPropertyTypes.id.propertyTypeBaseUrl as BaseUrl;

  const linearId = partialEntity.properties[linearIdBaseUrl];

  const updatedAtBaseUrl = linearPropertyTypes.updatedAt
    .propertyTypeBaseUrl as BaseUrl;

  const updatedAt = partialEntity.properties[updatedAtBaseUrl];

  if (!linearId) {
    throw new Error(`No linear id found.`);
  }

  const entities = await getEntitiesByLinearId({
    ...params,
    entityTypeId: partialEntity.entityTypeId,
    linearId: linearId as string,
    webOwnedById: params.ownedById,
  });

  for (const existingEntity of entities) {
    if (
      updatedAt &&
      existingEntity.properties[updatedAtBaseUrl] &&
      existingEntity.properties[updatedAtBaseUrl]! >= updatedAt
    ) {
      continue;
    }

    /** @todo: check which values have changed in a more sophisticated manor */
    const mergedProperties = {
      ...existingEntity.properties,
      // Ensure we don't accidentally set required properties to `undefined` by disabling
      // the ability to set properties to `undefined`
      ...Object.entries(partialEntity.properties).reduce(
        (acc, [propertyTypeUrl, value]) => ({
          ...acc,
          ...(typeof value === "undefined"
            ? {}
            : {
                [propertyTypeUrl]: value,
              }),
        }),
        {},
      ),
    };

    await graphApiClient.updateEntity(params.authentication.actorId, {
      archived: false,
      entityId: existingEntity.metadata.recordId.entityId,
      entityTypeId: existingEntity.metadata.entityTypeId,
      properties: mergedProperties,
    });

    const existingOutgoingLinks = await getEntityOutgoingLinks({
      ...params,
      entityId: existingEntity.metadata.recordId.entityId,
    });

    const removedOutgoingLinks = existingOutgoingLinks.filter(
      (linkEntity) =>
        !params.outgoingLinks.some(
          (newOutgoingLink) =>
            newOutgoingLink.linkEntityTypeId ===
              linkEntity.metadata.entityTypeId &&
            newOutgoingLink.destinationEntityId ===
              linkEntity.metadata.recordId.entityId,
        ),
    );

    const addedOutgoingLinks = params.outgoingLinks.filter(
      (newOutgoingLink) =>
        !existingOutgoingLinks.some(
          (linkEntity) =>
            newOutgoingLink.linkEntityTypeId ===
              linkEntity.metadata.entityTypeId &&
            newOutgoingLink.destinationEntityId ===
              linkEntity.metadata.recordId.entityId,
        ),
    );

    await Promise.all([
      ...removedOutgoingLinks.map((linkEntity) =>
        archiveEntity({ ...params, entity: linkEntity }),
      ),
      ...addedOutgoingLinks.map(({ linkEntityTypeId, destinationEntityId }) =>
        graphApiClient.createEntity(params.authentication.actorId, {
          entityTypeId: linkEntityTypeId,
          linkData: {
            leftEntityId: existingEntity.metadata.recordId.entityId,
            rightEntityId: destinationEntityId,
          },
          properties: {},
          ownedById: params.ownedById,
          owner: params.ownedById,
        }),
      ),
    ]);
  }

  if (entities.length === 0) {
    await createHashEntity(params);
  }
};

const createHashEntityFromLinearData =
  (graphApiClient: GraphApi) =>
  async <
    K extends LinearWebhookPayloadKind = LinearWebhookPayloadKind,
  >(params: {
    authentication: { actorId: AccountId };
    payload: LinearWebhookPayload[K];
    payloadKind: K;
    ownedById: OwnedById;
  }): Promise<void> => {
    const { partialEntity, outgoingLinks } =
      await mapLinearDataToEntityWithOutgoingLinks({
        ...params,
        graphApiClient,
        linearType: params.payloadKind,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        linearData: params.payload as unknown as any,
      });

    await createHashEntity({
      graphApiClient,
      authentication: params.authentication,
      ownedById: params.ownedById,
      partialEntity,
      outgoingLinks,
    });
  };

const updateHashEntityFromLinearData =
  (graphApiClient: GraphApi) =>
  async <
    K extends LinearWebhookPayloadKind = LinearWebhookPayloadKind,
  >(params: {
    authentication: { actorId: AccountId };
    payload: LinearWebhookPayload[K];
    payloadKind: K;
    ownedById: OwnedById;
  }): Promise<void> => {
    const { partialEntity, outgoingLinks } =
      await mapLinearDataToEntityWithOutgoingLinks({
        ...params,
        graphApiClient,
        linearType: params.payloadKind,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        linearData: params.payload as unknown as any,
      });

    await createOrUpdateHashEntity({
      graphApiClient,
      authentication: params.authentication,
      partialEntity,
      outgoingLinks,
      ownedById: params.ownedById,
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
    authentication: { actorId: AccountId };
    entities: PartialEntity[];
    workspaceOwnedById: OwnedById;
  }): Promise<void> {
    await Promise.all(
      params.entities.map((partialEntity) =>
        createOrUpdateHashEntity({
          graphApiClient,
          authentication: params.authentication,
          ownedById: params.workspaceOwnedById,
          partialEntity,
          outgoingLinks: [],
        }),
      ),
    );
  },

  async readLinearOrganization({
    apiKey,
  }: ParamsWithApiKey<{}>): Promise<PartialEntity> {
    return createLinearClient(apiKey).organization.then((organization) =>
      mapLinearDataToEntity({
        linearType: "Organization",
        linearData: organization,
      }),
    );
  },

  async readLinearUsers({
    apiKey,
  }: ParamsWithApiKey): Promise<PartialEntity[]> {
    return createLinearClient(apiKey)
      .users()
      .then(readNodes)
      .then((users) =>
        users.map((user) =>
          mapLinearDataToEntity({
            linearType: "User",
            linearData: user,
          }),
        ),
      );
  },

  createHashEntityFromLinearData:
    createHashEntityFromLinearData(graphApiClient),

  updateHashEntityFromLinearData:
    updateHashEntityFromLinearData(graphApiClient),

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
      .then((issues) =>
        issues.map((issue) =>
          mapLinearDataToEntity({
            linearType: "Issue",
            linearData: issue,
          }),
        ),
      );
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
          return mapLinearDataToEntity({
            linearType: "Issue",
            linearData: issue,
          });
        }
        return undefined;
      });

    return updatedIssue;
  },
});
