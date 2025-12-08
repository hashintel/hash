/**
 * Entity Type Fixtures Index
 *
 * Pre-computed dereferenced entity types for testing without Graph API.
 *
 * These fixtures provide the same output format as calling dereferenceEntityType()
 * with a live Graph API subgraph, but without the network dependency.
 *
 * Usage:
 *   import { getDereferencedEntityType, entityTypeFixtures } from './fixtures/entity-types';
 *
 *   // Get by versioned URL
 *   const personType = getDereferencedEntityType('https://hash.ai/@h/types/entity-type/person/v/1');
 *
 *   // Or access all fixtures
 *   for (const fixture of Object.values(entityTypeFixtures)) {
 *     console.log(fixture.schema.title);
 *   }
 */

import type { VersionedUrl } from "@blockprotocol/type-system";

import type { DereferencedEntityTypeWithSimplifiedKeys } from "../../shared/dereference-entity-type.js";
import { dereferencedOrganizationType } from "./organization.js";
import { dereferencedPersonType } from "./person.js";

/**
 * All available entity type fixtures keyed by their versioned URL
 */
export const entityTypeFixtures: Record<
  string,
  DereferencedEntityTypeWithSimplifiedKeys
> = {
  "https://hash.ai/@h/types/entity-type/person/v/1": dereferencedPersonType,
  "https://hash.ai/@h/types/entity-type/organization/v/3":
    dereferencedOrganizationType,
};

/**
 * Entity type IDs available in fixtures
 */
export const availableEntityTypeIds = Object.keys(
  entityTypeFixtures,
) as VersionedUrl[];

/**
 * Get a dereferenced entity type by its versioned URL
 *
 * @param entityTypeId - The versioned URL of the entity type (e.g., 'https://hash.ai/@h/types/entity-type/person/v/1')
 * @returns The dereferenced entity type with simplified keys, or undefined if not found
 */
export const getDereferencedEntityType = (
  entityTypeId: string,
): DereferencedEntityTypeWithSimplifiedKeys | undefined => {
  return entityTypeFixtures[entityTypeId];
};

/**
 * Get multiple dereferenced entity types by their versioned URLs
 *
 * @param entityTypeIds - Array of versioned URLs
 * @returns Record of entityTypeId -> dereferenced type (only includes found types)
 */
export const getDereferencedEntityTypes = (
  entityTypeIds: string[],
): Record<string, DereferencedEntityTypeWithSimplifiedKeys> => {
  const result: Record<string, DereferencedEntityTypeWithSimplifiedKeys> = {};

  for (const id of entityTypeIds) {
    const fixture = entityTypeFixtures[id];
    if (fixture) {
      result[id] = fixture;
    }
  }

  return result;
};

// Re-export individual fixtures for direct access
export { dereferencedOrganizationType } from "./organization.js";
export { dereferencedPersonType } from "./person.js";
