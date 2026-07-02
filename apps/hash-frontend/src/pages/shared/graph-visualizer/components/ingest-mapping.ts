/**
 * Pure mapping from the page's HashEntity + closed-type data to the worker's
 * ingest and schema-registration payloads. Used for the initial prop-entity
 * feed and for frontier expansions (which arrive with their own type maps).
 */
import { extractBaseUrl } from "@blockprotocol/type-system";
import { getClosedMultiEntityTypeFromMap } from "@local/hash-graph-sdk/entity";

import type {
  IngestEntity,
  PropertySchemaEntry,
  TypeSchemaEntry,
} from "../worker/protocol";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

export const toIngestEntities = (
  entities: readonly HashEntity[],
  rootIds: ReadonlySet<EntityId> | undefined,
): IngestEntity[] =>
  entities.map((entity) => {
    const entityId = entity.metadata.recordId.entityId;
    const isLink = entity.linkData !== undefined;

    return {
      entityId,
      entityTypeIds: entity.metadata.entityTypeIds as VersionedUrl[],
      isLink,
      // A link is never a root. With no root set, every node is a root (no frontier); otherwise
      // root-ness is set membership -- non-members render as greyed-out frontier nodes.
      isRoot: !isLink && (rootIds === undefined || rootIds.has(entityId)),
      linkData: entity.linkData,
      // Property values, for NODE entities only, so the worker can name embedding clusters
      // by their distinctive shared properties. Links are never embedding-clustered.
      properties: isLink ? undefined : entity.properties,
    };
  });

/**
 * Best-effort human title from a versioned type URL (".../entity-type/<slug>/v/N").
 * Used only as a fallback when an ancestor type is absent from `definitions`, so
 * a registered parent never ends up with an empty title.
 */
function titleFromUrl(versionedUrl: VersionedUrl): string {
  const slug = /\/entity-type\/(?<slug>[^/]+)\//.exec(versionedUrl)?.groups
    ?.slug;

  if (!slug) {
    return "";
  }

  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Build one {@link TypeSchemaEntry} per unique VersionedUrl reachable from the
 * entities' types — INCLUDING inherited ancestor types that no entity uses
 * directly.
 *
 * Each `entry.allOf` is the inheritance chain of a directly-applied type: the
 * type itself at depth 0 followed by its ancestors. Those ancestor entries are
 * {@link EntityTypeDisplayMetadata} — they carry `$id`/`depth`/`icon` but NO
 * title — so titles for ancestors are looked up in `definitions.entityTypes`.
 *
 * We register every type in the chain, not just the leaf. Previously only the
 * leaf was registered and its ancestors were pushed as bare parent refs; the
 * worker then interned a parent URL (e.g. a shared "Company" supertype) but had
 * no TypeInfo for it, so root resolution silently produced no root and every
 * such child fell into the catch-all "unknown" bucket (rendering as a nameless
 * "Other" rollup). Registering ancestors lets the worker resolve a real root
 * and group/label them correctly.
 */
export function extractTypeSchemas(
  entities: readonly HashEntity[],
  typeMap: ClosedMultiEntityTypesRootMap | undefined,
  definitions: ClosedMultiEntityTypesDefinitions | undefined,
): TypeSchemaEntry[] {
  if (!typeMap) {
    return [];
  }

  const seen = new Map<VersionedUrl, TypeSchemaEntry>();

  for (const entity of entities) {
    let closedType;
    try {
      closedType = getClosedMultiEntityTypeFromMap(
        typeMap,
        entity.metadata.entityTypeIds,
      );
    } catch {
      continue;
    }

    for (const entry of closedType.allOf) {
      // Chain ordered shallow-to-deep: index 0 is the type itself, the rest are
      // its ancestors (closest first).
      const chain = [...entry.allOf].sort((a, b) => a.depth - b.depth);

      for (let depthIdx = 0; depthIdx < chain.length; depthIdx++) {
        const node = chain[depthIdx]!;
        if (seen.has(node.$id)) {
          continue;
        }

        // Deeper entries are this type's ancestors. Pointing at all of them
        // (not only the direct parent) over-approximates the inheritance DAG
        // with transitive edges — harmless for the worker's root resolution
        // (root = union of parents' roots) and robust to multiple inheritance
        // without reconstructing the DAG here.
        const allOfRefs = chain
          .slice(depthIdx + 1)
          .map((ancestor) => ancestor.$id);

        const definition = definitions?.entityTypes[node.$id];

        seen.set(node.$id, {
          url: node.$id,
          // Leaf has its title on `entry`; ancestors come via `definitions`,
          // falling back to the URL slug so a parent is never title-less.
          title:
            definition?.title ??
            (depthIdx === 0 ? entry.title : titleFromUrl(node.$id)),
          // Link types carry an inverse (target -> source) title; the leaf has it on `entry`,
          // ancestors via `definitions`. Undefined for non-link types (no inverse).
          inverseTitle:
            definition?.inverse?.title ??
            (depthIdx === 0 ? entry.inverse?.title : undefined),
          icon: node.icon ?? definition?.icon,
          allOfRefs,
        });
      }
    }
  }

  return [...seen.values()];
}

/**
 * Property display titles keyed by base URL, for every property type referenced by the
 * loaded entities. Shipped to the worker so a distinctive-feature cluster label reads
 * "Destination = ..." with the human title rather than a raw base URL. The worker holds
 * the property VALUES (on the ingested entities); this supplies their names.
 */
export function extractPropertySchemas(
  definitions: ClosedMultiEntityTypesDefinitions | undefined,
): PropertySchemaEntry[] {
  if (!definitions) {
    return [];
  }

  const seen = new Map<string, PropertySchemaEntry>();
  for (const propertyType of Object.values(definitions.propertyTypes)) {
    const baseUrl = extractBaseUrl(propertyType.$id);
    if (!seen.has(baseUrl)) {
      seen.set(baseUrl, { baseUrl, title: propertyType.title });
    }
  }

  return [...seen.values()];
}
