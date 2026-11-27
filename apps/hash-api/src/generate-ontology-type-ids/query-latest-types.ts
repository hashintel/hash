import { compareOntologyTypeVersions } from "@blockprotocol/type-system";

import type {
  BaseUrl,
  OntologyTypeRecordId,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * Reads every page of a query. The graph returns at most `HASH_GRAPH_QUERY_ONTOLOGY_LIMIT` types per request, 1000 by
 * default, and a cursor to read the rest from.
 *
 * The graph rejects a cursor on a query that filters on `["version"] = "latest"`, so a paged query must not use that
 * filter. Pass the result to {@link keepLatestVersions} instead.
 */
export const queryAllPages = async <
  Response extends { cursor?: VersionedUrl },
  Type,
>(
  queryPage: (after: VersionedUrl | undefined) => Promise<Response>,
  getTypes: (response: Response) => Type[],
): Promise<Type[]> => {
  const types: Type[] = [];
  const cursors = new Set<VersionedUrl>();
  let after: VersionedUrl | undefined;

  do {
    const response = await queryPage(after);
    types.push(...getTypes(response));

    after = response.cursor;
    if (after) {
      if (cursors.has(after)) {
        throw new Error(`Query returned cursor ${after} more than once`);
      }
      cursors.add(after);
    }
  } while (after);

  return types;
};

/**
 * Keeps the highest version of each base URL.
 */
export const keepLatestVersions = <
  Type extends { metadata: { recordId: OntologyTypeRecordId } },
>(
  types: Type[],
): Type[] => {
  const latestByBaseUrl = new Map<BaseUrl, Type>();

  for (const type of types) {
    const { baseUrl, version } = type.metadata.recordId;
    const held = latestByBaseUrl.get(baseUrl);

    if (
      !held ||
      compareOntologyTypeVersions(version, held.metadata.recordId.version) > 0
    ) {
      latestByBaseUrl.set(baseUrl, type);
    }
  }

  return [...latestByBaseUrl.values()];
};
