/**
 * Pure mapping from the types page's ontology data to the type-graph worker's
 * ingest payloads ({@link "../worker/type-graph/protocol"}).
 *
 * Nodes are entity types; LINK types are edges (`Person --Has Friend-->
 * Person`), aggregated per (source, link type, destination) rather than drawn
 * as intermediate nodes the way the old sigma view did. Two exceptions keep
 * every relationship visible:
 *
 * - An unconstrained destination targets the one synthetic "Anything" node.
 * - A link type that is itself a link DESTINATION is materialized as a node
 *   (otherwise the link-to-link reference would connect to nothing).
 *
 * A destination outside the displayed set still gets a node -- marked
 * `isLoaded: false`, rendered in the frontier grey -- so filtered views show
 * where their types point. Titles for those come from the entity-types
 * context when known, falling back to the URL slug for remote types.
 */
import { extractBaseUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";

import type { SpecialEntityTypeRecord } from "../../../../shared/entity-types-context/shared/context-types";
import type { TypeSchemaEntry } from "../worker/protocol";
import type {
  IngestTypeEdge,
  IngestTypeNode,
} from "../worker/type-graph/protocol";
import type {
  DataTypeWithMetadata,
  EntityType,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * The synthetic node an unconstrained link destination points at. Not a real
 * VersionedUrl: the worker treats node ids as opaque strings, and the bridge
 * guards it out of type-open / fetch paths.
 */
export const ANYTHING_NODE_URL = "urn:hash:type-graph:anything" as VersionedUrl;

/** What the bridge needs to present a node or edge label/card for a type. */
export interface TypeDisplayInfo {
  readonly title: string;
  readonly icon?: string;
  readonly kind: "entityType" | "linkType" | "anything";
  /** False for a referenced-but-not-displayed (frontier) type. */
  readonly isLoaded: boolean;
}

export interface TypeGraph {
  readonly nodes: readonly IngestTypeNode[];
  readonly edges: readonly IngestTypeEdge[];
  readonly linkTypeSchemas: readonly TypeSchemaEntry[];
  /** Presentation lookup for every node AND link type in the graph. */
  readonly displayInfoByUrl: ReadonlyMap<VersionedUrl, TypeDisplayInfo>;
}

interface BuildTypeGraphParams {
  /** The (possibly filtered) types the page displays. */
  readonly types: readonly (
    | DataTypeWithMetadata
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
  )[];
  /** Every loaded entity type (the entity-types context), for ancestor/destination lookups. */
  readonly allEntityTypes: readonly EntityTypeWithMetadata[] | null;
  readonly isSpecialEntityTypeLookup: Record<
    VersionedUrl,
    SpecialEntityTypeRecord
  > | null;
  /**
   * Frontier types the user expanded: when referenced by an edge they become
   * loaded, walked nodes (their own links join the graph) instead of grey
   * dead-ends -- provided a schema for them is known here or was fetched.
   */
  readonly expandedUrls?: ReadonlySet<VersionedUrl>;
  /** Schemas fetched on demand for expanded types outside the loaded context. */
  readonly fetchedSchemas?: ReadonlyMap<VersionedUrl, EntityType>;
}

/** Best-effort human title from a type URL slug, for remote types with no local schema. */
function titleFromUrl(url: VersionedUrl): string {
  const slug = /\/types\/entity-type\/(?<slug>[^/]+)\//.exec(url)?.groups?.slug;
  if (!slug) {
    return url;
  }
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Self + transitive ancestors (self first), walking `allOf` through the known schemas. */
function selfAndAncestors(
  entityType: EntityType,
  entityTypesById: ReadonlyMap<VersionedUrl, EntityType>,
): EntityType[] {
  const chain: EntityType[] = [];
  const visited = new Set<VersionedUrl>();
  const queue = [entityType];

  for (const current of queue) {
    if (visited.has(current.$id)) {
      continue;
    }
    visited.add(current.$id);
    chain.push(current);

    for (const { $ref } of current.allOf ?? []) {
      const parent = entityTypesById.get($ref);
      if (parent) {
        queue.push(parent);
      }
    }
  }

  return chain;
}

/**
 * The type's own links plus inherited ones, deduped by base URL (the nearest
 * declaration in the chain wins, mirroring inheritance override semantics).
 */
function inheritedLinks(
  chain: readonly EntityType[],
): [VersionedUrl, NonNullable<EntityType["links"]>[VersionedUrl]][] {
  const result: [
    VersionedUrl,
    NonNullable<EntityType["links"]>[VersionedUrl],
  ][] = [];
  const seenBaseUrls = new Set<string>();

  for (const entityType of chain) {
    for (const [linkTypeId, linkSchema] of typedEntries(
      entityType.links ?? {},
    )) {
      const baseUrl = extractBaseUrl(linkTypeId);
      if (seenBaseUrls.has(baseUrl)) {
        continue;
      }
      seenBaseUrls.add(baseUrl);
      result.push([linkTypeId, linkSchema]);
    }
  }

  return result;
}

const inheritedIcon = (chain: readonly EntityType[]): string | undefined =>
  chain.find(({ icon }) => !!icon)?.icon;

export function buildTypeGraph({
  types,
  allEntityTypes,
  isSpecialEntityTypeLookup,
  expandedUrls,
  fetchedSchemas,
}: BuildTypeGraphParams): TypeGraph {
  const entityTypesById = new Map<VersionedUrl, EntityType>();
  for (const [url, schema] of fetchedSchemas ?? []) {
    entityTypesById.set(url, schema);
  }
  for (const { schema } of allEntityTypes ?? []) {
    entityTypesById.set(schema.$id, schema);
  }
  for (const { schema } of types) {
    if (schema.kind === "entityType") {
      entityTypesById.set(schema.$id, schema);
    }
  }

  const isLinkType = (url: VersionedUrl): boolean =>
    isSpecialEntityTypeLookup?.[url]?.isLink ?? false;

  const nodesByUrl = new Map<VersionedUrl, IngestTypeNode>();
  const edges: IngestTypeEdge[] = [];
  const edgeKeys = new Set<string>();
  const linkSchemasByUrl = new Map<VersionedUrl, TypeSchemaEntry>();
  const displayInfoByUrl = new Map<VersionedUrl, TypeDisplayInfo>();

  const toSchemaEntry = (schema: EntityType): TypeSchemaEntry => {
    const chain = selfAndAncestors(schema, entityTypesById);
    return {
      url: schema.$id,
      title: schema.title,
      inverseTitle: schema.inverse?.title,
      icon: inheritedIcon(chain),
      allOfRefs: chain.slice(1).map((ancestor) => ancestor.$id),
    };
  };

  /** Add (or upgrade to loaded) a node; frontier nodes never downgrade a loaded one. */
  const addNode = (url: VersionedUrl, isLoaded: boolean): void => {
    const existing = nodesByUrl.get(url);
    if (existing && (existing.isLoaded || !isLoaded)) {
      return;
    }

    const schema = entityTypesById.get(url);
    const entry: TypeSchemaEntry = schema
      ? toSchemaEntry(schema)
      : { url, title: titleFromUrl(url), allOfRefs: [] };

    nodesByUrl.set(url, { ...entry, isLoaded });
    displayInfoByUrl.set(url, {
      title: entry.title,
      icon: entry.icon,
      kind: isLinkType(url) ? "linkType" : "entityType",
      isLoaded,
    });
  };

  const addEdge = (edge: IngestTypeEdge): void => {
    const key = `${edge.sourceUrl}\u0000${edge.linkTypeUrl}\u0000${edge.targetUrl}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push(edge);
    }
  };

  let anythingUsed = false;

  /**
   * Node types whose outgoing links still need walking. Seeded with the
   * displayed non-link types; link types materialized as nodes join the
   * worklist so a link-to-a-link's own outgoing links stay visible too.
   */
  const walkQueue: EntityType[] = [];
  const queuedUrls = new Set<VersionedUrl>();
  const enqueue = (schema: EntityType): void => {
    if (!queuedUrls.has(schema.$id)) {
      queuedUrls.add(schema.$id);
      walkQueue.push(schema);
    }
  };

  for (const { schema } of types) {
    if (schema.kind !== "entityType") {
      // Property and data types are not visualized (matching the old view).
      continue;
    }
    if (isLinkType(schema.$id)) {
      // Link types appear as edges (or as nodes only where they are link
      // destinations); unused link types are simply absent.
      continue;
    }
    addNode(schema.$id, true);
    enqueue(schema);
  }

  const displayedUrls = new Set(queuedUrls);

  for (const schema of walkQueue) {
    const chain = selfAndAncestors(schema, entityTypesById);

    for (const [linkTypeId, destinationSchema] of inheritedLinks(chain)) {
      const linkSchema = entityTypesById.get(linkTypeId);
      if (!linkSchema) {
        continue;
      }

      if (!linkSchemasByUrl.has(linkTypeId)) {
        linkSchemasByUrl.set(linkTypeId, toSchemaEntry(linkSchema));
        // Edge hover cards resolve the link type here even when it never
        // becomes a node.
        if (!displayInfoByUrl.has(linkTypeId)) {
          displayInfoByUrl.set(linkTypeId, {
            title: linkSchema.title,
            icon: inheritedIcon(selfAndAncestors(linkSchema, entityTypesById)),
            kind: "linkType",
            isLoaded: true,
          });
        }
      }

      const destinationTypeIds =
        "oneOf" in destinationSchema.items
          ? destinationSchema.items.oneOf.map((dest) => dest.$ref)
          : null;

      if (destinationTypeIds === null) {
        anythingUsed = true;
        addEdge({
          sourceUrl: schema.$id,
          targetUrl: ANYTHING_NODE_URL,
          linkTypeUrl: linkTypeId,
        });
        continue;
      }

      for (const destinationTypeId of destinationTypeIds) {
        const destinationIsLink = isLinkType(destinationTypeId);
        // In-view destinations are already loaded nodes; everything else
        // (filtered-out, remote, or a link-to-a-link target) materializes as
        // a frontier node so the edge has somewhere to land. A link type
        // whose schema is loaded -- or any type the user expanded -- walks
        // onward so ITS links stay visible.
        if (!displayedUrls.has(destinationTypeId)) {
          const destinationLoaded =
            (destinationIsLink ||
              (expandedUrls?.has(destinationTypeId) ?? false)) &&
            entityTypesById.has(destinationTypeId);
          addNode(destinationTypeId, destinationLoaded);
          if (destinationLoaded) {
            enqueue(entityTypesById.get(destinationTypeId)!);
          }
        }
        addEdge({
          sourceUrl: schema.$id,
          targetUrl: destinationTypeId,
          linkTypeUrl: linkTypeId,
        });
      }
    }
  }

  if (anythingUsed) {
    nodesByUrl.set(ANYTHING_NODE_URL, {
      url: ANYTHING_NODE_URL,
      title: "Anything",
      allOfRefs: [],
      // Frontier styling (grey) fits "no constraint" visually; the bridge
      // excludes this url from open/fetch actions.
      isLoaded: false,
    });
    displayInfoByUrl.set(ANYTHING_NODE_URL, {
      title: "Anything",
      kind: "anything",
      isLoaded: false,
    });
  }

  return {
    nodes: [...nodesByUrl.values()],
    edges,
    linkTypeSchemas: [...linkSchemasByUrl.values()],
    displayInfoByUrl,
  };
}
