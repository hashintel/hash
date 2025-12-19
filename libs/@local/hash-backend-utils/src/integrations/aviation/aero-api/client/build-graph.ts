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

import type { EntityPrimaryKey } from "../../shared/primary-keys.js";
import { mapAirline } from "./build-graph/airline.js";
import { mapAirport } from "./build-graph/airport.js";
import { mapArrivesAt } from "./build-graph/arrives-at.js";
import { mapDepartsFrom } from "./build-graph/departs-from.js";
import { mapFlight } from "./build-graph/flight.js";
import type { AeroApiScheduledFlight } from "./types.js";

export type { EntityPrimaryKey } from "../../shared/primary-keys.js";

/**
 * A proposed entity to be created or matched against existing entities.
 */
export type ProposedEntity<
  T extends TypeIdsAndPropertiesForEntity = TypeIdsAndPropertiesForEntity,
> = {
  kind: "entity";
  /**
   * The primary key for matching against existing entities.
   * Contains both a string key (for in-memory dedup) and property filters (for DB queries).
   */
  primaryKey: EntityPrimaryKey;
  /**
   * The entity type IDs for this entity.
   */
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  /**
   * The properties for this entity.
   */
  properties: CreateEntityParameters<T>["properties"];
};

/**
 * A proposed link to be created or matched against existing links.
 * Links are identified by their type + left entity + right entity.
 */
export type ProposedLink<
  T extends TypeIdsAndPropertiesForEntity = TypeIdsAndPropertiesForEntity,
> = {
  kind: "link";
  /**
   * The primary key of the source (left) entity.
   */
  leftEntityPrimaryKey: EntityPrimaryKey;
  /**
   * The primary key of the target (right) entity.
   */
  rightEntityPrimaryKey: EntityPrimaryKey;
  /**
   * The link entity type IDs.
   */
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  /**
   * The properties for this link entity.
   */
  properties: CreateEntityParameters<T>["properties"];
};

/**
 * A proposed graph element - either an entity or a link.
 */
export type ProposedGraphElement = ProposedEntity | ProposedLink;

/**
 * The result of building a flight graph, with typed entities and links.
 */
export type FlightGraphResult = {
  entities: {
    flight: ProposedEntity<HashFlight>;
    originAirport?: ProposedEntity<HashAirport>;
    destinationAirport?: ProposedEntity<HashAirport>;
    airline?: ProposedEntity<HashAirline>;
  };
  links: {
    departsFrom?: ProposedLink<HashDepartsFrom>;
    arrivesAt?: ProposedLink<HashArrivesAt>;
    operatedBy?: ProposedLink<HashOperatedBy>;
  };
};

