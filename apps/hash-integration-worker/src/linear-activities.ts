import type {
  ActorEntityUuid,
  EntityId,
  OriginProvenance,
  PropertyObject,
  ProvidedEntityEditionProvenance,
  WebId,
} from "@blockprotocol/type-system";
import type { Connection, LinearDocument, Team } from "@linear/sdk";
import { LinearClient } from "@linear/sdk";
import { getLinearMappingByHashEntityTypeId } from "@local/hash-backend-utils/linear-type-mappings";
import type {
  CreateHashEntityFromLinearData,
  PartialEntity,
  UpdateHashEntityFromLinearData,
  UpdateLinearDataWorkflow,
} from "@local/hash-backend-utils/temporal-integration-workflow-types";
import type { GraphApi } from "@local/hash-graph-client";
import {
  HashEntity,
  HashLinkEntity,
  mergePropertyObjectAndMetadata,
  propertyObjectToPatches,
} from "@local/hash-graph-sdk/entity";
import { linearPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  mapHashEntityToLinearUpdateInput,
  mapLinearDataToEntity,
  mapLinearDataToEntityWithOutgoingLinks,
} from "./linear-activities/mappings";
import {
  getEntitiesByLinearId,
  getEntityOutgoingLinks,
} from "./shared/graph-requests";

const provenance: ProvidedEntityEditionProvenance = {
  actorType: "machine",
  origin: {
    type: "flow",
    /**
     * @todo use correct EntityId for Flow when Linear integration migrated to Flows
     */
    id: "linear-integration",
  } satisfies OriginProvenance,
};

const createHashEntity = async (params: {
  authentication: { actorId: ActorEntityUuid };
  graphApiClient: GraphApi;
  partialEntity: PartialEntity;
  outgoingLinks: {
    linkEntityTypeId: `${string}v/${number}`;
    destinationEntityId: EntityId;
  }[];
  webId: WebId;
}): Promise<void> => {
  const { graphApiClient, webId } = params;

  const entity = await HashEntity.create(
    graphApiClient,
    params.authentication,
    {
      webId,
      draft: false,
      relationships: [
        {
          relation: "administrator",
          subject: {
            kind: "account",
            subjectId: params.authentication.actorId,
          },
        },
        {
          relation: "setting",
          subject: { kind: "setting", subjectId: "administratorFromWeb" },
        },
        {
          relation: "setting",
          subject: { kind: "setting", subjectId: "updateFromWeb" },
        },
        {
          relation: "setting",
          subject: { kind: "setting", subjectId: "viewFromWeb" },
        },
      ],
      properties: mergePropertyObjectAndMetadata(
        (params.partialEntity.properties as
          | HashEntity["properties"]
          | undefined) ?? {},
        undefined,
      ),
      provenance,
      entityTypeIds: [params.partialEntity.entityTypeId],
    },
  );

  await HashEntity.createMultiple(
    graphApiClient,
    { actorId: params.authentication.actorId },
    params.outgoingLinks.map(({ linkEntityTypeId, destinationEntityId }) => ({
      webId,
      linkData: {
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: destinationEntityId,
      },
      entityTypeIds: [linkEntityTypeId],
      properties: { value: {} },
      provenance,
      draft: false,
      relationships: [
        {
          relation: "administrator",
          subject: {
            kind: "account",
            subjectId: params.authentication.actorId,
          },
        },
        {
          relation: "setting",
          subject: { kind: "setting", subjectId: "administratorFromWeb" },
        },
        {
          relation: "setting",
          subject: { kind: "setting", subjectId: "updateFromWeb" },
        },
        {
          relation: "setting",
          subject: { kind: "setting", subjectId: "viewFromWeb" },
        },
      ],
    })),
  );
};

