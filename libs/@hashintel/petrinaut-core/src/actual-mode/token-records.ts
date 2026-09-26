import { isUuidString } from "../simulation/engine/uuid";
import { getStatusViewEvaluationScope } from "../status-view-scope";

import type { Color, ColorElementType, SDCPN } from "../types/sdcpn";
import type {
  ActualModeMarking,
  ActualModeTokenRecord,
  ActualModeTokenValues,
  ActualModeTransitionFiring,
} from "./types";

/**
 * The parts of a net definition that decide which token records its places
 * accept. Scoped place ids (`instanceId::placeId`) resolve through
 * `componentInstances` and `subnets`, or directly when `places` already holds
 * the scoped copies.
 */
export type ActualModeDefinition = Pick<
  SDCPN,
  "places" | "types" | "subnets" | "componentInstances"
>;

type PlaceColour =
  | { kind: "uncoloured" }
  | { kind: "coloured"; colour: Color }
  | { kind: "missingColour"; colorId: string };

const atRestValueRules: Record<
  ColorElementType,
  { accepts: (value: unknown) => boolean; expected: string }
> = {
  real: {
    accepts: (value) => typeof value === "number" && Number.isFinite(value),
    expected: "a finite number",
  },
  integer: {
    accepts: (value) => Number.isInteger(value),
    expected: "an integer",
  },
  boolean: {
    accepts: (value) => typeof value === "boolean",
    expected: "a boolean",
  },
  uuid: {
    accepts: (value) => isUuidString(value) && value === value.toLowerCase(),
    expected: "a canonical lowercase UUID string",
  },
  string: {
    accepts: (value) => typeof value === "string",
    expected: "a string",
  },
};

const placeColoursByDefinition = new WeakMap<
  ActualModeDefinition,
  ReadonlyMap<string, PlaceColour>
>();

const getPlaceColours = (
  definition: ActualModeDefinition,
): ReadonlyMap<string, PlaceColour> => {
  const cached = placeColoursByDefinition.get(definition);
  if (cached) {
    return cached;
  }

  const { places, types } = getStatusViewEvaluationScope(definition);
  const colourById = new Map(types.map((colour) => [colour.id, colour]));
  const placeColours = new Map<string, PlaceColour>();
  for (const place of places) {
    if (!place.colorId) {
      placeColours.set(place.id, { kind: "uncoloured" });
      continue;
    }
    const colour = colourById.get(place.colorId);
    placeColours.set(
      place.id,
      colour
        ? { kind: "coloured", colour }
        : { kind: "missingColour", colorId: place.colorId },
    );
  }

  placeColoursByDefinition.set(definition, placeColours);
  return placeColours;
};

/**
 * The colour of `placeId` when it declares elements, so that the place's
 * tokens are records a firing consumes by value; null otherwise, including
 * for a place the net does not define.
 */
export const getElementBearingPlaceColour = (
  definition: ActualModeDefinition,
  placeId: string,
): Color | null => {
  const placeColour = getPlaceColours(definition).get(placeId);
  return placeColour?.kind === "coloured" &&
    placeColour.colour.elements.length > 0
    ? placeColour.colour
    : null;
};

/**
 * The error for a token count held by a place whose colour declares
 * elements. `subject` names the marking, as in "Initial marking".
 */
export const createTokenCountOnColouredPlaceError = (
  subject: string,
  placeId: string,
  count: number,
  colour: Color,
): Error =>
  new Error(
    `${subject} holds a token count of ${count} in place "${placeId}", whose colour "${colour.name}" has elements, so the place needs a token record for each token`,
  );

/**
 * What is wrong with `record` as a token of a place with `placeColour`, as a
 * clause that completes "… token {record} … place "p"", or null when the
 * record carries exactly the colour's elements, each an at-rest value of its
 * element's type.
 */
