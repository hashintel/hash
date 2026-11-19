import {
  readFacts,
  readNaming,
  unmatchedNote,
  type ReadEntity,
} from "./naming";
import { groupBy, isBareLink, readIndex } from "./read-index";

/**
 * The tabular view: one table per kind of matched entity, every selected
 * property value in full, and each outgoing link type as a column of the ids
 * it links to. Only matched entities become rows.
 */
import type { HashEntityReadResult } from "../graph-reads";
import type { HashEntityTabularInput } from "./inputs";

type Cell = string | number | boolean | null;

const cell = (value: unknown): Cell =>
  value === undefined || value === null
    ? null
    : typeof value === "object"
      ? JSON.stringify(value)
      : (value as string | number | boolean);

/**
 * Entity tabular does not traverse: reached entities appear only as ids in
 * link columns, and joining them takes a second read by those ids.
 *
 * Deferred: `follow`, naming link types (`["has_customer"]`) whose targets get
 * tables of their own in the same read. Its cost is bounded by the model's
 * choice, unlike a traversal depth, which follows every link both ways and
 * multiplied measured reads by up to 140 times (22 materials: 1,676 tokens as
 * rows, 241,995 with every reached entity as tables). Add it if two-read joins
 * prove costly in evaluation.
 */
export const projectEntityTabular = (
  result: HashEntityReadResult,
  input: HashEntityTabularInput,
) => {
  const naming = readNaming(result);
  const { typeKey, propertyName } = naming;
  const { linksFrom } = readIndex(result);
  const selected = new Set(input.properties ?? []);
  const keeps = (baseUrl: string) =>
    selected.size === 0 || selected.has(propertyName(baseUrl));
  const withLinks = input.links !== false;
  const shownTypeIds = new Set<string>();
  const shownBaseUrls = new Set<string>();
  const heldNames = new Set<string>();

  const propertyColumns = (entities: readonly ReadEntity[]) => {
    const baseUrls = [
      ...new Set(entities.flatMap(({ properties }) => Object.keys(properties))),
    ];
    for (const baseUrl of baseUrls) heldNames.add(propertyName(baseUrl));
    const kept = baseUrls.filter(keeps);
    for (const baseUrl of kept) shownBaseUrls.add(baseUrl);
    return kept;
  };
  const propertyCells = (entity: ReadEntity, baseUrls: readonly string[]) =>
    Object.fromEntries(
      baseUrls.map((baseUrl) => [
        propertyName(baseUrl),
        cell(entity.properties[baseUrl]),
      ]),
    );

  const matched = result.entities.filter((entity) => entity.matched);
  /**
   * Ids repeat in every row and link column, and a UUID costs many tokens, so
   * ids in the web most matches belong to are written `~entityUuid`; the
   * header says which web completes them.
   */
  const webTally = [...groupBy(matched, ({ webId }) => webId)].sort(
    ([, left], [, right]) => right.length - left.length,
  );
  const homeWebId = webTally[0]?.[0];
  const short = (entityId: string) =>
    homeWebId !== undefined && entityId.startsWith(`${homeWebId}~`)
      ? entityId.slice(homeWebId.length)
      : entityId;
  const anyDraft = matched.some(({ draft }) => draft);
  const tables: [string, Record<string, Cell>[]][] = [];
  /** Links that carry properties: a table of their own rather than a column. */
  const linkRows = new Map<string, ReadEntity[]>();

  for (const [kind, members] of groupBy(matched, typeKey)) {
    for (const entityTypeId of members[0]!.entityTypeIds)
      shownTypeIds.add(entityTypeId);
    const baseUrls = propertyColumns(members);
    const outgoing = (entity: ReadEntity) =>
      withLinks ? (linksFrom.get(entity.entityId) ?? []) : [];
    const linkColumns = [
      ...new Set(
        members.flatMap((entity) =>
          outgoing(entity).filter(isBareLink).map(typeKey),
        ),
      ),
    ];
    const rows = members.map((entity) => {
      const bare = groupBy(outgoing(entity).filter(isBareLink), typeKey);
      for (const link of outgoing(entity))
        if (!isBareLink(link))
          linkRows.set(typeKey(link), [
            ...(linkRows.get(typeKey(link)) ?? []),
            link,
          ]);
      for (const link of outgoing(entity))
        for (const entityTypeId of link.entityTypeIds)
          shownTypeIds.add(entityTypeId);
      return {
        id: short(entity.entityId),
        editionId: entity.editionId,
        label: entity.label ?? null,
        ...(anyDraft ? { draft: entity.draft } : {}),
        ...(entity.linkData === undefined
          ? {}
          : {
              from: short(entity.linkData.leftEntityId),
              to: short(entity.linkData.rightEntityId),
            }),
        ...propertyCells(entity, baseUrls),
        ...Object.fromEntries(
          linkColumns.map((linkType) => [
            linkType,
            bare
              .get(linkType)
              ?.map((link) => short(link.linkData!.rightEntityId))
              .join(" ") ?? null,
          ]),
        ),
      };
    });
    tables.push([kind, rows]);
  }
  for (const [kind, links] of linkRows) {
    if (tables.some(([existing]) => existing === kind)) continue;
    const baseUrls = propertyColumns(links);
    tables.push([
      kind,
      links.map((link) => ({
        id: short(link.entityId),
        editionId: link.editionId,
        from: short(link.linkData!.leftEntityId),
        to: short(link.linkData!.rightEntityId),
        ...propertyCells(link, baseUrls),
      })),
    ]);
  }

  const returned = new Set(matched.map(({ entityId }) => entityId));
  const missing = (input.entityIds ?? []).filter(
    (entityId) => !returned.has(entityId),
  );
  return {
    read: {
      view: "tabular",
      matched: matched.length,
      ...(homeWebId === undefined
        ? {}
        : {
            ids: `Ids written ~entityUuid are in web ${homeWebId}: the full id, to read or cite one, is ${homeWebId}~entityUuid.`,
          }),
      ...readFacts(result),
      notes: [
        "One table per kind of entity. Link columns hold the ids linked to, space-separated; read those entities by entityIds to see them. Links with properties have tables of their own.",
        ...(missing.length === 0
          ? []
          : [
              `Not returned: ${missing.join(", ")}. The id may be wrong, or the entity hidden from the user, archived, or a draft (set includeDrafts). It is not shown to be absent.`,
            ]),
        ...unmatchedNote(
          "Properties none of these entities hold",
          input.properties,
          heldNames,
        ),
      ],
    },
    tables: Object.fromEntries(tables),
    legend: naming.legend({
      entityTypeIds: shownTypeIds,
      baseUrls: shownBaseUrls,
    }),
  };
};