/**
 * Builds a graph of proposed entities and links from a single AeroAPI flight.
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

  const flightEntity: ProposedEntity<HashFlight> = {
    kind: "entity",
    primaryKey: flightMapping.primaryKey,
    entityTypeIds: flightMapping.typeIdsAndProperties.entityTypeIds,
    properties: flightMapping.typeIdsAndProperties.properties,
  };

  const result: FlightGraphResult = {
    entities: {
      flight: flightEntity,
    },
    links: {},
  };

  if (flight.origin) {
    const airportMapping = mapAirport(flight.origin, provenance);
    if (airportMapping) {
      const originAirport: ProposedEntity<HashAirport> = {
        kind: "entity",
        primaryKey: airportMapping.primaryKey,
        entityTypeIds: airportMapping.typeIdsAndProperties.entityTypeIds,
        properties: airportMapping.typeIdsAndProperties.properties,
      };
      result.entities.originAirport = originAirport;

      const departsFromMapping = mapDepartsFrom(flight, provenance);
      const departsFromLink: ProposedLink<HashDepartsFrom> = {
        kind: "link",
        leftEntityPrimaryKey: flightEntity.primaryKey,
        rightEntityPrimaryKey: originAirport.primaryKey,
        entityTypeIds: departsFromMapping.typeIdsAndProperties.entityTypeIds,
        properties: departsFromMapping.typeIdsAndProperties.properties,
      };
      result.links.departsFrom = departsFromLink;
    }
  }

  if (flight.destination) {
    const airportMapping = mapAirport(flight.destination, provenance);
    if (airportMapping) {
      const destinationAirport: ProposedEntity<HashAirport> = {
        kind: "entity",
        primaryKey: airportMapping.primaryKey,
        entityTypeIds: airportMapping.typeIdsAndProperties.entityTypeIds,
        properties: airportMapping.typeIdsAndProperties.properties,
      };
      result.entities.destinationAirport = destinationAirport;

      const arrivesAtMapping = mapArrivesAt(flight, provenance);
      const arrivesAtLink: ProposedLink<HashArrivesAt> = {
        kind: "link",
        leftEntityPrimaryKey: flightEntity.primaryKey,
        rightEntityPrimaryKey: destinationAirport.primaryKey,
        entityTypeIds: arrivesAtMapping.typeIdsAndProperties.entityTypeIds,
        properties: arrivesAtMapping.typeIdsAndProperties.properties,
      };
      result.links.arrivesAt = arrivesAtLink;
    }
  }

  const airlineMapping = mapAirline(flight, provenance);
  if (airlineMapping) {
    const airline: ProposedEntity<HashAirline> = {
      kind: "entity",
      primaryKey: airlineMapping.primaryKey,
      entityTypeIds: airlineMapping.typeIdsAndProperties.entityTypeIds,
      properties: airlineMapping.typeIdsAndProperties.properties,
    };
    result.entities.airline = airline;

    const operatedByLink: ProposedLink<HashOperatedBy> = {
      kind: "link",
      leftEntityPrimaryKey: flightEntity.primaryKey,
      rightEntityPrimaryKey: airline.primaryKey,
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/operated-by/v/1"],
      properties: { value: {} },
    };
    result.links.operatedBy = operatedByLink;
  }

  return result;
};

/**
 * The result of building graphs for multiple flights, with deduplication.
 */
export type BatchFlightGraphResult = {
  /**
   * Deduplicated entities by primary key string.
   * The key is the primaryKey.key string, the value is the proposed entity.
   */
  entities: Map<string, ProposedEntity>;
  /**
   * All links from all flights.
   * Links are not deduplicated as each flight has unique links.
   */
  links: ProposedLink[];
};

/**
 * Builds graphs for multiple flights and deduplicates shared entities.
 *
 * Entities like airports and airlines that appear in multiple flights
 * are deduplicated by their primary key. The first occurrence's properties
 * are kept (they should be identical for the same entity).
 *
 * Flights that cannot be mapped (missing required data) are skipped.
 * Links are not deduplicated as each flight has its own unique links.
 */
export const buildFlightGraphBatch = (
  flights: AeroApiScheduledFlight[],
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
): BatchFlightGraphResult => {
  const entities = new Map<string, ProposedEntity>();
  const links: ProposedLink[] = [];

  for (const flight of flights) {
    const graph = buildSingleFlightGraph(flight, provenance);

    if (!graph) {
      continue;
    }

    const addEntity = (entity: ProposedEntity) => {
      if (!entities.has(entity.primaryKey.key)) {
        entities.set(entity.primaryKey.key, entity);
      }
    };

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

    if (graph.links.departsFrom) {
      links.push(graph.links.departsFrom);
    }
    if (graph.links.arrivesAt) {
      links.push(graph.links.arrivesAt);
    }
    if (graph.links.operatedBy) {
      links.push(graph.links.operatedBy);
    }
  }

  return { entities, links };
};

/**
 * Converts a FlightGraphResult to a flat array of ProposedGraphElements.
 * Useful when you need to iterate over all elements uniformly.
 */
export const flattenFlightGraph = (
  result: FlightGraphResult,
): ProposedGraphElement[] => {
  const elements: ProposedGraphElement[] = [];

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

  // Add links
  if (result.links.departsFrom) {
    elements.push(result.links.departsFrom);
  }
  if (result.links.arrivesAt) {
    elements.push(result.links.arrivesAt);
  }
  if (result.links.operatedBy) {
    elements.push(result.links.operatedBy);
  }

  return elements;
};

/**
 * Converts a BatchFlightGraphResult to a flat array of ProposedGraphElements.
 */
export const flattenBatchFlightGraph = (
  result: BatchFlightGraphResult,
): ProposedGraphElement[] => {
  return [...result.entities.values(), ...result.links];
};
