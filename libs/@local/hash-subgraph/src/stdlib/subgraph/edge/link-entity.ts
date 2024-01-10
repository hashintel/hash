import type { Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import * as temporal from "@blockprotocol/graph/temporal/stdlib";

import type {
  Entity,
  EntityId,
  LinkEntityAndRightEntity,
  Subgraph,
  TimeInterval,
} from "../../../main";

/**
 * Get all outgoing link entities from a given {@link Entity}.
 *
 * @param {Subgraph} subgraph
 * @param {EntityId} entityId - The ID of the source entity to search for outgoing links from
 * @param {TimeInterval} [interval] - An optional {@link TimeInterval} which, when provided with a
 *  {@link Subgraph} that supports temporal versioning, will constrain the results to links that were present during
 *  that interval. If the parameter is omitted then results will default to only returning results that are active in
 *  the latest instant of time in the {@link Subgraph}
 *
 * @returns {Entity[]} - A flat list of all {@link Entity}s associated with {@link OutgoingLinkEdge}s from the specified
 *   {@link Entity}. This list may contain multiple revisions of the same {@link Entity}s, and it might be beneficial to
 *   pair the output with {@link mapElementsIntoRevisions}.
 */
export const getOutgoingLinksForEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): Entity[] =>
  temporal.getOutgoingLinksForEntity(
    subgraph as unknown as SubgraphBp,
    entityId,
    interval,
  ) as Entity[];

/**
 * Get all incoming link entities from a given {@link Entity}.
 *
 * @param {Subgraph} subgraph
 * @param {EntityId} entityId - The ID of the source entity to search for incoming links to
 * @param {TimeInterval} [interval] - An optional {@link TimeInterval} which, when provided with a
 *  {@link Subgraph} that supports temporal versioning, will constrain the results to links that were present during
 *  that interval. If the parameter is omitted then results will default to only returning results that are active in
 *  the latest instant of time in the {@link Subgraph}
 *
 * @returns {Entity[]} - A flat list of all {@link Entity}s associated with {@link IncomingLinkEdge}s from the specified
 *   {@link Entity}. This list may contain multiple revisions of the same {@link Entity}s, and it might be beneficial to
 *   pair the output with {@link mapElementsIntoRevisions}.
 */
export const getIncomingLinksForEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): Entity[] =>
  temporal.getIncomingLinksForEntity(
    subgraph as unknown as SubgraphBp,
    entityId,
    interval,
  ) as Entity[];

/**
 * Get the "left entity" revisions (by default this is the "source") of a given link entity.
 *
 * @param {Subgraph} subgraph
 * @param {EntityId} entityId - The ID of the link entity
 * @param {TimeInterval} [interval] - An optional {@link TimeInterval} which, when provided with a
 *  {@link Subgraph} that supports temporal versioning, will constrain the results to links that were present during
 *  that interval. If the parameter is omitted then results will default to only returning results that are active in
 *  the latest instant of time in the {@link Subgraph}
 *
 * @returns {Entity[] | undefined} - all revisions of the left {@link Entity} which was associated with a
 *   {@link HasLeftEntityEdge}, if found, from the given {@link EntityId} within the {@link Subgraph}, otherwise
 *   `undefined`.
 */
export const getLeftEntityForLinkEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): Entity[] | undefined =>
  temporal.getLeftEntityForLinkEntity(
    subgraph as unknown as SubgraphBp,
    entityId,
    interval,
  ) as Entity[] | undefined;

/**
 * Get the "right entity" revisions (by default this is the "target") of a given link entity.
 *
 * @param {Subgraph} subgraph
 * @param {EntityId} entityId - The ID of the link entity
 * @param {TimeInterval} [interval] - An optional {@link TimeInterval} which, when provided with a
 *  {@link Subgraph} that supports temporal versioning, will constrain the results to links that were present during
 *  that interval. If the parameter is omitted then results will default to only returning results that are active in
 *  the latest instant of time in the {@link Subgraph}
 *
 * @returns {Entity[] | undefined} - all revisions of the right {@link Entity} which was associated with a
 *   {@link HasRightEntityEdge}, if found, from the given {@link EntityId} within the {@link Subgraph}, otherwise
 *   `undefined`.
 */
export const getRightEntityForLinkEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): Entity[] | undefined =>
  temporal.getRightEntityForLinkEntity(
    subgraph as unknown as SubgraphBp,
    entityId,
    interval,
  ) as Entity[] | undefined;

/**
 * For a given {@link TimeInterval}, get all outgoing link {@link Entity} revisions, and their "target" {@link Entity}
 * revisions (by default this is the "right entity"), from a given {@link Entity}.
 *
 * @param subgraph
 * @param {EntityId} entityId - The ID of the source entity to search for outgoing links from
 * @param {TimeInterval} [interval] - An optional {@link TimeInterval} to constrain the period of time to search across.
 * If the parameter is omitted then results will default to only returning results that are active in the latest instant
 *   of time in the {@link Subgraph}
 */
export const getOutgoingLinkAndTargetEntities = <
  LinkAndRightEntities extends
    LinkEntityAndRightEntity[] = LinkEntityAndRightEntity[],
>(
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): LinkAndRightEntities =>
  temporal.getOutgoingLinkAndTargetEntities(
    subgraph as unknown as SubgraphBp,
    entityId,
    interval,
  );
