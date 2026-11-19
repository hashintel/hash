import {
  oneLine,
  readFacts,
  readNaming,
  unmatchedNote,
  type ReadEntity,
} from "./naming";
import { cutShort, groupBy, readIndex } from "./read-index";

/**
 * The details: each named entity in full, with its edition, its properties,
 * and per link type the entities it links to and from.
 */
import type { HashEntityReadResult } from "../graph-reads";
import type { HashEntityDetailsInput } from "./inputs";

const largeValueBytes = 500;
const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** A value over the threshold, as its kind, size and shape. */
const summarised = (value: unknown) => {
  const bytes = byteLength(JSON.stringify(value));
  if (bytes <= largeValueBytes) return value;
  const size = `${(bytes / 1000).toFixed(1)} KB`;
  if (typeof value === "string")
    return `<text, ${size}: ${cutShort(oneLine(value), 80)}>`;
  if (Array.isArray(value)) return `<array of ${value.length}, ${size}>`;
  return `<object, ${size}: ${Object.keys(value as object)
    .slice(0, 8)
    .join(", ")}>`;
};

export const projectEntityDetails = (
  result: HashEntityReadResult,
  input: HashEntityDetailsInput,
) => {
  const naming = readNaming(result);
  const { typeKey, propertyName } = naming;
  const { linksFrom, linksTo, ref } = readIndex(result);
  const full = new Set<string>(input.fullValuesFor ?? []);
  const selected = new Set(input.properties ?? []);
  const keeps = (baseUrl: string) =>
    selected.size === 0 || selected.has(propertyName(baseUrl));
  const shownTypeIds = new Set<string>();
  const shownBaseUrls = new Set<string>();
  const heldNames = new Set<string>();
  const summarisedIds = new Set<string>();

  const linkMap = (
    links: readonly ReadEntity[] | undefined,
    farOf: (link: ReadEntity) => string,
  ) => {
    if (links === undefined || links.length === 0) return undefined;
    return Object.fromEntries(
      [...groupBy(links, typeKey)].map(([linkType, group]) => {
        for (const entityTypeId of group[0]!.entityTypeIds)
          shownTypeIds.add(entityTypeId);
        return [
          linkType,
          group.map((link) => {
            const ownProperties = Object.entries(link.properties).map(
              ([baseUrl, value]) => {
                shownBaseUrls.add(baseUrl);
                return [propertyName(baseUrl), summarised(value)] as const;
              },
            );
            return {
              ...ref(farOf(link)),
              ...(ownProperties.length === 0
                ? {}
                : {
                    link: link.entityId,
                    properties: Object.fromEntries(ownProperties),
                  }),
            };
          }),
        ];
      }),
    );
  };

  const matched = result.entities.filter((entity) => entity.matched);
  const entities = matched.map((entity) => {
    for (const entityTypeId of entity.entityTypeIds)
      shownTypeIds.add(entityTypeId);
    const properties = Object.entries(entity.properties).flatMap(
      ([baseUrl, value]) => {
        heldNames.add(propertyName(baseUrl));
        if (!keeps(baseUrl)) return [];
        shownBaseUrls.add(baseUrl);
        const shown = full.has(entity.entityId) ? value : summarised(value);
        if (shown !== value) summarisedIds.add(entity.entityId);
        return [[propertyName(baseUrl), shown] as const];
      },
    );
    const out = linkMap(
      linksFrom.get(entity.entityId),
      (link) => link.linkData!.rightEntityId,
    );
    const incoming = linkMap(
      linksTo.get(entity.entityId),
      (link) => link.linkData!.leftEntityId,
    );
    return {
      ...ref(entity.entityId),
      editionId: entity.editionId,
      type: typeKey(entity),
      ...(entity.draft ? { draft: true } : {}),
      ...(entity.linkData === undefined
        ? {}
        : {
            from: ref(entity.linkData.leftEntityId),
            to: ref(entity.linkData.rightEntityId),
          }),
      ...(properties.length === 0
        ? {}
        : { properties: Object.fromEntries(properties) }),
      ...(out === undefined ? {} : { linksTo: out }),
      ...(incoming === undefined ? {} : { linkedFrom: incoming }),
    };
  });

  const returned = new Set(matched.map(({ entityId }) => entityId));
  const missing = input.entityIds.filter((entityId) => !returned.has(entityId));
  return {
    read: {
      view: "details",
      entities: entities.length,
      ...readFacts(result),
      notes: [
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
        ...(summarisedIds.size > 0
          ? [
              `Values over ${largeValueBytes} bytes are summarised in <…>; read again with the entity in fullValuesFor to see them.`,
            ]
          : []),
      ],
    },
    entities,
    legend: naming.legend({
      entityTypeIds: shownTypeIds,
      baseUrls: shownBaseUrls,
    }),
  };
};
