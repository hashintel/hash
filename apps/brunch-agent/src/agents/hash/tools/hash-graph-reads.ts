/**
 * The HASH agent's graph reads: how each is described to the model, and what
 * the model is shown of its result. Their inputs and results are the shared
 * contract in `@hashintel/brunch-agent`; HASH's process page executes them as
 * the signed-in user.
 *
 * The model is shown a read as compact text, not the page's JSON: readable
 * property names, the identifiers it cites and follows up by, and a one-line
 * summary in place of any large value, which it can ask to see in full.
 */

import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import {
  brunchTools,
  vHashEntityReadInput,
  vHashEntityReadResult,
  vHashEntityTypeReadInput,
  vHashEntityTypeReadResult,
  vHashReadFailure,
  vHashWebReadInput,
  vHashWebReadResult,
} from "@hashintel/brunch-agent";

import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/conversation/browser-tool-executor.ts";

/** What the model is shown of a read that failed in HASH's page. */
const hashReadFailureForModel = (output: unknown) => {
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

/** `…/property-type/planned-delivery-time/` → `planned_delivery_time`. */
const slugName = (url: string) => {
  const slug = /\/(?:property|entity)-type\/([^/]+)\//.exec(url)?.[1];
  return slug === undefined ? url : slug.replaceAll("-", "_");
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
    return sharedSlugs.has(slug) ? baseUrl : slug;
  };
};

type PropertyNamer = ReturnType<typeof propertyNamer>;

/** Adds to `found` the type URLs `value` uses as keys, at any depth. */
const collectNestedTypeUrls = (value: unknown, found: Set<string>) => {
  if (Array.isArray(value)) {
    for (const item of value) collectNestedTypeUrls(item, found);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (slugName(key) !== key) found.add(key);
      collectNestedTypeUrls(item, found);
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

/** A label longer than this is cut short in an entity's heading. */
const labelPreviewLength = 200;

/** An entity's label, JSON-quoted, cut short with `…` when long. */
const renderLabel = (label: string) =>
  JSON.stringify(
    label.length > labelPreviewLength
      ? `${label.slice(0, labelPreviewLength)}…`
      : label,
  );

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
    : `${oneLine(title)} — ${oneLine(description)}`;

/** Issues one read to HASH's page and shows the model what it settled with. */
const runHashRead = async (
  execute: BrowserToolExecutor,
  call: {
    readonly toolName: string;
    readonly input: unknown;
    readonly toolCallId: string;
    readonly signal?: AbortSignal;
  },
  forModel: (output: unknown) => unknown,
) => {
  const result = await execute(call);
  return {
    output: browserResultEnvelope({
      ...result,
      output: hashReadFailureForModel(result.output) ?? forModel(result.output),
    }),
    terminate: false,
  };
};

export const hashEntityReadDescription = `Read entities from the HASH graph, as the signed-in user: only what they may see is returned, and archived entities are never returned, so an entity that is absent may exist but be hidden from them, archived, or filed under another type title or web. Filters combine: an entity must match every filter given. Returns compact text: first each property name used, with its title and description (units are in the description), and each entity type title with its entityTypeId (a versioned URL); then each entity, headed by its types' titles (each with its entityTypeId when two types in the read share that title), its name (cut short when long), and (linked) if it was reached by following links rather than matching the filters, or (draft); then its entityId (\`<webId>~<uuid>\`, with \`~<draftId>\` for a draft), editionId (the exact version read), for a link entity the entityIds it links from and to, and one line per property. A property's short name, here and in nested values, comes from its base URL, unless two properties in the read would share one: then both show by their full base URL, so a name holds within one read only. A large value is summarised as <kind, size: shape>; to see it, read the entity again by entityIds with its id in fullValuesFor. The graph returns at most ${formattedQueryLimit} matches at once; when it stopped there, the text says more may match than shown, so narrow the filter. A read that failed returns { error }. Read webs with ${brunchTools.queryHashWebs} first, for the web ids to filter by; then read the types of the entities found with ${brunchTools.queryHashEntityTypes}, by their entityTypeIds, for the links and other properties a type allows, and follow up on a found entity by its entityId.`;

export const hashEntityReadEmptyNote =
  "No entities matched that the signed-in user can see. One may still exist but be hidden from them, archived, or filed under another type title or web.";

/**
 * What the model is shown of a settled entity read: compact text, with the
 * values of the entities in `fullValuesFor` in full.
 */
export const hashEntityReadForModel = (
  output: unknown,
  fullValuesFor: readonly string[] = [],
) => {
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

  const carriedBaseUrls = new Set(
    entities.flatMap(({ properties }) => Object.keys(properties)),
  );
  const namedBaseUrls = new Set(carriedBaseUrls);
  for (const { properties } of entities)
    collectNestedTypeUrls(Object.values(properties), namedBaseUrls);
  const nameOf = propertyNamer(namedBaseUrls);
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
      ? `${title} (${id})`
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

  const legend = propertyTypes
    .filter(({ baseUrl }) => carriedBaseUrls.has(baseUrl))
    .map(
      ({ baseUrl, title, description }) =>
        `  ${nameOf(baseUrl)}: ${legendLine(title, description)}`,
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
    "entity types:",
    ...[...typesByTitle].map(([title, ids]) => `  ${title}: ${ids.join(", ")}`),
    "entities:",
    ...rendered.map(({ block }) => block),
  ].join("\n");
};

/** The entity read, executed by whatever `execute` reaches HASH through. */
export const createHashEntityReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.queryHashEntities,
    description: hashEntityReadDescription,
    input: vHashEntityReadInput,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.queryHashEntities,
          input: data,
          toolCallId,
          signal,
        },
        (output) => hashEntityReadForModel(output, data.fullValuesFor),
      ),
  });

