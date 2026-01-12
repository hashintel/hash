import type {
  EntityId,
  EntityUuid,
  MachineId,
  OriginProvenance,
  ProvidedEntityEditionProvenance,
  VersionedUrl,
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
  patchesFromPropertyObjects,
} from "@local/hash-graph-sdk/entity";
import { linearPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { v4 as uuidv4 } from "uuid";

import { logger } from "../main.js";
import {
  getEntitiesByLinearId,
  getEntityOutgoingLinks,
} from "../shared/graph-requests.js";
import {
  mapHashEntityToLinearUpdateInput,
  mapLinearDataToEntity,
  mapLinearDataToEntityWithOutgoingLinks,
} from "./linear-activities/mappings.js";

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
  authentication: { actorId: MachineId };
  graphApiClient: GraphApi;
  partialEntity: PartialEntity;
  outgoingLinks: {
    linkEntityTypeId: VersionedUrl;
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

  if (params.outgoingLinks.length > 0) {
    await HashEntity.createMultiple(
      graphApiClient,
      { actorId: params.authentication.actorId },
      params.outgoingLinks.map(({ linkEntityTypeId, destinationEntityId }) => {
        return {
          webId,
          linkData: {
            leftEntityId: entity.metadata.recordId.entityId,
            rightEntityId: destinationEntityId,
          },
          entityTypeIds: [linkEntityTypeId],
          properties: { value: {} },
          provenance,
          draft: false,
        };
      }),
    );
  }
};

const createOrUpdateHashEntity = async (params: {
  authentication: { actorId: MachineId };
  graphApiClient: GraphApi;
  partialEntity: PartialEntity;
  outgoingLinks: {
    linkEntityTypeId: VersionedUrl;
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
      ...addedOutgoingLinks.map(
        async ({ linkEntityTypeId, destinationEntityId }) => {
          const linkEntityUuid = uuidv4() as EntityUuid;
          await HashLinkEntity.create(graphApiClient, params.authentication, {
            entityTypeIds: [linkEntityTypeId],
            linkData: {
              leftEntityId: existingEntity.metadata.recordId.entityId,
              rightEntityId: destinationEntityId,
            },
            properties: { value: {} },
            provenance,
            webId: params.webId,
            entityUuid: linkEntityUuid,
            draft: false,
          });
        },
      ),
    ]);

    if (
      updatedAt &&
      existingEntity.properties[updatedAtBaseUrl] &&
      existingEntity.properties[updatedAtBaseUrl] >= updatedAt
    ) {
      continue;
    }

    const propertyPatches = patchesFromPropertyObjects({
      oldProperties: existingEntity.properties,
      newProperties: mergePropertyObjectAndMetadata(
        partialEntity.properties,
        undefined,
      ),
    });

    await existingEntity.patch(graphApiClient, params.authentication, {
      propertyPatches,
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

    const { partialEntity, outgoingLinks: _outgoingLinks } =
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
      /** @todo H-4479 fix creating destination and link entities in Linear integration */
      outgoingLinks: [],
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

    const { partialEntity, outgoingLinks: _outgoingLinks } =
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
      /** @todo H-4479 fix creating destination and link entities in Linear integration */
      outgoingLinks: [],
      webId: params.webId,
    });
  };

const readNodes = async <T>(connection: Connection<T>): Promise<T[]> => {
  while (connection.pageInfo.hasNextPage) {
    // eslint-disable-next-line no-param-reassign
    connection = await connection.fetchNext();
  }

  return connection.nodes;
};

type ParamsWithApiKey<T = Record<string, unknown>> = T & { apiKey: string };

const readLinearIssues = async ({
  apiKey,
  filter,
}: ParamsWithApiKey<{ filter?: { teamId?: string } }>): Promise<
  PartialEntity[]
> => {
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
};

const createPartialEntities = async (params: {
  authentication: { actorId: MachineId };
  entities: PartialEntity[];
  graphApiClient: GraphApi;
  webId: WebId;
}): Promise<void> => {
  await Promise.all(
    params.entities.map((partialEntity) =>
      createOrUpdateHashEntity({
        graphApiClient: params.graphApiClient,
        authentication: params.authentication,
        webId: params.webId,
        partialEntity,
        outgoingLinks: [],
      }),
    ),
  );
};

export const createLinearIntegrationActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async createPartialEntities(params: {
    authentication: { actorId: MachineId };
    entities: PartialEntity[];
    webId: WebId;
  }): Promise<void> {
    await createPartialEntities({
      ...params,
      graphApiClient,
    });
  },

  async readLinearOrganization({
    apiKey,
  }: ParamsWithApiKey): Promise<PartialEntity> {
    return await createLinearClient(apiKey).organization.then((organization) =>
      mapLinearDataToEntity({
        linearType: "Organization",
        linearData: organization,
      }),
    );
  },

  async readLinearUsers({
    apiKey,
  }: ParamsWithApiKey): Promise<PartialEntity[]> {
    return await createLinearClient(apiKey)
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
    return await readLinearIssues({ apiKey, filter });
  },

  async readAndCreateLinearIssues({
    apiKey,
    authentication,
    filter,
    webId,
  }: ParamsWithApiKey<{
    authentication: { actorId: MachineId };
    filter?: { teamId?: string };
    webId: WebId;
  }>): Promise<void> {
    const issues = await readLinearIssues({ apiKey, filter });

    logger.info(`Found ${issues.length} issues to sync to ${webId}`);

    const batchSize = 100;

    for (let i = 0; i < issues.length; i += batchSize) {
      const batch = issues.slice(i, i + batchSize);

      await createPartialEntities({
        authentication,
        entities: batch,
        graphApiClient,
        webId,
      });
    }

    logger.info(`Synced ${issues.length} issues to ${webId}`);
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
