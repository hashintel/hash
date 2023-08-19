/* Adapted from the Google Cloud Error Model
    - https://github.com/googleapis/googleapis/blob/master/google/rpc/error_details.proto
 */

/**
 * Describes the resource that is being accessed.
 */
export type ResourceInfo = {
  /**
   * A name for the type of resource being accessed.
   *
   * For example "SQL table", "Entity", "Property Type", "Redis"; or the type URL of the resource:
   * e.g. "https://blockprotocol.org/type-system/0.3/schema/meta/entity-type".
   */
  resourceType: string;

  /**
   * The name of the resource being accessed.
   *
   * For example, an ontology type ID: `https://hash.ai/@alice/types/entity-type/Person/`, if the current
   * error is [@local/status/StatusCode.PermissionDenied].
   */
  resourceName: string;

  /**
   * The owner of the resource (optional).
   *
   * For example, a User's entity ID: `2cfa262a-f49a-4a61-a9c5-80a0c5959994%45e528cb-801d-49d1-8f71-d9e2af38a5e7`;
   */
  owner?: string;

  /**
   * Describes what error is encountered when accessing this resource.
   *
   * For example, updating a property on a user's entity may require write permission on that property.
   */
  description: string;
};
