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
  hashEntityReadInputSchema,
  hashEntityReadResultSchema,
  hashEntityTypeReadInputSchema,
  hashEntityTypeReadResultSchema,
  hashReadFailureSchema,
  hashWebReadInputSchema,
  hashWebReadResultSchema,
  type HashEntityReadInput,
} from "@hashintel/brunch-agent";

import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/conversation/browser-tool-executor.ts";

/** What the model is shown of a read that failed in HASH's page. */
const hashReadFailureForModel = (output: unknown) => {
  const parsed = v.safeParse(hashReadFailureSchema, output);
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

const jsonBytes = (value: unknown) => byteLength(JSON.stringify(value));

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
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => ({ name: nameOf(key), bytes: jsonBytes(item) }))
      .sort((left, right) => right.bytes - left.bytes);
    const shown = parts
      .slice(0, 8)
      .map(({ name, bytes: partBytes }) =>
        partBytes > valueSummaryThresholdBytes
          ? `${name} ${formatBytes(partBytes)}`
          : name,
      );
    const more =
      parts.length > shown.length
        ? [`${parts.length - shown.length} more keys`]
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

/** The most a part read by path shows in full; a larger part is outlined. */
const pathValueMaxTokens = 8_000;

/**
 * How many tokens `text` costs the model, estimated without a tokenizer: it
 * counts the runs a BPE tokenizer splits text into (a word of up to eight
 * letters with its leading space, up to three digits, up to two other
 * symbols, or a newline). Against OpenAI's o200k it overestimates slightly
 * and never underestimates, the safe side for a bound; a proxy, not a count.
 */
const estimateTokens = (text: string) =>
  text.match(/ ?[A-Za-z]{1,8}|\d{1,3}|[^\sA-Za-z\d]{1,2}|\n/gu)?.length ?? 0;

/** At most this many keys are listed where a path stopped. */
const pathStopKeysShown = 20;

/** What a path names inside an entity's properties, or where it stopped. */
const valueAtPath = (
  properties: Record<string, unknown>,
  path: readonly string[],
  nameOf: PropertyNamer,
): { found: true; value: unknown } | { found: false; note: string } => {
  let here: unknown = properties;
  for (const [index, step] of path.entries()) {
    const within =
      index === 0
        ? "the entity's properties"
        : JSON.stringify(path.slice(0, index));
    const missing = `nothing at ${JSON.stringify(step)} in ${within}`;
    if (Array.isArray(here)) {
      const position = /^\d+$/u.test(step) ? Number(step) : undefined;
      if (position === undefined || position >= here.length)
        return {
          found: false,
          note: `${missing}: it is an array ${here.length === 0 ? "with no items" : `with positions 0 to ${here.length - 1}`}`,
        };
      here = here[position];
    } else if (typeof here === "object" && here !== null) {
      const keys = Object.keys(here);
      // The name the read shows (bare or quoted), else the key as in full JSON.
      const key =
        keys.find(
          (candidate) =>
            nameOf(candidate) === step ||
            nameOf(candidate) === plainOrQuoted(step),
        ) ?? keys.find((candidate) => candidate === step);
      if (key === undefined) {
        const shown = keys.slice(0, pathStopKeysShown).map(nameOf);
        const more =
          keys.length > shown.length
            ? `, ${keys.length - shown.length} more`
            : "";
        return {
          found: false,
          note: `${missing}: ${keys.length === 0 ? "it has no keys" : `its keys are ${shown.join(", ")}${more}`}`,
        };
      }
      here = (here as Record<string, unknown>)[key];
    } else
      return {
        found: false,
        note: `${missing}: there is a ${here === null ? "null" : typeof here}, with nothing inside`,
      };
  }
  return { found: true, value: here };
};

/**
 * One part of a value read by path: in full as JSON when it fits the budget,
 * else outlined one level down, each child shown as a property value is.
 */