const createOrUpdateHashEntity = async (params: {
  authentication: { actorId: ActorEntityUuid };
  graphApiClient: GraphApi;
  partialEntity: PartialEntity;
  outgoingLinks: {
    linkEntityTypeId: `${string}v/${number}`;
    destinationEntityId: EntityId;
  }[];
  webId: WebId;
}): Promise<void> => {
  const { partialEntity, graphApiClient } = params;

  const linearIdBaseUrl = linearPropertyTypes.id.propertyTypeBaseUrl;

  const linearId = partialEntity.properties[linearIdBaseUrl];

  const updatedAtBaseUrl = linearPropertyTypes.updatedAt.propertyTypeBaseUrl;

  const updatedAt = partialEntity.properties[updatedAtBaseUrl];

  if (!linearId) {
    throw new Error(`No linear id found.`);
  }

  const entities = await getEntitiesByLinearId({
    ...params,
    entityTypeId: partialEntity.entityTypeId,
    linearId: linearId as string,
    webWebId: params.webId,
  });

  for (const existingEntity of entities) {
    const actualOutgoingLinks = params.outgoingLinks;

    const existingOutgoingLinks = await getEntityOutgoingLinks({
      ...params,
      entityId: existingEntity.metadata.recordId.entityId,
    });

    const removedOutgoingLinks = existingOutgoingLinks.filter(
      (linkEntity) =>
        !actualOutgoingLinks.some(
          ({ linkEntityTypeId, destinationEntityId }) =>
            linkEntity.metadata.entityTypeIds.includes(linkEntityTypeId) &&
            destinationEntityId === linkEntity.linkData.rightEntityId,
        ),
    );

    const addedOutgoingLinks = actualOutgoingLinks.filter(
      (newOutgoingLink) =>
        !existingOutgoingLinks.some(
          (linkEntity) =>
            linkEntity.metadata.entityTypeIds.includes(
              newOutgoingLink.linkEntityTypeId,
            ) &&
            newOutgoingLink.destinationEntityId ===
              linkEntity.linkData.rightEntityId,
        ),
    );

    await Promise.all([
      ...removedOutgoingLinks.map((linkEntity) =>
        linkEntity.archive(params.graphApiClient, params.authentication, {
          actorType: "machine",
          origin: {
            type: "flow",
            id: "linear-integration",
          },
        }),
      ),
      ...addedOutgoingLinks.map(({ linkEntityTypeId, destinationEntityId }) =>
        HashLinkEntity.create(graphApiClient, params.authentication, {
          entityTypeIds: [linkEntityTypeId],
          linkData: {
            leftEntityId: existingEntity.metadata.recordId.entityId,
            rightEntityId: destinationEntityId,
          },
          properties: { value: {} },
          provenance,
          webId: params.webId,
          draft: false,
          relationships: [
            {
              relation: "setting",
              subject: { kind: "setting", subjectId: "administratorFromWeb" },
            },
            {
              relation: "setting",
              subject: { kind: "setting", subjectId: "updateFromWeb" },
            },
            {
              relation: "setting",
              subject: { kind: "setting", subjectId: "viewFromWeb" },
            },
          ],
        }),
      ),
    ]);

    if (
      updatedAt &&
      existingEntity.properties[updatedAtBaseUrl] &&
      existingEntity.properties[updatedAtBaseUrl] >= updatedAt
    ) {
      continue;
    }

    /** @todo: check which values have changed in a more sophisticated manor */
    const updatedProperties: PropertyObject = {
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

    await existingEntity.patch(graphApiClient, params.authentication, {
      propertyPatches: propertyObjectToPatches(
        mergePropertyObjectAndMetadata(updatedProperties, undefined),
      ),
      provenance,
    });
  }

  if (entities.length === 0) {
    await createHashEntity(params);
  }
};

const createLinearClient = (apiKey: string) => new LinearClient({ apiKey });

const mapLinearTypeToLinearClientGetMethod = {
  Issue: "issue",
  User: "user",
  Organization: "organization",
} as const;

const createHashEntityFromLinearData =
  (graphApiClient: GraphApi) =>
  async (
    params: Parameters<CreateHashEntityFromLinearData>[0],
  ): Promise<void> => {
    const client = createLinearClient(params.linearApiKey);

    const { linearType, linearId } = params;

    const methodName = mapLinearTypeToLinearClientGetMethod[linearType];

    const linearData = await client[methodName](linearId);

    const { partialEntity, outgoingLinks } =
      await mapLinearDataToEntityWithOutgoingLinks({
        ...params,
        graphApiClient,
        linearType,
        linearData,
      });

    await createHashEntity({
      graphApiClient,
      authentication: params.authentication,
      webId: params.webId,
      partialEntity,
      outgoingLinks,
    });
  };

const updateHashEntityFromLinearData =
  (graphApiClient: GraphApi) =>
  async (
    params: Parameters<UpdateHashEntityFromLinearData>[0],
  ): Promise<void> => {
    const client = createLinearClient(params.linearApiKey);

    const { linearType, linearId } = params;

    const methodName = mapLinearTypeToLinearClientGetMethod[linearType];

    const linearData = await client[methodName](linearId);

    const { partialEntity, outgoingLinks } =
      await mapLinearDataToEntityWithOutgoingLinks({
        ...params,
        graphApiClient,
        linearType: params.linearType,
        linearData,
      });

    await createOrUpdateHashEntity({
      graphApiClient,
      authentication: params.authentication,
      partialEntity,
      outgoingLinks,
      webId: params.webId,
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

type ParamsWithApiKey<T = Record<string, unknown>> = T & { apiKey: string };

export const createLinearIntegrationActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async createPartialEntities(params: {
    authentication: { actorId: ActorEntityUuid };
    entities: PartialEntity[];
    workspaceWebId: WebId;
  }): Promise<void> {
    await Promise.all(
      params.entities.map((partialEntity) =>
        createOrUpdateHashEntity({
          graphApiClient,
          authentication: params.authentication,
          webId: params.workspaceWebId,
          partialEntity,
          outgoingLinks: [],
        }),
      ),
    );
  },

  async readLinearOrganization({
    apiKey,
  }: ParamsWithApiKey): Promise<PartialEntity> {
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

  async updateLinearData({
    apiKey,
    entityTypeIds,
    authentication,
    linearId,
    entity,
  }: Parameters<UpdateLinearDataWorkflow>[0]): Promise<void> {
    const client = createLinearClient(apiKey);

    const mapping = getLinearMappingByHashEntityTypeId({ entityTypeIds });

    const linearUpdateInput = await mapHashEntityToLinearUpdateInput({
      graphApiClient,
      authentication,
      linearType: mapping.linearType,
      entity: new HashEntity(entity),
    });

    if (Object.entries(linearUpdateInput).length > 0) {
      await client[`update${mapping.linearType}`](linearId, linearUpdateInput);
    }
  },
});
