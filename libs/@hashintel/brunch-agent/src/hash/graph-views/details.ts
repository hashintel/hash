import {
  oneLine,
  readFacts,
  readNaming,
  unmatchedNote,
  type ReadEntity,
} from "./naming";
import { cutShort, groupBy, readIndex } from "./read-index";
import { estimateTokens } from "./size";

/**
 * The details: each named entity in full, with its edition, its properties,
 * and per link type the entities it links to and from.
 */
import type { HashEntityReadResult } from "../graph-reads";
import type { HashEntityDetailsInput } from "./inputs";

const largeValueBytes = 500;
/** The most one value read by path shows in full; more is outlined a level down. */
const pathValueMaxTokens = 8_000;
const outlineKeys = 10;
const byteLength = (text: string) => new TextEncoder().encode(text).length;
const sizeOf = (value: unknown) => byteLength(JSON.stringify(value) ?? "");
const kilobytes = (bytes: number) => `${(bytes / 1000).toFixed(1)} KB`;

/**
 * A value over the threshold, as its kind, size and shape: an object's keys by
 * size, the larger ones with theirs, so a path into it can be chosen.
 */
const summarised = (value: unknown) => {
  const bytes = sizeOf(value);
  if (bytes <= largeValueBytes) return value;
  const size = kilobytes(bytes);
  if (typeof value === "string")
    return `<text, ${size}: ${cutShort(oneLine(value), 80)}>`;
  if (Array.isArray(value)) {
    const first: unknown = value[0];
    const itemKeys =
      typeof first === "object" && first !== null && !Array.isArray(first)
        ? `: items with ${Object.keys(first).slice(0, 6).join(", ")}`
        : "";
    return `<array of ${value.length}, ${size}${itemKeys}>`;
  }
  const keys = Object.entries(value as object)
    .map(([key, child]) => ({ key, bytes: sizeOf(child) }))
    .sort((left, right) => right.bytes - left.bytes);
  const shown = keys
    .slice(0, outlineKeys)
    .map(({ key, bytes: childBytes }) =>
      childBytes > largeValueBytes ? `${key} ${kilobytes(childBytes)}` : key,
    );
  const more = keys.length - shown.length;
  return `<object, ${size}: ${shown.join(", ")}${more > 0 ? `, ${more} more` : ""}>`;
};

/** What a path names inside a value, or the keys it could have named. */
const valueAt = (
  value: unknown,
  path: readonly string[],
):
  | { found: true; value: unknown }
  | { found: false; at: string; keys: string[] } => {
  let here = value;
  for (const [position, step] of path.entries()) {
    const container =
      typeof here === "object" && here !== null
        ? (here as Record<string, unknown>)
        : undefined;
    if (container === undefined || !(step in container))
      return {
        found: false,
        at: path.slice(0, position + 1).join("."),
        keys:
          container === undefined
            ? []
            : Object.keys(container).slice(0, outlineKeys),
      };
    here = container[step];
  }
  return { found: true, value: here };
};

/** A value read by path: in full when it fits, else each part summarised. */
const shownByPath = (value: unknown) => {
  if (estimateTokens(JSON.stringify(value) ?? "") <= pathValueMaxTokens)
    return { value, outlined: false };
  if (typeof value !== "object" || value === null)
    return { value: summarised(value), outlined: true };
  return {
    value: Array.isArray(value)
      ? value.map(summarised)
      : Object.fromEntries(
          Object.entries(value).map(([key, child]) => [key, summarised(child)]),
        ),
    outlined: true,
  };
};

export const projectEntityDetails = (
  result: HashEntityReadResult,
  input: HashEntityDetailsInput,
) => {
  const naming = readNaming(result);
  const { typeKey, propertyName } = naming;
  const { linksFrom, linksTo, ref } = readIndex(result);
  const full = new Set<string>(
    (input.fullValuesFor ?? []).flatMap((entry) =>
      typeof entry === "string" ? [entry] : [],
    ),
  );
  const pathsFor = groupBy(
    (input.fullValuesFor ?? []).flatMap((entry) =>
      typeof entry === "string" ? [] : [entry],
    ),
    ({ entityId }) => entityId,
  );
  const pathNotes: string[] = [];
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
    const byPath = (pathsFor.get(entity.entityId) ?? []).flatMap(({ path }) => {
      const [name, ...inside] = path;
      const baseUrl = Object.keys(entity.properties).find(
        (key) => propertyName(key) === name,
      );
      const shownPath = path.join(".");
      if (baseUrl === undefined) {
        pathNotes.push(
          `${entity.entityId} holds no property ${String(name)}; its properties are ${Object.keys(entity.properties).map(propertyName).join(", ")}.`,
        );
        return [];
      }
      shownBaseUrls.add(baseUrl);
      const at = valueAt(entity.properties[baseUrl], inside);
      if (!at.found) {
        pathNotes.push(
          `${entity.entityId} has nothing at ${shownPath} (no ${at.at})${at.keys.length > 0 ? `; there the keys are ${at.keys.join(", ")}` : ""}.`,
        );
        return [];
      }
      const shown = shownByPath(at.value);
      if (shown.outlined)
        pathNotes.push(
          `${shownPath} of ${entity.entityId} is about ${estimateTokens(JSON.stringify(at.value)).toLocaleString("en-US")} tokens, so it is outlined one level down: read a path inside it.`,
        );
      return [[shownPath, shown.value] as const];
    });
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
      ...(byPath.length === 0 ? {} : { values: Object.fromEntries(byPath) }),
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
              `Values over ${largeValueBytes} bytes are summarised in <…>; read again with the entity, or { entityId, path } for part of a value, in fullValuesFor.`,
            ]
          : []),
        ...pathNotes,
      ],
    },
    entities,
    legend: naming.legend({
      entityTypeIds: shownTypeIds,
      baseUrls: shownBaseUrls,
    }),
  };
};
