/**
 * The HASH agent's graph reads as the model meets them: how each is described,
 * and what the model is shown of its result. The reads' inputs and results are
 * the contract in `./graph-reads`; every agent runtime that offers the reads
 * describes and renders them from here.
 *
 * The model is shown a read as compact text, not the page's JSON: readable
 * property names, the identifiers it cites and follows up by, and a one-line
 * summary in place of any large value, which it can ask to see in full.
 */

import * as v from "valibot";

import { brunchTools } from "../constants";
import {
  vHashEntityReadResult,
  vHashEntityTypeReadResult,
  vHashReadFailure,
  vHashWebReadResult,
} from "./graph-reads";

/**
 * What the model is shown of a read that failed in HASH's page, or `undefined`
 * when `output` is not a failure.
 */
export const hashReadFailureForModel = (output: unknown) => {
  const parsed = v.safeParse(vHashReadFailure, output);
  return parsed.success
    ? {
        error: parsed.output.error,
        note: "The read failed; the document is unchanged.",
      }
    : undefined;
};

/**
 * The most matches the graph returns for one query. It mirrors the graph
 * server's default query limit for entities and for ontology types; a
 * deployment can configure another.
 */
const hashGraphQueryLimit = 1000;

const formattedQueryLimit = hashGraphQueryLimit.toLocaleString("en-US");

/** The line a truncated read's text carries, so the model knows to narrow it. */
const truncationNote = (truncated: true | undefined) =>
  truncated === true ? ["More may match than shown; narrow the filter."] : [];

/** A value whose JSON is larger than this is summarised unless asked for in full. */
const valueSummaryThresholdBytes = 500;

const byteLength = (text: string) => new TextEncoder().encode(text).length;

