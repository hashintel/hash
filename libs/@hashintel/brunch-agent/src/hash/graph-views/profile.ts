import { hashGraphViewTools } from "./inputs";
import { oneLine, readFacts, readNaming, type ReadEntity } from "./naming";
import { cutShort, groupBy, isBareLink, readIndex } from "./read-index";

/**
 * The profile: what a set of entities is like and how it connects. One entry
 * per kind of entity, with a count, a summary of each property's values, link
 * structure, and the entities themselves when there are few enough to list.
 */
import type { HashEntityReadResult } from "../graph-reads";
import type { HashEntityProfileInput } from "./inputs";

/** List a group's entities, a value tally or a link's targets up to this many. */
export const hashEntityProfileListUpTo = 25;

const largeValueBytes = 500;
const byteLength = (text: string) => new TextEncoder().encode(text).length;

/**
 * How one property's values look across a group: the first shape that fits of
 * `all` (one value), `bytes` (too large to show), `values` (a tally of few
 * distinct values), `from`/`to` (ordered values) and `distinct`/`examples`;
 * with `setOn` when only some entities have it.
 */
const summariseValues = (values: readonly unknown[], total: number) => {
  const setOn = values.length === total ? {} : { setOn: values.length };
  const sizes = values.map((value) => byteLength(JSON.stringify(value)));
  if (Math.max(...sizes) > largeValueBytes)
    return { bytes: [Math.min(...sizes), Math.max(...sizes)], ...setOn };
  const tally = new Map<string, { value: unknown; count: number }>();
  for (const value of values) {
    const key = JSON.stringify(value);
    const entry = tally.get(key) ?? {
      value: typeof value === "object" ? key : value,
      count: 0,
    };
    entry.count += 1;
    tally.set(key, entry);
  }
  const ranked = [...tally.values()].sort(
    (left, right) => right.count - left.count,
  );
  if (ranked.length === 1) return { all: ranked[0]!.value, ...setOn };
  if (ranked.length <= 8 && ranked.length < values.length)
    return { values: ranked, ...setOn };
  const numbers = values.every((value) => typeof value === "number");
  const ordered =
    numbers ||
    values.every(
      (value) => typeof value === "string" && /^[\d.,:/T Z+-]+$/u.test(value),
    );
  if (ordered) {
    const sorted = [...values].sort((left, right) =>
      numbers
        ? Number(left) - Number(right)
        : String(left).localeCompare(String(right)),
    );
    return {
      from: sorted[0],
      to: sorted.at(-1),
      distinct: ranked.length,
      ...setOn,
    };
  }
  return {
    distinct: ranked.length,
    examples: ranked
      .slice(0, 3)
      .map(({ value }) =>
        typeof value === "string" ? cutShort(oneLine(value), 60) : value,
      ),
    ...setOn,
  };
};

export const projectEntityProfile = (
  result: HashEntityReadResult,
  input: HashEntityProfileInput,
) => {
  const naming = readNaming(result);
  const { typeKey, typeTitles, propertyName } = naming;
  const { byId, links, linksFrom, linksTo, ref } = readIndex(result);
  const farType = (entityId: string) => {
    const far = byId.get(entityId);
    return far === undefined ? "not in this read" : typeKey(far);
  };

  const summariseLinks = (
    members: readonly ReadEntity[],
    direction: "out" | "in",
  ) => {
    const index = direction === "out" ? linksFrom : linksTo;
    const farOf = (link: ReadEntity) =>
      direction === "out"
        ? link.linkData!.rightEntityId
        : link.linkData!.leftEntityId;
    const touching = members.flatMap(({ entityId }) =>
      (index.get(entityId) ?? []).map((link) => ({ near: entityId, link })),
    );
    const entries = [
      ...groupBy(
        touching,
        ({ link }) => `${typeKey(link)}|${farType(farOf(link))}`,
      ).values(),
    ].map((group) => {
      const perMember = [...groupBy(group, ({ near }) => near).values()].map(
        (linksOfMember) => linksOfMember.length,
      );
      const least =
        perMember.length < members.length ? 0 : Math.min(...perMember);
      const most = Math.max(...perMember);
      const targets = [...groupBy(group, ({ link }) => farOf(link))].sort(
        ([, left], [, right]) => right.length - left.length,
      );
      return {
        link: typeKey(group[0]!.link),
        [direction === "out" ? "to" : "from"]: farType(farOf(group[0]!.link)),
        links: group.length,
        each: least === most ? most : [least, most],
        distinct: targets.length,
        ...(targets.length <= hashEntityProfileListUpTo
          ? {
              entities: targets.map(([entityId, linksToTarget]) => ({
                ...ref(entityId),
                links: linksToTarget.length,
              })),
            }
          : {}),
      };
    });
    return entries.length === 0 ? undefined : entries;
  };

  const shownTypeIds = new Set<string>();
  const shownBaseUrls = new Set<string>();
  const unlisted: string[] = [];
  const groups = [
    ...groupBy(
      result.entities.filter((entity) => entity.matched || !isBareLink(entity)),
      (entity) =>
        `${entity.matched ? "matched" : "reached"}|${typeKey(entity)}`,
    ),
  ].sort(([left], [right]) => left.localeCompare(right));

  const kinds = groups.map(([, members]) => {
    const first = members[0]!;
    for (const entityTypeId of first.entityTypeIds)
      shownTypeIds.add(entityTypeId);
    const baseUrls = [
      ...new Set(members.flatMap(({ properties }) => Object.keys(properties))),
    ];
    for (const baseUrl of baseUrls) shownBaseUrls.add(baseUrl);
    const listed = members.length <= hashEntityProfileListUpTo;
    if (!listed) unlisted.push(`${typeKey(first)} (${members.length})`);
    const linksOut = summariseLinks(members, "out");
    const linksIn = summariseLinks(members, "in");
    return {
      name: typeKey(first),
      title: typeTitles(first),
      [first.matched ? "matched" : "reachedByLinks"]: members.length,
      ...(listed
        ? { entities: members.map(({ entityId }) => ref(entityId)) }
        : {}),
      ...(baseUrls.length === 0
        ? {}
        : {
            properties: Object.fromEntries(
              baseUrls.map((baseUrl) => [
                propertyName(baseUrl),
                summariseValues(
                  members.flatMap(({ properties }) =>
                    baseUrl in properties ? [properties[baseUrl]] : [],
                  ),
                  members.length,
                ),
              ]),
            ),
          }),
      ...(linksOut === undefined ? {} : { linksTo: linksOut }),
      ...(linksIn === undefined ? {} : { linkedFrom: linksIn }),
    };
  });
  for (const link of links)
    for (const entityTypeId of link.entityTypeIds)
      shownTypeIds.add(entityTypeId);

  const matched = result.entities.filter((entity) => entity.matched).length;
  return {
    read: {
      view: "profile",
      matched,
      reachedByLinks: result.entities.length - matched,
      traversalDepth: input.traversalDepth ?? 1,
      ...readFacts(result),
      notes: [
        ...(unlisted.length === 0
          ? []
          : [
              `Entities not listed, being more than ${hashEntityProfileListUpTo}: ${unlisted.join(", ")}. Their ids are in ${hashGraphViewTools.tabular} with the same filter.`,
            ]),
        `Read up to ${hashEntityProfileListUpTo} entities' properties and links with ${hashGraphViewTools.details}, or many as rows with ${hashGraphViewTools.tabular}.`,
      ],
    },
    kinds,
    legend: naming.legend({
      entityTypeIds: shownTypeIds,
      baseUrls: shownBaseUrls,
    }),
  };
};
