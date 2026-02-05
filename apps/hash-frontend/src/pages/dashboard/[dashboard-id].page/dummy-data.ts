import type { Entity, LinkEntity } from "@blockprotocol/type-system";
import type {
  Aircraft,
  Airline,
  Airport,
  ArrivesAt,
  DepartsFrom,
  Flight,
} from "@local/hash-isomorphic-utils/system-types/flight";

export type FlightWithLinksResolved = {
  flight: Entity<Flight>;
  arrivalAirport: Entity<Airport>;
  arrivalStatus: LinkEntity<ArrivesAt>;
  departureAirport: Entity<Airport>;
  departureStatus: LinkEntity<DepartsFrom>;
  operatedBy: Entity<Airline>;
  usesAircraft: Entity<Aircraft> | null;
};

// Entity type IDs
const FLIGHT_TYPE = "https://hash.ai/@h/types/entity-type/flight/v/1";
const ARRIVES_AT_TYPE = "https://hash.ai/@h/types/entity-type/arrives-at/v/1";
const DEPARTS_FROM_TYPE =
  "https://hash.ai/@h/types/entity-type/departs-from/v/1";
const OPERATED_BY_TYPE = "https://hash.ai/@h/types/entity-type/operated-by/v/1";
const USES_AIRCRAFT_TYPE =
  "https://hash.ai/@h/types/entity-type/uses-aircraft/v/1";

type VertexEntry = Record<string, { kind: string; inner: unknown } | undefined>;

/**
 * Extract the latest version of an entity from a vertex entry
 */
const getLatestEntity = (
  vertex: VertexEntry,
): { kind: "entity"; inner: unknown } | null => {
  const timestamps = Object.keys(vertex).sort().reverse();
  const latestTimestamp = timestamps[0];
  if (!latestTimestamp) {
    return null;
  }
  return vertex[latestTimestamp] as {
    kind: "entity";
    inner: unknown;
  };
};

/**
 * Get the entity type IDs from an entity's inner structure
 */
const getEntityTypeIds = (inner: unknown): string[] => {
  const metadata = (inner as { metadata?: { entityTypeIds?: string[] } })
    .metadata;
  return metadata?.entityTypeIds ?? [];
};

/**
 * Get the link data from an entity's inner structure
 */
const getLinkData = (
  inner: unknown,
): { leftEntityId: string; rightEntityId: string } | null => {
  const linkData = (
    inner as { linkData?: { leftEntityId: string; rightEntityId: string } }
  ).linkData;
  return linkData ?? null;
};

/**
 * Build an Entity object from the inner structure
 */
const buildEntity = (inner: unknown): Entity => {
  const typedInner = inner as {
    properties: Record<string, unknown>;
    metadata: {
      recordId: { entityId: string; editionId: string };
      entityTypeIds: string[];
      temporalVersioning: unknown;
      provenance: unknown;
      archived: boolean;
      properties: unknown;
    };
  };

  return {
    properties: typedInner.properties,
    metadata: typedInner.metadata,
  } as Entity;
};

/**
 * Build a LinkEntity object from the inner structure
 */
const buildLinkEntity = (inner: unknown): LinkEntity => {
  const typedInner = inner as {
    properties: Record<string, unknown>;
    linkData: { leftEntityId: string; rightEntityId: string };
    metadata: {
      recordId: { entityId: string; editionId: string };
      entityTypeIds: string[];
      temporalVersioning: unknown;
      provenance: unknown;
      archived: boolean;
      properties: unknown;
    };
  };

  return {
    properties: typedInner.properties,
    linkData: typedInner.linkData,
    metadata: typedInner.metadata,
  } as LinkEntity;
};

/**
 * Process a vertices object into FlightWithLinksResolved array.
 * This function can be used with API-delivered vertices or the hardcoded data.
 */