const renderPathRead = (
  path: readonly string[],
  value: unknown,
  nameOf: PropertyNamer,
) => {
  const label = `  path ${JSON.stringify(path)}`;
  const json = JSON.stringify(value);
  const tokens = estimateTokens(json);
  if (tokens <= pathValueMaxTokens) return `${label}: ${json}`;
  const about = `about ${tokens.toLocaleString("en-US")} tokens`;
  if (typeof value !== "object" || value === null)
    return `${label} (${about}, too large to show): ${summarise(value, byteLength(json), nameOf)}`;
  const entries = Array.isArray(value)
    ? value.map((child, position) => [String(position), child] as const)
    : Object.entries(value as Record<string, unknown>).map(
        ([key, child]) => [nameOf(key), child] as const,
      );
  const parts: string[] = [];
  let used = 0;
  for (const [name, child] of entries) {
    const part = `${name}: ${renderValue(child, false, nameOf).text}`;
    used += estimateTokens(part);
    if (used > pathValueMaxTokens) break;
    parts.push(part);
  }
  const more =
    entries.length > parts.length
      ? [`${entries.length - parts.length} more not shown`]
      : [];
  return `${label} (${about}, outlined one level down; read a path inside it): ${
    Array.isArray(value) ? "[" : "{"
  }${[...parts, ...more].join(", ")}${Array.isArray(value) ? "]" : "}"}`;
};

/** A one-line description of a property or type, from its title and description. */
const legendLine = (title: string, description: string | undefined) =>
  description === undefined || description === ""
    ? oneLine(title)
    : `${oneLine(title)} — ${cutShort(oneLine(description), legendDescriptionPreviewLength)}`;

/** Issues one read to HASH's page and shows the model what it settled with. */
const runHashRead = async (
  execute: BrowserToolExecutor,
  call: {
    readonly toolName: string;
    readonly input: unknown;
    readonly toolCallId: string;
    readonly signal?: AbortSignal;
  },
  forModel: (output: unknown) => string,
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

export const hashEntityReadDescription = `Read entities from the HASH graph, as the signed-in user: only what they may see is returned, and archived entities are never returned, so an entity that is absent may exist but be hidden from them, archived, or filed under another type title or web. Filters combine: an entity must match every filter given. Returns compact text: first candidate property definitions matched by returned keys, each qualified by propertyTypeId (a versioned URL), with its title and description (units are in the description; cut short when long). Multiple versions are alternatives; this global legend does not determine which definition applies to any entity or value. Key matches alone do not establish property ownership, including within opaque JSON. No unit conversion is inferred. Then each entity type title with its entityTypeId (a versioned URL); then each entity, headed by its types' titles (each with its entityTypeId when two types in the read share that title), its name (cut short when long), and (linked) if it was reached by following links rather than matching the filters, or (draft); then its entityId (\`<webId>~<uuid>\`, with \`~<draftId>\` for a draft), editionId (the exact version read), for a link entity the entityIds it links from and to, and one line per property. A property's short name, here and in nested values, comes from its base URL, unless two properties in the read would share one: then both show by their full base URL, so a name holds within one read only. A large value is summarised as <kind, size: shape>, an object's parts listed largest first with the sizes of the large ones. To see it, read the entity again by entityIds and name it in fullValuesFor: the entity's id shows all its values in full; { entityId, path } shows one part, where path is the property's name as the read shows it, then keys or array positions inside the value, for example ["definition_object", "parameters"]. A part that fits about ${pathValueMaxTokens.toLocaleString("en-US")} tokens is shown in full as JSON; a larger one is outlined one level down, so read a path inside it; a path that leads nowhere says where it stopped and what is there. The graph returns at most ${formattedQueryLimit} matches at once; when it stopped there, the text says more may match than shown, so narrow the filter. A read that failed returns { error }. Read webs with ${brunchTools.hashQueryWebs} first, for the web ids to filter by; then read the types of the entities found with ${brunchTools.hashQueryEntityTypes}, by their entityTypeIds, for the links and other properties a type allows, and follow up on a found entity by its entityId.`;

export const hashEntityReadEmptyNote =
  "No entities matched that the signed-in user can see. One may still exist but be hidden from them, archived, or filed under another type title or web.";

/**
 * What the model is shown of a settled entity read: compact text, with all
 * values of the entities named by id in `fullValuesFor` in full, and each
 * part named by `{ entityId, path }` shown or outlined.
 */
export const hashEntityReadForModel = (
  output: unknown,
  fullValuesFor: HashEntityReadInput["fullValuesFor"] = [],
) => {
  const parsed = v.safeParse(hashEntityReadResultSchema, output);
  if (!parsed.success)
    throw new Error("HASH's page returned an entity read in an unknown shape.");
  const { entities, propertyTypes, entityTypes, truncated } = parsed.output;

  const full = new Set<string>();
  const pathsFor = new Map<string, (readonly string[])[]>();
  for (const entry of fullValuesFor) {
    if (typeof entry === "string") full.add(entry);
    else
      pathsFor.set(entry.entityId, [
        ...(pathsFor.get(entry.entityId) ?? []),
        entry.path,
      ]);
  }
  const readIds = new Set(entities.map(({ entityId }) => entityId));
  const unmatchedFull = [...new Set([...full, ...pathsFor.keys()])].filter(
    (id) => !readIds.has(id),
  );
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
      ...(pathsFor.get(entity.entityId) ?? []).map((path) => {
        const at = valueAtPath(entity.properties, path, nameOf);
        return at.found
          ? renderPathRead(path, at.value, nameOf)
          : `  path ${JSON.stringify(path)}: ${at.note}`;
      }),
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
          `Values over ${formatBytes(valueSummaryThresholdBytes)} are summarised; read the entity again by entityIds, with its id in fullValuesFor to see all its values, or { entityId, path } to see part of one.`,
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

/** The entity read, executed by whatever `execute` reaches HASH through. */
export const createHashEntityReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.hashQueryEntities,
    description: hashEntityReadDescription,
    input: hashEntityReadInputSchema,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.hashQueryEntities,
          input: data,
          toolCallId,
          signal,
        },
        (output) => hashEntityReadForModel(output, data.fullValuesFor),
      ),
  });

