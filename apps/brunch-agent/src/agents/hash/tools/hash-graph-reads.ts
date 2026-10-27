/**
 * The contracts of the HASH agent's graph reads: each read's name, the input
 * the model gives it, and what the model is shown of its result. HASH's
 * process page executes them as the signed-in user; this module never reaches
 * HASH, so it can move into a shared package with no executor attached.
 *
 * The model is shown a read as compact text, not the page's JSON: readable
 * property names, the identifiers it cites and follows up by, and a one-line
 * summary in place of any large value, which it can ask to see in full.
 */

import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/conversation/browser-tool-executor.ts";

/**
 * List length and id length are deliberately unbounded: the page reads as the
 * signed-in user, and the graph enforces its own limits.
 */
const identifiers = (description: string) =>
  v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1))),
      v.minLength(1),
      v.description(description),
    ),
  );

const webIdsDescription =
  "Web ids to read from. An entity belongs to the web of the user or organization that owns it.";

/**
 * A read whose query failed in HASH's page: the page settles the call with
 * the failure's message rather than failing it, so the model can read why.
 */
const vHashReadFailure = v.object({ error: v.string() });

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
 * The graph returns at most a page of matches, and the page reports
 * `truncated` when it stopped there; the reads don't fetch further pages.
 */
const vTruncated = v.optional(v.literal(true));

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

/** A small value on one line, with URL keys shown by their slug. */
const renderInline = (value: unknown): string => {
  if (Array.isArray(value))
    return `[${value.map((item) => renderInline(item)).join(", ")}]`;
  if (typeof value === "object" && value !== null)
    return `{${Object.entries(value)
      .map(([key, item]) => `${slugName(key)}: ${renderInline(item)}`)
      .join(", ")}}`;
  return JSON.stringify(value);
};

/** Prose on one line. */
const oneLine = (text: string) => text.replace(/\s+/g, " ");