const formatBytes = (bytes: number) =>
  bytes < 1000
    ? `${bytes} B`
    : bytes < 1_000_000
      ? `${(bytes / 1000).toFixed(1)} KB`
      : `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * A name or identifier from HASH's graph — a key, slug, URL or shortname,
 * which a HASH user may have written — as it is shown inside the read's text:
 * bare when it is a plain word or URL, else JSON-quoted, so no line break,
 * quote, comma or brace in it can pose as more of the read's structure.
 */
const plainOrQuoted = (text: string) =>
  /^[\p{L}\p{N}_.~:/?#@!$&*+=%-]+$/u.test(text) ? text : JSON.stringify(text);

/** The slug in a property or entity type URL, if it is one. */
const slugOf = (url: string) =>
  /\/(?:property|entity)-type\/([^/]+)\//.exec(url)?.[1];

/** `…/property-type/planned-delivery-time/` → `planned_delivery_time`. */
const slugName = (url: string) => {
  const slug = slugOf(url);
  return plainOrQuoted(slug === undefined ? url : slug.replaceAll("-", "_"));
};

/**
 * Names each of `baseUrls` by its slug, unless two of them share one, in which
 * case both are named by their base URL.
 */
const propertyNamer = (baseUrls: Iterable<string>) => {
  const slugs = new Set<string>();
  const sharedSlugs = new Set<string>();
  for (const baseUrl of new Set(baseUrls)) {
    const slug = slugName(baseUrl);
    if (slugs.has(slug)) sharedSlugs.add(slug);
    slugs.add(slug);
  }
  return (baseUrl: string) => {
    const slug = slugName(baseUrl);
    return sharedSlugs.has(slug) ? plainOrQuoted(baseUrl) : slug;
  };
};

type PropertyNamer = ReturnType<typeof propertyNamer>;

/** Collects keys at any depth: literal JSON keys reserve aliases too. */
const collectNestedKeys = (value: unknown, found: Set<string>) => {
  if (Array.isArray(value)) {
    for (const item of value) collectNestedKeys(item, found);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      found.add(key);
      collectNestedKeys(item, found);
    }
  }
};

/** A small value on one line, with URL keys shown by their read's names. */
const renderInline = (value: unknown, nameOf: PropertyNamer): string => {
  if (Array.isArray(value))
    return `[${value.map((item) => renderInline(item, nameOf)).join(", ")}]`;
  if (typeof value === "object" && value !== null)
    return `{${Object.entries(value)
      .map(([key, item]) => `${nameOf(key)}: ${renderInline(item, nameOf)}`)
      .join(", ")}}`;
  return JSON.stringify(value);
};

/** Prose on one line. */
const oneLine = (text: string) => text.replace(/\s+/g, " ");

/** `text`, cut short with `…` when longer than `maxLength` characters. */
const cutShort = (text: string, maxLength: number) =>
  text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;

/** A label longer than this is cut short in an entity's heading. */
const labelPreviewLength = 200;

/**
 * An entity type's description longer than this is cut short in a type read:
 * room for a few sentences, the length of a typical description, while one
 * pasted document can't fill the model's context.
 */
const typeDescriptionPreviewLength = 300;

/**
 * A property's description longer than this is cut short in an entity read's
 * legend. Tighter than a type's, since the legend has one line per property
 * the read carries; it still holds a sentence and its unit.
 */
const legendDescriptionPreviewLength = 160;

/** An entity's label, JSON-quoted, cut short with `…` when long. */
const renderLabel = (label: string) =>
  JSON.stringify(cutShort(label, labelPreviewLength));

/** The kind, size and top-level shape of a value too large to show. */
const summarise = (
  value: unknown,
  bytes: number,
  nameOf: PropertyNamer,
): string => {
  const size = formatBytes(bytes);
  if (typeof value === "string") {
    const preview = oneLine(value).slice(0, 80);
    return `<text, ${size}: ${JSON.stringify(`${preview}…`)}>`;
  }
  if (Array.isArray(value)) return `<array of ${value.length}, ${size}>`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    const shown = entries.slice(0, 8).map(([key, item]) => {
      const name = nameOf(key);
      return Array.isArray(item)
        ? `${item.length} ${name}`
        : typeof item === "object" && item !== null
          ? `${name} {${Object.keys(item).length}}`
          : name;
    });
    const more =
      entries.length > shown.length
        ? [`${entries.length - shown.length} more keys`]
        : [];
    return `<object, ${size}: ${[...shown, ...more].join(", ")}>`;
  }
  return `<${typeof value}, ${size}>`;
};

/**
 * One property value: in full as JSON when asked for, a summary when large,
 * else inline.
 */
const renderValue = (
  value: unknown,
  full: boolean,
  nameOf: PropertyNamer,
): { text: string; summarised: boolean } => {
  const json = JSON.stringify(value);
  if (full) return { text: json, summarised: false };
  const bytes = byteLength(json);
  return bytes > valueSummaryThresholdBytes
    ? { text: summarise(value, bytes, nameOf), summarised: true }
    : { text: renderInline(value, nameOf), summarised: false };
};

/** A one-line description of a property or type, from its title and description. */
const legendLine = (title: string, description: string | undefined) =>
  description === undefined || description === ""
    ? oneLine(title)
    : `${oneLine(title)} — ${cutShort(oneLine(description), legendDescriptionPreviewLength)}`;

export const hashEntityReadDescription = `Read entities from the HASH graph, as the signed-in user: only what they may see is returned, and archived entities are never returned, so an entity that is absent may exist but be hidden from them, archived, or filed under another type title or web. Filters combine: an entity must match every filter given. Returns compact text: first candidate property definitions matched by returned keys, each qualified by propertyTypeId (a versioned URL), with its title and description (units are in the description; cut short when long). Multiple versions are alternatives; this global legend does not determine which definition applies to any entity or value. Key matches alone do not establish property ownership, including within opaque JSON. No unit conversion is inferred. Then each entity type title with its entityTypeId (a versioned URL); then each entity, headed by its types' titles (each with its entityTypeId when two types in the read share that title), its name (cut short when long), and (linked) if it was reached by following links rather than matching the filters, or (draft); then its entityId (\`<webId>~<uuid>\`, with \`~<draftId>\` for a draft), editionId (the exact version read), for a link entity the entityIds it links from and to, and one line per property. A property's short name, here and in nested values, comes from its base URL, unless two properties in the read would share one: then both show by their full base URL, so a name holds within one read only. A large value is summarised as <kind, size: shape>; to see it, read the entity again by entityIds with its id in fullValuesFor. The graph returns at most ${formattedQueryLimit} matches at once; when it stopped there, the text says more may match than shown, so narrow the filter. A read that failed returns { error }. Read webs with ${brunchTools.hashQueryWebs} first, for the web ids to filter by; then read the types of the entities found with ${brunchTools.hashQueryEntityTypes}, by their entityTypeIds, for the links and other properties a type allows, and follow up on a found entity by its entityId.`;

export const hashEntityReadEmptyNote =
  "No entities matched that the signed-in user can see. One may still exist but be hidden from them, archived, or filed under another type title or web.";

/**
 * What the model is shown of a settled entity read: compact text, with the
 * values of the entities in `fullValuesFor` in full.
 */
export const hashEntityReadForModel = (
  output: unknown,
  fullValuesFor: readonly string[] = [],
): string => {
  const parsed = v.safeParse(vHashEntityReadResult, output);
  if (!parsed.success)
    throw new Error("HASH's page returned an entity read in an unknown shape.");
  const { entities, propertyTypes, entityTypes, truncated } = parsed.output;

  const full = new Set(fullValuesFor);
  const readIds = new Set(entities.map(({ entityId }) => entityId));
  const unmatchedFull = [...full].filter((id) => !readIds.has(id));
  const unmatchedFullNote =
    unmatchedFull.length === 0
      ? []
      : [`fullValuesFor matched no entity read: ${unmatchedFull.join(", ")}`];
  if (entities.length === 0)
    return [
      hashEntityReadEmptyNote,
      ...truncationNote(truncated),
      ...unmatchedFullNote,
    ].join("\n");

  const carriedKeys = new Set<string>();
  for (const { properties } of entities)
    collectNestedKeys(properties, carriedKeys);
  const nameOf = propertyNamer(carriedKeys);
  const typeTitles = new Map(
    entityTypes.map(({ entityTypeId, title }) => [
      entityTypeId,
      oneLine(title),
    ]),
  );
  const titleOf = (id: string) => typeTitles.get(id) ?? slugName(id);
  const typesByTitle = new Map<string, string[]>();
  for (const id of new Set(
    entities.flatMap(({ entityTypeIds }) => entityTypeIds),
  )) {
    const title = titleOf(id);
    typesByTitle.set(title, [...(typesByTitle.get(title) ?? []), id]);
  }
  const headingOf = (id: string) => {
    const title = titleOf(id);
    return (typesByTitle.get(title)?.length ?? 0) > 1
      ? `${title} (${plainOrQuoted(id)})`
      : title;
  };
  const linked = entities.filter(({ matched }) => !matched).length;

  const rendered = entities.map((entity) => {
    const isFull = full.has(entity.entityId);
    const properties = Object.entries(entity.properties).map(
      ([baseUrl, value]) => ({
        name: nameOf(baseUrl),
        ...renderValue(value, isFull, nameOf),
      }),
    );
    const types = entity.entityTypeIds.map(headingOf).join(", ");
    const flags = [
      ...(entity.matched ? [] : ["(linked)"]),
      ...(entity.draft ? ["(draft)"] : []),
    ];
    const block = [
      `- ${[types, ...(entity.label === undefined ? [] : [renderLabel(entity.label)]), ...flags].join(" ")}`,
      `  entityId: ${entity.entityId}`,
      `  editionId: ${entity.editionId}`,
      ...(entity.linkData === undefined
        ? []
        : [
            `  linksFrom: ${entity.linkData.leftEntityId}`,
            `  linksTo: ${entity.linkData.rightEntityId}`,
          ]),
      ...properties.map(({ name, text }) => `  ${name}: ${text}`),
    ].join("\n");
    return {
      block,
      summarised: properties.some(({ summarised }) => summarised),
    };
  });
  const summarised = rendered.some((entity) => entity.summarised);

  const candidates = propertyTypes.filter(({ baseUrl }) =>
    carriedKeys.has(baseUrl),
  );
  const hasAlternatives =
    new Set(candidates.map(({ baseUrl }) => baseUrl)).size < candidates.length;
  const legend = candidates.map(
    ({ baseUrl, propertyTypeId, title, description }) =>
      `  ${nameOf(baseUrl)} (${plainOrQuoted(propertyTypeId)}): ${legendLine(title, description)}`,
  );

  return [
    `entities: ${entities.length}${linked === 0 ? "" : ` (${linked} reached by links)`}`,
    ...truncationNote(truncated),
    ...(summarised
      ? [
          `Values over ${formatBytes(valueSummaryThresholdBytes)} are summarised; read an entity by entityIds with its id in fullValuesFor to see them.`,
        ]
      : []),
    ...unmatchedFullNote,
    ...(legend.length === 0 ? [] : ["properties:", ...legend]),
    ...(hasAlternatives
      ? [
          "Multiple versions are alternatives; this global legend does not determine which definition applies to any entity or value. Key matches alone do not establish property ownership.",
        ]
      : []),
    "entity types:",
    ...[...typesByTitle].map(
      ([title, ids]) => `  ${title}: ${ids.map(plainOrQuoted).join(", ")}`,
    ),
    "entities:",
    ...rendered.map(({ block }) => block),
  ].join("\n");
};

export const hashEntityTypeReadDescription = `List the entity types in the HASH graph that the signed-in user can see: the versions named by entityTypeIds, or else each type's latest version. Filters combine: a type must match every filter given. Returns compact text: each type headed by its title and entityTypeId (a versioned URL), then its description (cut short when long), its properties (inherited ones included), each by its short name and its title, and its links, each by its title and linkEntityTypeId, with the entity types it may point to (any, when not limited). A type's title or entityTypeId can filter an entity read. The graph returns at most ${formattedQueryLimit} types at once; when it stopped there, the text says more may match than shown. A read that failed returns { error }. Read it after ${brunchTools.hashQueryWebs} and ${brunchTools.hashQueryEntities}, for the entityTypeIds the entities found carry. Pass the entityTypeIds of entities you read; webIds rarely help, since most types live in HASH's shared webs. Without filters it lists the entity types the user can see, up to that limit: a very large read.`;