export const hashEntityTypeReadDescription = `List the entity types in the HASH graph that the signed-in user can see: the versions named by entityTypeIds, or else each type's latest version. Filters combine: a type must match every filter given. Returns compact text: each type headed by its title and entityTypeId (a versioned URL), then its description (cut short when long), its properties (inherited ones included), each by its short name and its title, and its links, each by its title and linkEntityTypeId, with the entity types it may point to (any, when not limited). A type's title or entityTypeId can filter an entity read. The graph returns at most ${formattedQueryLimit} types at once; when it stopped there, the text says more may match than shown. A read that failed returns { error }. Read it after ${brunchTools.hashQueryWebs} and ${brunchTools.hashQueryEntities}, for the entityTypeIds the entities found carry. Pass the entityTypeIds of entities you read; webIds rarely help, since most types live in HASH's shared webs. Without filters it lists the entity types the user can see, up to that limit: a very large read.`;

const hashEntityTypeReadEmptyNote =
  "No entity types matched that the signed-in user can see.";

/** What the model is shown of a settled entity type read: compact text. */
export const hashEntityTypeReadForModel = (output: unknown) => {
  const parsed = v.safeParse(hashEntityTypeReadResultSchema, output);
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

/** The entity type read, executed by whatever `execute` reaches HASH through. */
export const createHashEntityTypeReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.hashQueryEntityTypes,
    description: hashEntityTypeReadDescription,
    input: hashEntityTypeReadInputSchema,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.hashQueryEntityTypes,
          input: data,
          toolCallId,
          signal,
        },
        hashEntityTypeReadForModel,
      ),
  });

export const hashWebReadDescription = `List the signed-in user's own HASH web and the webs of the organizations they belong to. Returns compact text, one line per web: its kind (user or organization), its name and @shortname where it has them, and its webId. A web id can limit an entity or entity type read. A read that failed returns { error }. Read it first, before ${brunchTools.hashQueryEntities} and ${brunchTools.hashQueryEntityTypes}.`;

/** What the model is shown of a settled web read: one line per web. */
export const hashWebReadForModel = (output: unknown) => {
  const parsed = v.safeParse(hashWebReadResultSchema, output);
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

/** The web read, executed by whatever `execute` reaches HASH through. */
export const createHashWebReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.hashQueryWebs,
    description: hashWebReadDescription,
    input: hashWebReadInputSchema,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.hashQueryWebs,
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