/** The kind, size and top-level shape of a value too large to show. */
const summarise = (value: unknown, bytes: number): string => {
  const size = formatBytes(bytes);
  if (typeof value === "string") {
    const preview = oneLine(value).slice(0, 80);
    return `<text, ${size}: ${JSON.stringify(`${preview}…`)}>`;
  }
  if (Array.isArray(value)) return `<array of ${value.length}, ${size}>`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    const shown = entries.slice(0, 8).map(([key, item]) => {
      const name = slugName(key);
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
): { text: string; summarised: boolean } => {
  const json = JSON.stringify(value);
  if (full) return { text: json, summarised: false };
  const bytes = byteLength(json);
  return bytes > valueSummaryThresholdBytes
    ? { text: summarise(value, bytes), summarised: true }
    : { text: renderInline(value), summarised: false };
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

/**
 * No defaults or transforms: the browser compares the input it was issued
 * with the model's call as it is. HASH's page applies the defaults.
 */
export const vHashEntityReadInput = v.strictObject({
  entityTypes: identifiers(
    "Entity type titles to match, for example `Organization`. A title matches every type with that title, in any web and at any version; a versioned entityTypeId matches that type version only. Entities of any listed type match.",
  ),
  webIds: identifiers(webIdsDescription),
  entityIds: identifiers(
    "Entity ids to read, for example ids returned by an earlier read: `webId~entityUuid`, or `webId~entityUuid~draftId` for a draft. An id with a draft part reads that draft.",
  ),
  traversalDepth: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.maxValue(3),
      v.description(
        "How many links to follow from the matched entities, at most 3. Each link is followed in either direction, so mixed chains such as A → B ← C are included; a matched link entity's own endpoints are included too. 0 returns only the matches. Defaults to 1.",
      ),
    ),
  ),
  includeDrafts: v.optional(
    v.pipe(
      v.boolean(),
      v.description(
        "Whether to include draft entities. Defaults to false. An entity id with a draft part reads that draft either way, along with reached draft links whose left or right endpoint is an explicitly named draft. This exception does not include other draft endpoint records or recursively include further draft links; link endpoint ids remain intact.",
      ),
    ),
  ),
  fullValuesFor: identifiers(
    "Entity ids whose property values to show in full, as JSON, where the result would otherwise summarise a large value. It doesn't change which entities are read: read them by entityIds too.",
  ),
});

export type HashEntityReadInput = v.InferOutput<typeof vHashEntityReadInput>;

export const hashEntityReadDescription =
  "Read entities from the HASH graph, as the signed-in user: only what they may see is returned, and archived entities are never returned, so an entity that is absent may exist but be hidden from them, archived, or filed under another type title or web. Filters combine: an entity must match every filter given. Returns compact text: first each property name used, with its title and description (units are in the description), and each entity type title with its entityTypeId (a versioned URL); then each entity, headed by its types' titles, its name, and (linked) if it was reached by following links rather than matching the filters, or (draft); then its entityId (`<webId>~<uuid>`, with `~<draftId>` for a draft), editionId (the exact version read), for a link entity the entityIds it links from and to, and one line per property. A large value is summarised as <kind, size: shape>; to see it, read the entity again by entityIds with its id in fullValuesFor. The graph returns at most 1,000 matches at once; when it stopped there, the text says more may match than shown, so narrow the filter. A read that failed returns { error }. Read webs with query_hash_webs first, for the web ids to filter by; then read the types of the entities found with query_hash_entity_types, by their entityTypeIds, for the links and other properties a type allows, and follow up on a found entity by its entityId.";

/** One entity as HASH's page returns it: every field comes from the same returned edition. */
const vHashEntity = v.object({
  entityId: v.string(),
  /** The entity's name as HASH labels it, where it has one. */
  label: v.optional(v.string()),
  editionId: v.string(),
  webId: v.string(),
  entityTypeIds: v.array(v.string()),
  properties: v.record(v.string(), v.unknown()),
  draft: v.boolean(),
  matched: v.boolean(),
  linkData: v.optional(
    v.object({ leftEntityId: v.string(), rightEntityId: v.string() }),
  ),
});

const vHashEntityReadResult = v.object({
  /** The title and description of each property the entities carry, by base URL. */
  propertyTypes: v.array(
    v.object({
      baseUrl: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
    }),
  ),
  /** The title of each entity type the entities carry. */
  entityTypes: v.array(
    v.object({ entityTypeId: v.string(), title: v.string() }),
  ),
  entities: v.array(vHashEntity),
  truncated: vTruncated,
});

export type HashEntityReadResult = v.InferOutput<typeof vHashEntityReadResult>;

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
  const nameOf = propertyNamer(carriedBaseUrls);
  const typeTitles = new Map(
    entityTypes.map(({ entityTypeId, title }) => [
      entityTypeId,
      oneLine(title),
    ]),
  );
  const linked = entities.filter(({ matched }) => !matched).length;

  const rendered = entities.map((entity) => {
    const isFull = full.has(entity.entityId);
    const properties = Object.entries(entity.properties).map(
      ([baseUrl, value]) => ({
        name: nameOf(baseUrl),
        ...renderValue(value, isFull),
      }),
    );
    const types = entity.entityTypeIds
      .map((id) => typeTitles.get(id) ?? slugName(id))
      .join(", ");
    const flags = [
      ...(entity.matched ? [] : ["(linked)"]),
      ...(entity.draft ? ["(draft)"] : []),
    ];
    const block = [
      `- ${[types, ...(entity.label === undefined ? [] : [JSON.stringify(entity.label)]), ...flags].join(" ")}`,
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
  const typesByTitle = new Map<string, string[]>();
  for (const id of new Set(
    entities.flatMap(({ entityTypeIds }) => entityTypeIds),
  )) {
    const title = typeTitles.get(id) ?? slugName(id);
    typesByTitle.set(title, [...(typesByTitle.get(title) ?? []), id]);
  }

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

/** No defaults or transforms, as for the entity read. */
export const vHashEntityTypeReadInput = v.strictObject({
  entityTypeIds: identifiers(
    "Entity types to read, each a versioned URL as an entity's entityTypeIds name it, for example from query_hash_entities. Those exact versions are read.",
  ),
  webIds: identifiers(
    "Web ids whose own entity types to list. Most types live in HASH's shared webs, not the user's or their organizations'.",
  ),
});

export type HashEntityTypeReadInput = v.InferOutput<
  typeof vHashEntityTypeReadInput
>;

export const hashEntityTypeReadDescription =
  "List the entity types in the HASH graph that the signed-in user can see: the versions named by entityTypeIds, or else each type's latest version. Filters combine: a type must match every filter given. Returns compact text: each type headed by its title and entityTypeId (a versioned URL), then its description, its properties (inherited ones included), each by the name an entity read shows it by and its title, and its links, each by its title and linkEntityTypeId, with the entity types it may point to (any, when not limited). A type's title or entityTypeId can filter an entity read. The graph returns at most 1,000 types at once; when it stopped there, the text says more may match than shown. A read that failed returns { error }. Read it after query_hash_webs and query_hash_entities, for the entityTypeIds the entities found carry. Pass the entityTypeIds of entities you read; webIds rarely help, since most types live in HASH's shared webs. Without filters it lists the entity types the user can see, up to that limit: a very large read.";

const vHashEntityType = v.object({
  entityTypeId: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  properties: v.array(
    v.object({ baseUrl: v.string(), title: v.optional(v.string()) }),
  ),
  links: v.array(
    v.object({
      linkEntityTypeId: v.string(),
      title: v.optional(v.string()),
      destinationEntityTypeIds: v.optional(v.array(v.string())),
    }),
  ),
});

const vHashEntityTypeReadResult = v.object({
  entityTypes: v.array(vHashEntityType),
  truncated: vTruncated,
});

export type HashEntityTypeReadResult = v.InferOutput<
  typeof vHashEntityTypeReadResult
>;

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

export const vHashWebReadInput = v.strictObject({});

export const hashWebReadDescription =
  "List the signed-in user's own HASH web and the webs of the organizations they belong to. Returns compact text, one line per web: its kind (user or organization), its name and @shortname where it has them, and its webId. A web id can limit an entity or entity type read. A read that failed returns { error }. Read it first, before query_hash_entities and query_hash_entity_types.";

const vHashWebReadResult = v.object({
  webs: v.array(
    v.object({
      webId: v.string(),
      kind: v.picklist(["user", "organization"]),
      shortname: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
  ),
});

export type HashWebReadResult = v.InferOutput<typeof vHashWebReadResult>;

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
