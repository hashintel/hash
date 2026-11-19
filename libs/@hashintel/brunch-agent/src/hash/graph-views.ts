/**
 * HASH graph reads as views the model chooses between, by how much it needs to
 * see: a survey of a web, a profile of a set of entities, the details of a few,
 * or every property of many as tables. Each view projects a read's result into
 * plain data, and a standard format writes it: TOON for survey, profile and
 * details, CSV for tabular. A view too large for the model is refused with its
 * counts and how to narrow it, never cut.
 */
import { encode } from "@toon-format/toon";
import Papa from "papaparse";

import { projectEntityDetails } from "./graph-views/details";
import {
  hashEntityDetailsMaxEntities,
  hashGraphViewTools,
  type HashEntityDetailsInput,
  type HashEntityProfileInput,
  type HashEntityTabularInput,
} from "./graph-views/inputs";
import {
  hashEntityProfileListUpTo,
  projectEntityProfile,
} from "./graph-views/profile";
import { estimateTokens } from "./graph-views/size";
import {
  projectEntitySurvey,
  type HashEntitySurveyResult,
} from "./graph-views/survey";
import { projectEntityTabular } from "./graph-views/tabular";

import type { HashEntityReadInput, HashEntityReadResult } from "./graph-reads";

export {
  hashEntityDetailsInputSchema,
  hashEntityDetailsMaxEntities,
  hashEntityIdSchema,
  hashEntityProfileInputSchema,
  hashEntitySurveyInputSchema,
  hashEntityTabularInputSchema,
  hashGraphViewTools,
  hashWebIdSchema,
  parseHashEntityDetailsInput,
  parseHashEntityProfileInput,
  parseHashEntitySurveyInput,
  parseHashEntityTabularInput,
  type HashEntityDetailsInput,
  type HashEntityId,
  type HashEntityProfileInput,
  type HashEntitySurveyInput,
  type HashEntityTabularInput,
} from "./graph-views/inputs";
export { hashEntityProfileListUpTo } from "./graph-views/profile";
export {
  hashEntitySurveyResultSchema,
  type HashEntitySurveyResult,
} from "./graph-views/survey";

/**
 * The most one view may cost the model, in estimated tokens. Provisional until
 * evaluation sets it: it lets through the 120 purchase orders as rows, and
 * refuses the 520 sales orders.
 */
export const hashGraphViewMaxTokens = 20_000;

export type HashGraphView = {
  text: string;
  /** Too large to return: the text says how large and how to narrow the read. */
  refused: boolean;
};

const bounded = (
  text: string,
  refusal: (tokens: number) => string,
): HashGraphView => {
  const tokens = estimateTokens(text);
  return tokens <= hashGraphViewMaxTokens
    ? { text, refused: false }
    : {
        text: `refused: ${refusal(tokens)} Nothing of this read was returned.`,
        refused: true,
      };
};

const tooLarge = (tokens: number) =>
  `This read would be about ${tokens.toLocaleString("en-US")} tokens, over the ${hashGraphViewMaxTokens.toLocaleString("en-US")} one read may return.`;

const commentLine = (key: string, value: unknown) =>
  `# ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`.replace(
    /\n/gu,
    " ",
  );

/** The page read each view runs, so a view adds no query of its own. */
export const hashEntityReadInputFor = {
  profile: ({
    traversalDepth,
    ...filter
  }: HashEntityProfileInput): HashEntityReadInput => ({
    ...filter,
    traversalDepth: traversalDepth ?? 1,
  }),
  details: ({
    entityIds,
    fullValuesFor,
    includeDrafts,
  }: HashEntityDetailsInput): HashEntityReadInput => ({
    entityIds,
    ...(fullValuesFor === undefined ? {} : { fullValuesFor }),
    ...(includeDrafts === undefined ? {} : { includeDrafts }),
    traversalDepth: 1,
  }),
  tabular: ({
    properties: _properties,
    links,
    ...filter
  }: HashEntityTabularInput): HashEntityReadInput => ({
    ...filter,
    traversalDepth: links === false ? 0 : 1,
  }),
};

export const renderHashEntitySurvey = (result: HashEntitySurveyResult) => {
  const survey = projectEntitySurvey(result);
  return bounded(
    encode(survey),
    (tokens) =>
      `${tooLarge(tokens)} The web holds ${survey.types.length} kinds of entity and ${survey.links.length} kinds of link; survey fewer webs at a time.`,
  );
};