const describeRecordProblem = (
  record: ActualModeTokenRecord,
  placeColour: Exclude<PlaceColour, { kind: "missingColour" }>,
): string | null => {
  const attributeNames = Object.keys(record);

  if (placeColour.kind === "uncoloured") {
    return attributeNames.length === 0
      ? null
      : `, which carries attribute "${attributeNames[0]}" although the place has no colour`;
  }

  const { colour } = placeColour;
  const elementNames = new Set(colour.elements.map((element) => element.name));

  for (const element of colour.elements) {
    if (!Object.hasOwn(record, element.name)) {
      return `, which lacks element "${element.name}" of colour "${colour.name}"`;
    }
    const rule = atRestValueRules[element.type];
    if (!rule.accepts(record[element.name])) {
      return `, whose element "${element.name}" of colour "${colour.name}" is ${JSON.stringify(record[element.name])}, not ${rule.expected}`;
    }
  }

  const extraName = attributeNames.find((name) => !elementNames.has(name));
  return extraName === undefined
    ? null
    : `, which carries attribute "${extraName}" that colour "${colour.name}" does not declare`;
};

const validateTokenRecords = (
  placeColours: ReadonlyMap<string, PlaceColour>,
  placeId: string,
  records: readonly ActualModeTokenRecord[],
  describeToken: (record: ActualModeTokenRecord) => string,
  subject: string,
): void => {
  const placeColour = placeColours.get(placeId);
  if (!placeColour) {
    throw new Error(
      `${subject} names place "${placeId}", which the net does not define`,
    );
  }
  if (placeColour.kind === "missingColour") {
    throw new Error(
      `${subject} names place "${placeId}", whose colour "${placeColour.colorId}" the net does not define`,
    );
  }

  for (const record of records) {
    const problem = describeRecordProblem(record, placeColour);
    if (problem !== null) {
      throw new Error(`${describeToken(record)}${problem}`);
    }
  }
};

/**
 * Checks every token record in an Actual Mode initial marking against the
 * net: a place with a colour lists records carrying exactly the colour's
 * elements, each an at-rest value of the element's type (`uuid` values are
 * canonical lowercase strings), and an uncoloured place lists only `{}`
 * records. A place whose colour declares elements lists records, not a
 * token count: a firing consumes a coloured token by its element values,
 * which a count does not carry.
 *
 * @throws naming the place, the record and the element or attribute at
 * fault, a token count on a place whose colour declares elements, or a place
 * the net does not define.
 */
export const validateActualModeInitialState = (
  definition: ActualModeDefinition,
  marking: ActualModeMarking,
): void => {
  const placeColours = getPlaceColours(definition);
  for (const [placeId, markingValue] of Object.entries(marking)) {
    validateTokenRecords(
      placeColours,
      placeId,
      Array.isArray(markingValue) ? markingValue : [],
      (record) =>
        `Initial marking holds token ${JSON.stringify(record)} in place "${placeId}"`,
      "Initial marking",
    );
    const recordColour = getElementBearingPlaceColour(definition, placeId);
    if (!Array.isArray(markingValue) && recordColour) {
      throw createTokenCountOnColouredPlaceError(
        "Initial marking",
        placeId,
        markingValue,
        recordColour,
      );
    }
  }
};

/**
 * Checks every token record in a firing's `inputTokens` and `outputTokens`
 * against the net, by the rule `validateActualModeInitialState` applies.
 *
 * @throws naming the transition, the timestamp, the place, the record and
 * the element or attribute at fault, or a place the net does not define.
 */
export const validateActualModeTransitionFiring = (
  definition: ActualModeDefinition,
  firing: ActualModeTransitionFiring,
): void => {
  const placeColours = getPlaceColours(definition);
  const subject = `Transition firing of "${firing.transitionId}" at ${firing.ts}`;
  const validateSide = (
    tokenValues: ActualModeTokenValues,
    verb: "consumes" | "produces",
    preposition: "from" | "in",
  ) => {
    for (const [placeId, records] of Object.entries(tokenValues)) {
      validateTokenRecords(
        placeColours,
        placeId,
        records,
        (record) =>
          `${subject} ${verb} token ${JSON.stringify(record)} ${preposition} place "${placeId}"`,
        subject,
      );
    }
  };

  validateSide(firing.inputTokens, "consumes", "from");
  validateSide(firing.outputTokens, "produces", "in");
};
