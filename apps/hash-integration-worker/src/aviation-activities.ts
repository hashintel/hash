import type {
  ActorEntityUuid,
  EntityId,
  OriginProvenance,
  ProvidedEntityEditionProvenance,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import {
  getScheduledArrivalEntities,
  type ProposedEntity,
  type ProposedLink,
} from "@local/hash-backend-utils/integrations/aviation/aero-api/client";
import type { GetScheduledFlightsResult } from "@local/hash-backend-utils/temporal-integration-workflow-types";
import type { GraphApi } from "@local/hash-graph-client";
import {
  HashEntity,
  HashLinkEntity,
  queryEntities,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";

const getProvenance = (): ProvidedEntityEditionProvenance => ({
  actorType: "machine",
  origin: {
    type: "flow",
    id: "aviation-integration",
  } satisfies OriginProvenance,
});

/**
 * Fetches scheduled flights from AeroAPI for a given airport and date.
 */
const getScheduledFlights = async (params: {
  airportIcao: string;
  date: string;
}): Promise<GetScheduledFlightsResult> => {
  const result = await getScheduledArrivalEntities(
    params.airportIcao,
    params.date,
  );

  return {
    entities: [...result.entities.values()],
    links: result.links,
    provenance: result.provenance,
  };
};

/**
 * Finds an existing entity matching the primary key properties.
 */
const findExistingEntity = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: ActorEntityUuid };
  entityTypeId: VersionedUrl;
  primaryKeyProperties: Record<string, string>;
  webId: WebId;
}): Promise<HashEntity | null> => {
  const propertyFilters = Object.entries(params.primaryKeyProperties).map(
    ([propertyBaseUrl, value]) => ({
      equal: [{ path: ["properties", propertyBaseUrl] }, { parameter: value }],
    }),
  );

  const { entities } = await queryEntities(
    { graphApi: params.graphApiClient },
    params.authentication,
    {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(params.entityTypeId, {
            ignoreParents: true,
          }),
          { equal: [{ path: ["webId"] }, { parameter: params.webId }] },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
          ...propertyFilters,
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  const [entity] = entities;
  return entity ?? null;
};

/**
 * Finds an existing link entity between two entities.
 */
const findExistingLink = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: ActorEntityUuid };
  linkEntityTypeId: VersionedUrl;
  leftEntityId: string;
  rightEntityId: string;
}): Promise<HashLinkEntity | null> => {
  const { entities } = await queryEntities(
    { graphApi: params.graphApiClient },
    params.authentication,
    {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(params.linkEntityTypeId, {
            ignoreParents: true,
          }),
          {
            equal: [
              { path: ["leftEntity", "uuid"] },
              { parameter: params.leftEntityId.split("~")[1] },
            ],
          },
          {
            equal: [
              { path: ["rightEntity", "uuid"] },
              { parameter: params.rightEntityId.split("~")[1] },
            ],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  const [entity] = entities;
  return entity ? new HashLinkEntity(entity) : null;
};

/**
 * Persists proposed entities to the graph, creating or updating as needed.
 */
const persistEntities = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: ActorEntityUuid };
  webId: WebId;
  entities: ProposedEntity[];
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">;
}): Promise<{
  created: number;
  updated: number;
  entityIdsByPrimaryKey: Map<string, EntityId>;
}> => {
  const { graphApiClient, authentication, webId, entities, provenance } =
    params;
  let created = 0;
  const updated = 0;
  const entityIdsByPrimaryKey = new Map<string, EntityId>();

  for (const proposedEntity of entities) {
    const [entityTypeId] = proposedEntity.entityTypeIds;

    const existingEntity = await findExistingEntity({
      graphApiClient,
      authentication,
      entityTypeId,
      primaryKeyProperties: proposedEntity.primaryKey.properties,
      webId,
    });

    if (existingEntity) {
      // For now, we just track the existing entity - updates could be added later
      // by comparing properties and patching if different
      entityIdsByPrimaryKey.set(
        proposedEntity.primaryKey.key,
        existingEntity.metadata.recordId.entityId,
      );
    } else {
      // Create new entity
      const newEntity = await HashEntity.create(
        graphApiClient,
        authentication,
        {
          webId,
          draft: false,
          properties: proposedEntity.properties,
          provenance: {
            ...getProvenance(),
            sources: provenance.sources,
          },
          entityTypeIds: proposedEntity.entityTypeIds,
        },
      );

      created++;
      entityIdsByPrimaryKey.set(
        proposedEntity.primaryKey.key,
        newEntity.metadata.recordId.entityId,
      );
    }
  }

  return { created, updated, entityIdsByPrimaryKey };
};

/**
 * Persists proposed links to the graph, creating new links where they don't exist.
 */
const persistLinks = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: ActorEntityUuid };
  webId: WebId;
  links: ProposedLink[];
  entityIdsByPrimaryKey: Map<string, EntityId>;
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">;
}): Promise<{ created: number }> => {
  const {
    graphApiClient,
    authentication,
    webId,
    links,
    entityIdsByPrimaryKey,
    provenance,
  } = params;
  let created = 0;

  for (const proposedLink of links) {
    const leftEntityId = entityIdsByPrimaryKey.get(
      proposedLink.leftEntityPrimaryKey.key,
    );
    const rightEntityId = entityIdsByPrimaryKey.get(
      proposedLink.rightEntityPrimaryKey.key,
    );

    if (!leftEntityId || !rightEntityId) {
      // Skip links where we don't have both entities
      continue;
    }

    const [linkEntityTypeId] = proposedLink.entityTypeIds;

    const existingLink = await findExistingLink({
      graphApiClient,
      authentication,
      linkEntityTypeId,
      leftEntityId,
      rightEntityId,
    });

    if (!existingLink) {
      await HashLinkEntity.create(graphApiClient, authentication, {
        webId,
        draft: false,
        linkData: {
          leftEntityId,
          rightEntityId,
        },
        properties: proposedLink.properties,
        provenance: {
          ...getProvenance(),
          sources: provenance.sources,
        },
        entityTypeIds: proposedLink.entityTypeIds,
      });

      created++;
    }
    // Note: We don't update existing links for now, just skip them
  }

  return { created };
};

export const createAviationActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  /**
   * Fetches scheduled flights from AeroAPI.
   */
  async getScheduledFlights(params: {
    airportIcao: string;
    date: string;
  }): Promise<GetScheduledFlightsResult> {
    return getScheduledFlights(params);
  },

  /**
   * Persists proposed entities and links to the graph.
   */
  async persistFlightEntities(params: {
    authentication: { actorId: ActorEntityUuid };
    webId: WebId;
    entities: ProposedEntity[];
    links: ProposedLink[];
    provenance: Pick<ProvidedEntityEditionProvenance, "sources">;
  }): Promise<{
    entitiesCreated: number;
    entitiesUpdated: number;
    linksCreated: number;
  }> {
    const { authentication, webId, entities, links, provenance } = params;

    const {
      created: entitiesCreated,
      updated: entitiesUpdated,
      entityIdsByPrimaryKey,
    } = await persistEntities({
      graphApiClient,
      authentication,
      webId,
      entities,
      provenance,
    });

    const { created: linksCreated } = await persistLinks({
      graphApiClient,
      authentication,
      webId,
      links,
      entityIdsByPrimaryKey,
      provenance,
    });

    return { entitiesCreated, entitiesUpdated, linksCreated };
  },
});
