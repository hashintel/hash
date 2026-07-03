import { describe, expect, it } from "vitest";

import { ANYTHING_NODE_URL, buildTypeGraph } from "./build-graph";

import type { SpecialEntityTypeRecord } from "../../../../shared/entity-types-context/shared/context-types";
import type {
  EntityType,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const url = (slug: string): VersionedUrl =>
  `https://hash.ai/@test/types/entity-type/${slug}/v/1` as VersionedUrl;

interface TypeSpec {
  readonly slug: string;
  readonly title: string;
  readonly icon?: string;
  readonly inverseTitle?: string;
  readonly parents?: readonly VersionedUrl[];
  /** linkTypeId -> destination ids (null = unconstrained). */
  readonly links?: Record<VersionedUrl, readonly VersionedUrl[] | null>;
}

/** Minimal EntityTypeWithMetadata: buildTypeGraph reads only the schema. */
function makeType(spec: TypeSpec): EntityTypeWithMetadata {
  const links: NonNullable<EntityType["links"]> = {};
  for (const [linkTypeId, destinations] of Object.entries(spec.links ?? {})) {
    links[linkTypeId as VersionedUrl] = {
      type: "array",
      items: destinations
        ? { oneOf: destinations.map(($ref) => ({ $ref })) as never }
        : {},
    };
  }

  const schema: Partial<EntityType> = {
    kind: "entityType",
    $id: url(spec.slug),
    title: spec.title,
    icon: spec.icon,
    inverse: spec.inverseTitle ? { title: spec.inverseTitle } : undefined,
    allOf: spec.parents?.map(($ref) => ({ $ref })) as EntityType["allOf"],
    links,
  };

  return { schema: schema as EntityType } as EntityTypeWithMetadata;
}

function specialLookup(
  linkTypeUrls: readonly VersionedUrl[],
): Record<VersionedUrl, SpecialEntityTypeRecord> {
  const lookup: Record<VersionedUrl, SpecialEntityTypeRecord> = {};
  for (const linkUrl of linkTypeUrls) {
    lookup[linkUrl] = { isFile: false, isImage: false, isLink: true };
  }
  return lookup;
}

describe("buildTypeGraph", () => {
  const hasFriend = makeType({
    slug: "has-friend",
    title: "Has Friend",
    inverseTitle: "Friend Of",
    links: {},
  });
  const person = makeType({
    slug: "person",
    title: "Person",
    icon: "👤",
    links: { [hasFriend.schema.$id]: [url("person")] },
  });

  it("maps non-link types to loaded nodes and link types to edges", () => {
    const graph = buildTypeGraph({
      types: [person, hasFriend],
      allEntityTypes: [person, hasFriend],
      isSpecialEntityTypeLookup: specialLookup([hasFriend.schema.$id]),
    });

    expect(graph.nodes).toEqual([
      expect.objectContaining({
        url: person.schema.$id,
        title: "Person",
        icon: "👤",
        isLoaded: true,
      }),
    ]);
    expect(graph.edges).toEqual([
      {
        sourceUrl: person.schema.$id,
        targetUrl: person.schema.$id,
        linkTypeUrl: hasFriend.schema.$id,
      },
    ]);
    expect(graph.linkTypeSchemas).toEqual([
      expect.objectContaining({
        url: hasFriend.schema.$id,
        title: "Has Friend",
        inverseTitle: "Friend Of",
      }),
    ]);
    expect(graph.displayInfoByUrl.get(hasFriend.schema.$id)).toEqual(
      expect.objectContaining({ kind: "linkType" }),
    );
  });

  it("inherits parent links, deduped by base URL with the child override winning", () => {
    const employs = makeType({ slug: "employs", title: "Employs" });
    const org = makeType({
      slug: "org",
      title: "Org",
      links: { [employs.schema.$id]: [url("person")] },
    });
    const company = makeType({
      slug: "company",
      title: "Company",
      parents: [org.schema.$id],
      // Same base URL as the parent's link (same id here): must not double.
      links: { [employs.schema.$id]: [url("person")] },
    });

    const graph = buildTypeGraph({
      types: [company, person, employs, org],
      allEntityTypes: [company, org, person, employs, hasFriend],
      isSpecialEntityTypeLookup: specialLookup([
        employs.schema.$id,
        hasFriend.schema.$id,
      ]),
    });

    const companyEdges = graph.edges.filter(
      (edge) => edge.sourceUrl === company.schema.$id,
    );
    expect(companyEdges).toEqual([
      {
        sourceUrl: company.schema.$id,
        targetUrl: person.schema.$id,
        linkTypeUrl: employs.schema.$id,
      },
    ]);

    // The child node carries its ancestor refs (colour families).
    const companyNode = graph.nodes.find(
      (node) => node.url === company.schema.$id,
    );
    expect(companyNode?.allOfRefs).toEqual([org.schema.$id]);
  });

  it("targets the Anything node for unconstrained destinations", () => {
    const relatesTo = makeType({ slug: "relates-to", title: "Relates To" });
    const thing = makeType({
      slug: "thing",
      title: "Thing",
      links: { [relatesTo.schema.$id]: null },
    });

    const graph = buildTypeGraph({
      types: [thing, relatesTo],
      allEntityTypes: [thing, relatesTo],
      isSpecialEntityTypeLookup: specialLookup([relatesTo.schema.$id]),
    });

    expect(graph.edges).toEqual([
      {
        sourceUrl: thing.schema.$id,
        targetUrl: ANYTHING_NODE_URL,
        linkTypeUrl: relatesTo.schema.$id,
      },
    ]);
    const anythingNode = graph.nodes.find(
      (node) => node.url === ANYTHING_NODE_URL,
    );
    expect(anythingNode).toEqual(
      expect.objectContaining({ title: "Anything", isLoaded: false }),
    );
    expect(graph.displayInfoByUrl.get(ANYTHING_NODE_URL)?.kind).toBe(
      "anything",
    );
  });

  it("marks out-of-view destinations as frontier nodes, titled from context when known", () => {
    const owns = makeType({ slug: "owns", title: "Owns" });
    const pet = makeType({ slug: "pet", title: "Pet" });
    const remoteUrl =
      "https://elsewhere.example/@other/types/entity-type/remote-widget/v/3" as VersionedUrl;
    const owner = makeType({
      slug: "owner",
      title: "Owner",
      links: { [owns.schema.$id]: [pet.schema.$id, remoteUrl] },
    });

    const graph = buildTypeGraph({
      // Pet is NOT displayed but IS in the loaded context; the remote url is neither.
      types: [owner, owns],
      allEntityTypes: [owner, owns, pet],
      isSpecialEntityTypeLookup: specialLookup([owns.schema.$id]),
    });

    expect(graph.nodes).toEqual([
      expect.objectContaining({ url: owner.schema.$id, isLoaded: true }),
      expect.objectContaining({
        url: pet.schema.$id,
        title: "Pet",
        isLoaded: false,
      }),
      expect.objectContaining({
        url: remoteUrl,
        title: "Remote Widget",
        isLoaded: false,
      }),
    ]);
  });

  it("materializes a link-type destination as a node and walks its own links", () => {
    const endorses = makeType({ slug: "endorses", title: "Endorses" });
    const submittedBy = makeType({
      slug: "submitted-by",
      title: "Submitted By",
      links: { [endorses.schema.$id]: [url("person")] },
    });
    const claim = makeType({
      slug: "claim",
      title: "Claim",
      links: { [endorses.schema.$id]: [submittedBy.schema.$id] },
    });

    const graph = buildTypeGraph({
      types: [claim, person, submittedBy, endorses],
      allEntityTypes: [claim, person, submittedBy, endorses, hasFriend],
      isSpecialEntityTypeLookup: specialLookup([
        endorses.schema.$id,
        submittedBy.schema.$id,
        hasFriend.schema.$id,
      ]),
    });

    // The targeted link type becomes a LOADED node (its schema is local)...
    expect(
      graph.nodes.find((node) => node.url === submittedBy.schema.$id),
    ).toEqual(expect.objectContaining({ isLoaded: true }));
    // ...and its own outgoing links are walked.
    expect(graph.edges).toContainEqual({
      sourceUrl: submittedBy.schema.$id,
      targetUrl: person.schema.$id,
      linkTypeUrl: endorses.schema.$id,
    });
  });

  it("dedupes identical (source, link, destination) triples", () => {
    const knows = makeType({ slug: "knows", title: "Knows" });
    const contact = makeType({
      slug: "contact",
      title: "Contact",
      // Duplicate destination in oneOf.
      links: { [knows.schema.$id]: [url("person"), url("person")] },
    });

    const graph = buildTypeGraph({
      types: [contact, person, knows],
      allEntityTypes: [contact, person, knows, hasFriend],
      isSpecialEntityTypeLookup: specialLookup([
        knows.schema.$id,
        hasFriend.schema.$id,
      ]),
    });

    expect(
      graph.edges.filter((edge) => edge.sourceUrl === contact.schema.$id),
    ).toHaveLength(1);
  });

  it("expands a frontier type whose schema is in the loaded context", () => {
    const owns = makeType({ slug: "owns", title: "Owns" });
    const chases = makeType({ slug: "chases", title: "Chases" });
    const mouse = makeType({ slug: "mouse", title: "Mouse" });
    const pet = makeType({
      slug: "pet",
      title: "Pet",
      links: { [chases.schema.$id]: [mouse.schema.$id] },
    });
    const owner = makeType({
      slug: "owner",
      title: "Owner",
      links: { [owns.schema.$id]: [pet.schema.$id] },
    });

    const lookup = specialLookup([owns.schema.$id, chases.schema.$id]);
    const baseParams = {
      types: [owner, owns],
      allEntityTypes: [owner, owns, pet, chases, mouse],
      isSpecialEntityTypeLookup: lookup,
    };

    // Unexpanded: Pet is a frontier dead-end, its Chases link invisible.
    const before = buildTypeGraph(baseParams);
    expect(
      before.nodes.find((node) => node.url === pet.schema.$id)?.isLoaded,
    ).toBe(false);
    expect(before.edges.some((edge) => edge.sourceUrl === pet.schema.$id)).toBe(
      false,
    );

    // Expanded: Pet loads from the context (no fetch) and walks onward.
    const after = buildTypeGraph({
      ...baseParams,
      expandedUrls: new Set([pet.schema.$id]),
    });
    expect(
      after.nodes.find((node) => node.url === pet.schema.$id)?.isLoaded,
    ).toBe(true);
    expect(after.edges).toContainEqual({
      sourceUrl: pet.schema.$id,
      targetUrl: mouse.schema.$id,
      linkTypeUrl: chases.schema.$id,
    });
    // The walk's new destination is itself a frontier node.
    expect(
      after.nodes.find((node) => node.url === mouse.schema.$id)?.isLoaded,
    ).toBe(false);
  });

  it("expands a remote frontier type from a fetched schema, staying grey without one", () => {
    const cites = makeType({ slug: "cites", title: "Cites" });
    const remoteUrl =
      "https://elsewhere.example/@other/types/entity-type/paper/v/2" as VersionedUrl;
    const article = makeType({
      slug: "article",
      title: "Article",
      links: { [cites.schema.$id]: [remoteUrl] },
    });

    const lookup = specialLookup([cites.schema.$id]);
    const baseParams = {
      types: [article, cites],
      allEntityTypes: [article, cites],
      isSpecialEntityTypeLookup: lookup,
      expandedUrls: new Set([remoteUrl]),
    };

    // Expanded but not yet fetched: remains a frontier node.
    const withoutSchema = buildTypeGraph(baseParams);
    expect(
      withoutSchema.nodes.find((node) => node.url === remoteUrl)?.isLoaded,
    ).toBe(false);

    // Once the fetch lands, the node loads with its real title and links.
    const remoteSchema: EntityType = {
      ...makeType({
        slug: "paper",
        title: "Paper",
        links: { [cites.schema.$id]: [article.schema.$id] },
      }).schema,
      $id: remoteUrl,
    };
    const withSchema = buildTypeGraph({
      ...baseParams,
      fetchedSchemas: new Map([[remoteUrl, remoteSchema]]),
    });
    expect(withSchema.nodes.find((node) => node.url === remoteUrl)).toEqual(
      expect.objectContaining({ title: "Paper", isLoaded: true }),
    );
    expect(withSchema.edges).toContainEqual({
      sourceUrl: remoteUrl,
      targetUrl: article.schema.$id,
      linkTypeUrl: cites.schema.$id,
    });
  });

  it("ignores property and data types", () => {
    const graph = buildTypeGraph({
      types: [
        {
          schema: { kind: "propertyType", $id: url("name") },
        } as never,
      ],
      allEntityTypes: [],
      isSpecialEntityTypeLookup: {},
    });

    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });
});
