import type {
  ProvidedEntityEditionProvenance,
  TypeIdsAndPropertiesForEntity,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { CreateEntityParameters } from "@local/hash-graph-sdk/entity";
import type {
  ArrivesAt as HashArrivesAt,
  DepartsFrom as HashDepartsFrom,
  Flight as HashFlight,
  OperatedBy as HashOperatedBy,
} from "@local/hash-isomorphic-utils/system-types/flight";
import type {
  Airline as HashAirline,
  Airport as HashAirport,
} from "@local/hash-isomorphic-utils/system-types/shared";

import { mapAirline } from "./build-graph/airline.js";
import { mapAirport } from "./build-graph/airport.js";
import { mapArrivesAt } from "./build-graph/arrives-at.js";
import { mapDepartsFrom } from "./build-graph/departs-from.js";
import { mapFlight } from "./build-graph/flight.js";
import type { AeroApiScheduledFlight } from "./types.js";

/**
 * A proposed entity or link to be created or matched against existing entities.
 *
 * If `sourceEntityLocalId` and `targetEntityLocalId` are present, this is a link entity.
 * Otherwise, it's a regular entity.
 */
export type AviationProposedEntity<
  T extends TypeIdsAndPropertiesForEntity = TypeIdsAndPropertiesForEntity,
> = {
  /**
   * The primary key string for in-memory deduplication.
   */
  localEntityId: string;
  /**
   * The entity type IDs for this entity.
   */
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  /**
   * The properties for this entity.
   */
  properties: CreateEntityParameters<T>["properties"];
} & (
  | {
      /**
       * For link entities, this must be defined.
       */
      sourceEntityLocalId: string;
      targetEntityLocalId: string;
    }
  | {
      sourceEntityLocalId?: never;
      targetEntityLocalId?: never;
    }
);

/**
 * Type guard to check if a ProposedEntity is a link entity.
 */
export const isLinkEntity = (
  entity: AviationProposedEntity,
): entity is AviationProposedEntity & {
  sourceEntityLocalId: string;
  targetEntityLocalId: string;
} => {
  return entity.sourceEntityLocalId !== undefined;
};

/**
 * The result of building a flight graph, with typed entities.
 */
export type FlightGraphResult = {
  entities: {
    flight: AviationProposedEntity<HashFlight>;
    originAirport?: AviationProposedEntity<HashAirport>;
    destinationAirport?: AviationProposedEntity<HashAirport>;
    airline?: AviationProposedEntity<HashAirline>;
    departsFrom?: AviationProposedEntity<HashDepartsFrom>;
    arrivesAt?: AviationProposedEntity<HashArrivesAt>;
    operatedBy?: AviationProposedEntity<HashOperatedBy>;
  };
};

/**
 * Builds a graph of proposed entities from a single AeroAPI flight.
 * Returns `null` if the flight cannot be mapped (missing required data).
 *
 * This extracts:
 * - The Flight entity
 * - Origin Airport entity (if origin data exists and has ICAO code)
 * - Destination Airport entity (if destination data exists and has ICAO code)
 * - Airline entity (if operator ICAO code exists)
 * - DepartsFrom link (Flight → Origin Airport)
 * - ArrivesAt link (Flight → Destination Airport)
 * - OperatedBy link (Flight → Airline)
 */
export const buildSingleFlightGraph = (
  flight: AeroApiScheduledFlight,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
): FlightGraphResult | null => {
  const flightMapping = mapFlight(flight, provenance);

  if (!flightMapping) {
    return null;
  }

  const flightEntity: AviationProposedEntity<HashFlight> = {
    localEntityId: flightMapping.primaryKey,
    entityTypeIds: flightMapping.typeIdsAndProperties.entityTypeIds,
    properties: flightMapping.typeIdsAndProperties.properties,
  };

  const result: FlightGraphResult = {
    entities: {
      flight: flightEntity,
    },
  };

  if (flight.origin) {
    const airportMapping = mapAirport(flight.origin, provenance);
    if (airportMapping) {
      const originAirport: AviationProposedEntity<HashAirport> = {
        localEntityId: airportMapping.primaryKey,
        entityTypeIds: airportMapping.typeIdsAndProperties.entityTypeIds,
        properties: airportMapping.typeIdsAndProperties.properties,
      };
      result.entities.originAirport = originAirport;

      const departsFromMapping = mapDepartsFrom(flight, provenance);
      const departsFromLink: AviationProposedEntity<HashDepartsFrom> = {
        localEntityId: `departsFrom:${flightEntity.localEntityId}:${originAirport.localEntityId}`,
        sourceEntityLocalId: flightEntity.localEntityId,
        targetEntityLocalId: originAirport.localEntityId,
        entityTypeIds: departsFromMapping.typeIdsAndProperties.entityTypeIds,
        properties: departsFromMapping.typeIdsAndProperties.properties,
      };
      result.entities.departsFrom = departsFromLink;
    }
  }

  if (flight.destination) {
    const airportMapping = mapAirport(flight.destination, provenance);
    if (airportMapping) {
      const destinationAirport: AviationProposedEntity<HashAirport> = {
        localEntityId: airportMapping.primaryKey,
        entityTypeIds: airportMapping.typeIdsAndProperties.entityTypeIds,
        properties: airportMapping.typeIdsAndProperties.properties,
      };
      result.entities.destinationAirport = destinationAirport;

      const arrivesAtMapping = mapArrivesAt(flight, provenance);
      const arrivesAtLink: AviationProposedEntity<HashArrivesAt> = {
        localEntityId: `arrivesAt:${flightEntity.localEntityId}:${destinationAirport.localEntityId}`,
        sourceEntityLocalId: flightEntity.localEntityId,
        targetEntityLocalId: destinationAirport.localEntityId,
        entityTypeIds: arrivesAtMapping.typeIdsAndProperties.entityTypeIds,
        properties: arrivesAtMapping.typeIdsAndProperties.properties,
      };
      result.entities.arrivesAt = arrivesAtLink;
    }
  }

  const airlineMapping = mapAirline(flight, provenance);
  if (airlineMapping) {
    const airline: AviationProposedEntity<HashAirline> = {
      localEntityId: airlineMapping.primaryKey,
      entityTypeIds: airlineMapping.typeIdsAndProperties.entityTypeIds,
      properties: airlineMapping.typeIdsAndProperties.properties,
    };
    result.entities.airline = airline;

    const operatedByLink: AviationProposedEntity<HashOperatedBy> = {
      localEntityId: `operatedBy:${flightEntity.localEntityId}:${airline.localEntityId}`,
      sourceEntityLocalId: flightEntity.localEntityId,
      targetEntityLocalId: airline.localEntityId,
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/operated-by/v/1"],
      properties: { value: {} },
    };
    result.entities.operatedBy = operatedByLink;
  }

  return result;
};

/**
 * The result of building graphs for multiple flights, with deduplication.
 */
export type BatchFlightGraphResult = {
  /**
   * Deduplicated entities and links by primary key string.
   * The key is the localEntityId string, the value is the proposed entity.
   */
  entities: Map<string, AviationProposedEntity>;
};

/**
 * Builds graphs for multiple flights and deduplicates shared entities.
 *
 * Entities like airports and airlines that appear in multiple flights
 * are deduplicated by their primary key. The first occurrence's properties
 * are kept (they should be identical for the same entity).
 *
 * Flights that cannot be mapped (missing required data) are skipped.
 */
export const buildFlightGraphBatch = (
  flights: AeroApiScheduledFlight[],
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
): BatchFlightGraphResult => {
  const entities = new Map<string, AviationProposedEntity>();

  for (const flight of flights) {
    const graph = buildSingleFlightGraph(flight, provenance);

    if (!graph) {
      continue;
    }

    const addEntity = (entity: AviationProposedEntity) => {
      if (!entities.has(entity.localEntityId)) {
        entities.set(entity.localEntityId, entity);
      }
    };

    // Add all entities (including links)
    addEntity(graph.entities.flight);
    if (graph.entities.originAirport) {
      addEntity(graph.entities.originAirport);
    }
    if (graph.entities.destinationAirport) {
      addEntity(graph.entities.destinationAirport);
    }
    if (graph.entities.airline) {
      addEntity(graph.entities.airline);
    }
    if (graph.entities.departsFrom) {
      addEntity(graph.entities.departsFrom);
    }
    if (graph.entities.arrivesAt) {
      addEntity(graph.entities.arrivesAt);
    }
    if (graph.entities.operatedBy) {
      addEntity(graph.entities.operatedBy);
    }
  }

  return { entities };
};

/**
 * Converts a FlightGraphResult to a flat array of ProposedEntities.
 * Useful when you need to iterate over all elements uniformly.
 */
export const flattenFlightGraph = (
  result: FlightGraphResult,
): AviationProposedEntity[] => {
  const elements: AviationProposedEntity[] = [];

  elements.push(result.entities.flight);
  if (result.entities.originAirport) {
    elements.push(result.entities.originAirport);
  }
  if (result.entities.destinationAirport) {
    elements.push(result.entities.destinationAirport);
  }
  if (result.entities.airline) {
    elements.push(result.entities.airline);
  }
  if (result.entities.departsFrom) {
    elements.push(result.entities.departsFrom);
  }
  if (result.entities.arrivesAt) {
    elements.push(result.entities.arrivesAt);
  }
  if (result.entities.operatedBy) {
    elements.push(result.entities.operatedBy);
  }

  return elements;
};

/**
 * Converts a BatchFlightGraphResult to a flat array of ProposedEntities.
 */
export const flattenBatchFlightGraph = (
  result: BatchFlightGraphResult,
): AviationProposedEntity[] => {
  return [...result.entities.values()];
};
