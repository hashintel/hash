/**
 * Frontier expansion for the TYPE graph: fetching the schemas of types that
 * are referenced by an edge but not in the displayed set (filtered out, on
 * another web, or hosted remotely), so the user can walk outward from the
 * current view -- the type mirror of the entity graph's
 * {@link "../entity-graph/use-frontier-expansion"}.
 *
 * Expansion is two state sets feeding {@link "./build-graph"}:
 *
 * - `expandedUrls`: types the user asked to expand. Build marks a referenced
 *   expanded type as loaded and walks its own links -- IF its schema is known.
 * - `fetchedSchemas`: schemas retrieved here for expanded types outside the
 *   entity-types context, queried by exact versioned URL. A URL the graph
 *   store doesn't know (e.g. an unfetched remote type) stays a grey frontier
 *   node and is remembered as failed so it is not re-queried.
 */
import { useLazyQuery } from "@apollo/client";
import { useCallback, useMemo, useRef, useState } from "react";

import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntityTypesQuery } from "../../../../graphql/queries/ontology/entity-type.queries";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";

export interface TypeFrontierExpansion {
  /** Types the user expanded (select or load-all), loaded or still fetching. */
  readonly expandedUrls: ReadonlySet<VersionedUrl>;
  /** Schemas fetched on demand, keyed by their versioned URL. */
  readonly fetchedSchemas: ReadonlyMap<VersionedUrl, EntityType>;
  /** How many expansions are awaiting their schema fetch. */
  readonly pendingCount: number;
  readonly error: string | undefined;
  /**
   * Expand frontier types: mark them expanded and fetch any whose schema is
   * not already known. URLs already expanded, in flight, or previously not
   * found are skipped.
   */
  readonly expandTypes: (urls: readonly VersionedUrl[]) => void;
}

interface UseTypeFrontierExpansionParams {
  /** Whether a schema for this URL is already loaded client-side (no fetch needed). */
  readonly isSchemaKnown: (url: VersionedUrl) => boolean;
}

export function useTypeFrontierExpansion({
  isSchemaKnown,
}: UseTypeFrontierExpansionParams): TypeFrontierExpansion {
  const [expandedUrls, setExpandedUrls] = useState<ReadonlySet<VersionedUrl>>(
    new Set(),
  );
  const [fetchedSchemas, setFetchedSchemas] = useState<
    ReadonlyMap<VersionedUrl, EntityType>
  >(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);

  // Mutable mirrors of the gating sets: expansion must be idempotent from
  // within one event (state updates are async), and fetch bookkeeping never
  // needs to trigger a render by itself.
  const expanded = useRef(new Set<VersionedUrl>());
  const inFlight = useRef(new Set<VersionedUrl>());
  const notFound = useRef(new Set<VersionedUrl>());

  const [queryEntityTypes] = useLazyQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, { fetchPolicy: "cache-first" });

  const expandTypes = useCallback(
    (urls: readonly VersionedUrl[]) => {
      const newlyExpanded = urls.filter((url) => !expanded.current.has(url));
      if (newlyExpanded.length === 0) {
        return;
      }

      for (const url of newlyExpanded) {
        expanded.current.add(url);
      }
      setExpandedUrls(new Set(expanded.current));

      const toFetch = newlyExpanded.filter(
        (url) =>
          !isSchemaKnown(url) &&
          !inFlight.current.has(url) &&
          !notFound.current.has(url),
      );
      if (toFetch.length === 0) {
        return;
      }

      for (const url of toFetch) {
        inFlight.current.add(url);
      }
      setPendingCount((count) => count + toFetch.length);

      void queryEntityTypes({
        variables: {
          request: {
            filter: {
              any: toFetch.map((url) => ({
                equal: [{ path: ["versionedUrl"] }, { parameter: url }],
              })),
            },
            temporalAxes: currentTimeInstantTemporalAxes,
          },
        },
      })
        .then((response) => {
          const returned = response.data?.queryEntityTypes.entityTypes ?? [];

          setFetchedSchemas((previous) => {
            const next = new Map(previous);
            for (const { schema } of returned) {
              next.set(schema.$id, schema);
            }
            return next;
          });

          const returnedUrls = new Set(
            returned.map(({ schema }) => schema.$id),
          );
          for (const url of toFetch) {
            if (!returnedUrls.has(url)) {
              // Unknown to this instance's graph store -- leave the node a
              // grey frontier dot rather than re-querying forever.
              notFound.current.add(url);
            }
          }

          if (response.error) {
            setError(response.error.message);
          }
        })
        .catch((fetchError: Error) => {
          setError(fetchError.message);
        })
        .finally(() => {
          for (const url of toFetch) {
            inFlight.current.delete(url);
          }
          setPendingCount((count) => count - toFetch.length);
        });
    },
    [isSchemaKnown, queryEntityTypes],
  );

  return useMemo(
    () => ({
      expandedUrls,
      fetchedSchemas,
      pendingCount,
      error,
      expandTypes,
    }),
    [expandedUrls, fetchedSchemas, pendingCount, error, expandTypes],
  );
}