export const processVerticesIntoFlights = (
  verticesData: Record<string, VertexEntry>,
): FlightWithLinksResolved[] => {
  // Build lookup maps
  const entitiesByType = new Map<
    string,
    { entityId: string; inner: unknown }[]
  >();
  const entitiesById = new Map<string, unknown>();
  const linksByLeftEntityAndType = new Map<
    string,
    { entityId: string; inner: unknown }[]
  >();

  // Process all vertices
  for (const [entityId, vertex] of Object.entries(verticesData)) {
    const entityData = getLatestEntity(vertex);
    if (!entityData) {
      continue;
    }

    const inner = entityData.inner;
    const typeIds = getEntityTypeIds(inner);

    // Store in entities by ID map
    entitiesById.set(entityId, inner);

    // Store in entities by type map
    for (const typeId of typeIds) {
      const existing = entitiesByType.get(typeId) ?? [];
      existing.push({ entityId, inner });
      entitiesByType.set(typeId, existing);
    }

    // If it's a link entity, store by left entity ID and type
    const linkData = getLinkData(inner);
    if (linkData) {
      for (const typeId of typeIds) {
        const key = `${linkData.leftEntityId}:${typeId}`;
        const existing = linksByLeftEntityAndType.get(key) ?? [];
        existing.push({ entityId, inner });
        linksByLeftEntityAndType.set(key, existing);
      }
    }
  }

  /**
   * Find a link entity by left entity ID and link type
   */
  const findLinkByLeftEntityAndType = (
    leftEntityId: string,
    linkType: string,
  ): { entityId: string; inner: unknown } | undefined => {
    const key = `${leftEntityId}:${linkType}`;
    const links = linksByLeftEntityAndType.get(key);
    return links?.[0];
  };

  /**
   * Get an entity by its ID
   */
  const getEntityById = (entityId: string): unknown => {
    return entitiesById.get(entityId);
  };

  // Build the FlightWithLinksResolved array
  const flights = entitiesByType.get(FLIGHT_TYPE) ?? [];

  return flights
    .map(({ entityId: flightEntityId, inner: flightInner }) => {
      // Find arrives-at link and arrival airport
      const arrivesAtLink = findLinkByLeftEntityAndType(
        flightEntityId,
        ARRIVES_AT_TYPE,
      );
      if (!arrivesAtLink) {
        return null;
      }
      const arrivesAtLinkData = getLinkData(arrivesAtLink.inner);
      if (!arrivesAtLinkData) {
        return null;
      }
      const arrivalAirportInner = getEntityById(
        arrivesAtLinkData.rightEntityId,
      );
      if (!arrivalAirportInner) {
        return null;
      }

      // Find departs-from link and departure airport
      const departsFromLink = findLinkByLeftEntityAndType(
        flightEntityId,
        DEPARTS_FROM_TYPE,
      );
      if (!departsFromLink) {
        return null;
      }
      const departsFromLinkData = getLinkData(departsFromLink.inner);
      if (!departsFromLinkData) {
        return null;
      }
      const departureAirportInner = getEntityById(
        departsFromLinkData.rightEntityId,
      );
      if (!departureAirportInner) {
        return null;
      }

      // Find operated-by link and airline
      const operatedByLink = findLinkByLeftEntityAndType(
        flightEntityId,
        OPERATED_BY_TYPE,
      );
      if (!operatedByLink) {
        return null;
      }
      const operatedByLinkData = getLinkData(operatedByLink.inner);
      if (!operatedByLinkData) {
        return null;
      }
      const airlineInner = getEntityById(operatedByLinkData.rightEntityId);
      if (!airlineInner) {
        return null;
      }

      // Find uses-aircraft link and aircraft (optional)
      const usesAircraftLink = findLinkByLeftEntityAndType(
        flightEntityId,
        USES_AIRCRAFT_TYPE,
      );
      let aircraftEntity: Entity<Aircraft> | null = null;
      if (usesAircraftLink) {
        const usesAircraftLinkData = getLinkData(usesAircraftLink.inner);
        if (usesAircraftLinkData) {
          const aircraftInner = getEntityById(
            usesAircraftLinkData.rightEntityId,
          );
          if (aircraftInner) {
            aircraftEntity = buildEntity(aircraftInner) as Entity<Aircraft>;
          }
        }
      }

      return {
        flight: buildEntity(flightInner) as Entity<Flight>,
        arrivalAirport: buildEntity(arrivalAirportInner) as Entity<Airport>,
        arrivalStatus: buildLinkEntity(
          arrivesAtLink.inner,
        ) as LinkEntity<ArrivesAt>,
        departureAirport: buildEntity(departureAirportInner) as Entity<Airport>,
        departureStatus: buildLinkEntity(
          departsFromLink.inner,
        ) as LinkEntity<DepartsFrom>,
        operatedBy: buildEntity(airlineInner) as Entity<Airline>,
        usesAircraft: aircraftEntity,
      };
    })
    .filter((item): item is FlightWithLinksResolved => item !== null);
};