const hashEntityTypeReadEmptyNote =
  "No entity types matched that the signed-in user can see.";

/** What the model is shown of a settled entity type read: compact text. */
export const hashEntityTypeReadForModel = (output: unknown): string => {
  const parsed = v.safeParse(vHashEntityTypeReadResult, output);
  if (!parsed.success)
    throw new Error(
      "HASH's page returned an entity type read in an unknown shape.",
    );
  const { entityTypes, truncated } = parsed.output;
  if (entityTypes.length === 0)
    return [hashEntityTypeReadEmptyNote, ...truncationNote(truncated)].join(
      "\n",
    );
  const nameOf = propertyNamer(
    entityTypes.flatMap(({ properties }) =>
      properties.map(({ baseUrl }) => baseUrl),
    ),
  );
  return [
    `entity types: ${entityTypes.length}`,
    ...truncationNote(truncated),
    ...entityTypes.map((type) =>
      [
        `- ${oneLine(type.title)}: ${plainOrQuoted(type.entityTypeId)}`,
        ...(type.description === undefined || type.description === ""
          ? []
          : [
              `  description: ${cutShort(oneLine(type.description), typeDescriptionPreviewLength)}`,
            ]),
        ...(type.properties.length === 0
          ? []
          : [
              "  properties:",
              ...type.properties.map(
                ({ baseUrl, title }) =>
                  `    ${nameOf(baseUrl)}: ${title === undefined ? slugName(baseUrl) : oneLine(title)}`,
              ),
            ]),
        ...(type.links.length === 0
          ? []
          : [
              "  links:",
              ...type.links.map(
                ({ linkEntityTypeId, title, destinationEntityTypeIds }) =>
                  `    ${title === undefined ? slugName(linkEntityTypeId) : oneLine(title)}: ${plainOrQuoted(linkEntityTypeId)} -> ${
                    destinationEntityTypeIds === undefined
                      ? "any"
                      : destinationEntityTypeIds.map(plainOrQuoted).join(", ")
                  }`,
              ),
            ]),
      ].join("\n"),
    ),
  ].join("\n");
};

export const hashWebReadDescription = `List the signed-in user's own HASH web and the webs of the organizations they belong to. Returns compact text, one line per web: its kind (user or organization), its name and @shortname where it has them, and its webId. A web id can limit an entity or entity type read. A read that failed returns { error }. Read it first, before ${brunchTools.hashQueryEntities} and ${brunchTools.hashQueryEntityTypes}.`;

/** What the model is shown of a settled web read: one line per web. */
export const hashWebReadForModel = (output: unknown): string => {
  const parsed = v.safeParse(vHashWebReadResult, output);
  if (!parsed.success)
    throw new Error("HASH's page returned a web read in an unknown shape.");
  const { webs } = parsed.output;
  return [
    `webs: ${webs.length}`,
    ...webs.map(({ webId, kind, shortname, name }) =>
      [
        `- ${kind}`,
        ...(name === undefined ? [] : [JSON.stringify(name)]),
        ...(shortname === undefined ? [] : [`@${plainOrQuoted(shortname)}`]),
        `webId: ${webId}`,
      ].join(" "),
    ),
  ].join("\n");
};