export const hashEntityTypeReadDescription = `List the entity types in the HASH graph that the signed-in user can see: the versions named by entityTypeIds, or else each type's latest version. Filters combine: a type must match every filter given. Returns compact text: each type headed by its title and entityTypeId (a versioned URL), then its description, its properties (inherited ones included), each by its short name and its title, and its links, each by its title and linkEntityTypeId, with the entity types it may point to (any, when not limited). A type's title or entityTypeId can filter an entity read. The graph returns at most ${formattedQueryLimit} types at once; when it stopped there, the text says more may match than shown. A read that failed returns { error }. Read it after ${brunchTools.queryHashWebs} and ${brunchTools.queryHashEntities}, for the entityTypeIds the entities found carry. Pass the entityTypeIds of entities you read; webIds rarely help, since most types live in HASH's shared webs. Without filters it lists the entity types the user can see, up to that limit: a very large read.`;

const hashEntityTypeReadEmptyNote =
  "No entity types matched that the signed-in user can see.";

/** What the model is shown of a settled entity type read: compact text. */
export const hashEntityTypeReadForModel = (output: unknown) => {
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
        `- ${oneLine(type.title)}: ${type.entityTypeId}`,
        ...(type.description === undefined || type.description === ""
          ? []
          : [`  description: ${oneLine(type.description)}`]),
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
                  `    ${title === undefined ? slugName(linkEntityTypeId) : oneLine(title)}: ${linkEntityTypeId} -> ${
                    destinationEntityTypeIds === undefined
                      ? "any"
                      : destinationEntityTypeIds.join(", ")
                  }`,
              ),
            ]),
      ].join("\n"),
    ),
  ].join("\n");
};

/** The entity type read, executed by whatever `execute` reaches HASH through. */
export const createHashEntityTypeReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.queryHashEntityTypes,
    description: hashEntityTypeReadDescription,
    input: vHashEntityTypeReadInput,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.queryHashEntityTypes,
          input: data,
          toolCallId,
          signal,
        },
        hashEntityTypeReadForModel,
      ),
  });

export const hashWebReadDescription = `List the signed-in user's own HASH web and the webs of the organizations they belong to. Returns compact text, one line per web: its kind (user or organization), its name and @shortname where it has them, and its webId. A web id can limit an entity or entity type read. A read that failed returns { error }. Read it first, before ${brunchTools.queryHashEntities} and ${brunchTools.queryHashEntityTypes}.`;

/** What the model is shown of a settled web read: one line per web. */
export const hashWebReadForModel = (output: unknown) => {
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
        ...(shortname === undefined ? [] : [`@${shortname}`]),
        `webId: ${webId}`,
      ].join(" "),
    ),
  ].join("\n");
};

/** The web read, executed by whatever `execute` reaches HASH through. */
export const createHashWebReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.queryHashWebs,
    description: hashWebReadDescription,
    input: vHashWebReadInput,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.queryHashWebs,
          input: data,
          toolCallId,
          signal,
        },
        hashWebReadForModel,
      ),
  });

/** Every HASH graph read, executed by whatever `execute` reaches HASH through. */
export const createHashGraphReadTools = (execute: BrowserToolExecutor) => [
  createHashEntityReadTool(execute),
  createHashEntityTypeReadTool(execute),
  createHashWebReadTool(execute),
];