export const renderHashEntityProfile = (
  result: HashEntityReadResult,
  input: HashEntityProfileInput,
) => {
  const profile = projectEntityProfile(result, input);
  return bounded(
    encode(profile),
    (tokens) =>
      `${tooLarge(tokens)} It matched ${profile.read.matched} entities and reached ${profile.read.reachedByLinks} by links, in ${profile.kinds.length} kinds. Narrow it: filter by entityTypes or webIds, or set traversalDepth lower.`,
  );
};

export const renderHashEntityDetails = (
  result: HashEntityReadResult,
  input: HashEntityDetailsInput,
) => {
  const details = projectEntityDetails(result, input);
  return bounded(
    encode(details),
    (tokens) =>
      `${tooLarge(tokens)} It holds ${details.entities.length} entities. Name fewer entityIds, choose properties, or leave out fullValuesFor; ${hashGraphViewTools.tabular} shows many entities more compactly.`,
  );
};

export const renderHashEntityTabular = (
  result: HashEntityReadResult,
  input: HashEntityTabularInput,
) => {
  const { read, tables, legend } = projectEntityTabular(result, input);
  const text = [
    ...Object.entries(read).map(([key, value]) => commentLine(key, value)),
    ...Object.entries(legend).flatMap(([group, names]) =>
      Object.entries(names).map(([name, value]) =>
        commentLine(`${group}.${name}`, value),
      ),
    ),
    ...Object.entries(tables).flatMap(([kind, rows]) => [
      `# table ${kind} (${rows.length} rows)`,
      Papa.unparse(rows, { newline: "\n" }),
    ]),
  ].join("\n");
  const shape = Object.entries(tables)
    .map(
      ([kind, rows]) =>
        `${kind} ${rows.length} rows × ${Object.keys(rows[0] ?? {}).length} columns`,
    )
    .join(", ");
  return bounded(
    text,
    (tokens) =>
      `${tooLarge(tokens)} It matched ${read.matched} entities: ${shape}. Narrow it: choose fewer properties, set links to false, or filter by entityTypes or entityIds.`,
  );
};

/** What each view's tool says it does, returns and refuses. */
export const hashGraphViewDescriptions = {
  survey: `Survey the user's HASH webs: which kinds of entity they hold and how many of each, and which kinds link to which, with counts. Lists no entities, so it is small whatever the web's size. Read it first, then choose where to slice in. Returns TOON: read (webs, total entities and links), types (name, title, count), links (name, title, from and to as type names, count, how many carry properties of their own), and a legend mapping each type name to its versioned entityTypeId. Names hold within one read.`,
  profile: `Profile a set of HASH entities: per kind of entity, how many match, what each property's values look like across them, and how they link to other kinds. Filters combine: an entity must match every filter given. Returns TOON: read (counts, notes), kinds (name, title, matched or reachedByLinks count, each property as one of all, bytes, values with counts, from/to, or distinct with examples, plus setOn when only some have it; linksTo and linkedFrom per link type, with each entity's id and label when ${hashEntityProfileListUpTo} or fewer), the entities themselves (id and label) when ${hashEntityProfileListUpTo} or fewer, and a legend of type and property names: each property's title, description (where units are stated) and versioned id, with every version listed when the read matched several. A note says when entities weren't listed and how to get their ids. Use it to decide what to read next, not as the record of values.`,
  details: `Read up to ${hashEntityDetailsMaxEntities} HASH entities in full, by id: each entity's id, label, editionId, type, properties, and per link type the entities it links to and is linked from (id and label, and a link's own properties). Returns TOON with a legend of names. Values over 500 bytes are summarised in <…> unless the entity is in fullValuesFor. Ids that weren't returned are listed: the id may be wrong, or the entity hidden, archived or a draft; that is not evidence it doesn't exist. More than ${hashEntityDetailsMaxEntities} ids is refused: read them as rows with ${hashGraphViewTools.tabular}.`,
  tabular: `Read HASH entities as CSV tables: one table per kind of matched entity, a row per entity with its id, editionId, label and each selected property value in full, and a column per outgoing link type holding the ids linked to, space-separated. Ids in the web most rows belong to are written ~entityUuid, and the header names that web: put its id in front to read or cite one. Linked entities are not rows: read them by those ids. Links that carry properties get a table of their own (id, editionId, from, to, properties). Filters combine: an entity must match every filter given. A commented header gives the read's counts, notes, and a legend of type and property names. A read over about ${hashGraphViewMaxTokens.toLocaleString("en-US")} tokens is refused with its row and column counts, and nothing is returned: choose fewer properties, drop link columns, or filter further. When the graph stops at its 1,000-match limit the header says so: more may match.`,
};
