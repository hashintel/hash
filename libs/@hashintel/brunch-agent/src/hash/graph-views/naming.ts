/**
 * The names a view gives types and properties, and the legend that maps each
 * name back to what it stands for. One rule throughout: a name is the slug of
 * the type's or property's URL (`purchase_order`, `order_date`); two types
 * sharing a slug add their version (`supplier_v2`), and two property base URLs
 * sharing one are named by their base URL. A name holds within one read.
 */
import type { HashEntityReadResult } from "../graph-reads";

export type ReadEntity = HashEntityReadResult["entities"][number];

export const oneLine = (text: string) => text.replace(/\s+/gu, " ").trim();

const slugOf = (url: string) =>
  /\/(?:property|entity)-type\/([^/]+)\//u.exec(url)?.[1]?.replaceAll("-", "_");

const versionOf = (entityTypeId: string) =>
  /\/v\/(\d+)$/u.exec(entityTypeId)?.[1];

/** Names a set of versioned type ids, distinct within the set. */
export const typeNamer = (entityTypeIds: Iterable<string>) => {
  const bySlug = new Map<string, string[]>();
  for (const entityTypeId of new Set(entityTypeIds)) {
    const slug = slugOf(entityTypeId) ?? entityTypeId;
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), entityTypeId]);
  }
  const names = new Map<string, string>();
  for (const [slug, entityTypeIds] of bySlug) {
    const versioned = entityTypeIds.map(
      (entityTypeId) => `${slug}_v${versionOf(entityTypeId) ?? "?"}`,
    );
    const distinct = new Set(versioned).size === entityTypeIds.length;
    for (const [index, entityTypeId] of entityTypeIds.entries())
      names.set(
        entityTypeId,
        entityTypeIds.length === 1
          ? slug
          : distinct
            ? versioned[index]!
            : entityTypeId,
      );
  }
  return (entityTypeId: string) => names.get(entityTypeId) ?? entityTypeId;
};

/** Names a set of property base URLs, distinct within the set. */
export const propertyNamer = (baseUrls: Iterable<string>) => {
  const counts = new Map<string, number>();
  const unique = new Set(baseUrls);
  for (const baseUrl of unique) {
    const slug = slugOf(baseUrl) ?? baseUrl;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return (baseUrl: string) => {
    const slug = slugOf(baseUrl) ?? baseUrl;
    return counts.get(slug) === 1 ? slug : baseUrl;
  };
};

/**
 * The names one read uses, and the legend of those it showed. A projection
 * names everything through these, then asks for the legend of what it used.
 */
export const readNaming = (result: HashEntityReadResult) => {
  const typeName = typeNamer([
    ...result.entityTypes.map(({ entityTypeId }) => entityTypeId),
    ...result.entities.flatMap(({ entityTypeIds }) => entityTypeIds),
  ]);
  const propertyName = propertyNamer(
    result.entities.flatMap(({ properties }) => Object.keys(properties)),
  );
  const typeTitle = new Map(
    result.entityTypes.map(({ entityTypeId, title }) => [
      entityTypeId,
      oneLine(title),
    ]),
  );
  const typeKey = (entity: ReadEntity) =>
    entity.entityTypeIds.map(typeName).join("+");
  const typeTitles = (entity: ReadEntity) =>
    entity.entityTypeIds
      .map(
        (entityTypeId) => typeTitle.get(entityTypeId) ?? typeName(entityTypeId),
      )
      .join(", ");

  const legend = ({
    entityTypeIds,
    baseUrls,
  }: {
    entityTypeIds: Iterable<string>;
    baseUrls: Iterable<string>;
  }) => {
    const shownBaseUrls = new Set(baseUrls);
    const definitions = new Map<
      string,
      { title: string; description?: string }[]
    >();
    for (const { baseUrl, title, description } of result.propertyTypes) {
      if (!shownBaseUrls.has(baseUrl)) continue;
      const known = definitions.get(baseUrl) ?? [];
      const definition = {
        title: oneLine(title),
        ...(description ? { description: oneLine(description) } : {}),
      };
      if (
        !known.some(
          (other) =>
            other.title === definition.title &&
            other.description === definition.description,
        )
      )
        definitions.set(baseUrl, [...known, definition]);
    }
    return {
      types: Object.fromEntries(
        [...new Set(entityTypeIds)].map((entityTypeId) => [
          typeName(entityTypeId),
          {
            ...(typeTitle.has(entityTypeId)
              ? { title: typeTitle.get(entityTypeId) }
              : {}),
            id: entityTypeId,
          },
        ]),
      ),
      properties: Object.fromEntries(
        [...shownBaseUrls].map((baseUrl) => {
          const [first, ...alternatives] = definitions.get(baseUrl) ?? [];
          return [
            propertyName(baseUrl),
            {
              ...first,
              baseUrl,
              // Key matches select candidate definitions; when versions disagree, show each.
              ...(alternatives.length === 0 ? {} : { alternatives }),
            },
          ];
        }),
      ),
    };
  };

  return { typeName, propertyName, typeKey, typeTitles, legend };
};

/** The part of a read's header every view shares. */
export const readFacts = (result: HashEntityReadResult) =>
  result.truncated === true
    ? {
        limitReached:
          "The graph stopped at its limit of 1,000 matches: more may match than this read covers. Narrow the filter before counting or concluding absence.",
      }
    : {};

/** Requested names the read didn't hold, reported rather than dropped. */
export const unmatchedNote = (
  what: string,
  requested: readonly string[] | undefined,
  held: ReadonlySet<string>,
) => {
  const missing = (requested ?? []).filter((name) => !held.has(name));
  return missing.length === 0 ? [] : [`${what}: ${missing.join(", ")}`];
};
