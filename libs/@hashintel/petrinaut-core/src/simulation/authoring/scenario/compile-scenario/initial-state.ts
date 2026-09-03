import { createUserKeyedRecord } from "../../../../validation/record-keys";
import { coerceTokenRecord } from "../../../engine/token-values";
import { TYPE_POLICIES } from "../../../engine/type-policies";
import {
  describeValue,
  interpretPreparedItem,
  staleScenarioItem,
} from "./prepared-items";

import type { HirInterpretBindings } from "../../../../hir/interpret";
import type { Color, Place } from "../../../../types/sdcpn";
import type { InitialMarking, InitialTokenAttributeValue } from "../../../api";
import type { PreparedScenarioItem } from "./prepared-items";

/** A failure attributed to a place id, or `__code__` for the code block. */
export type InitialStateError = { itemId: string; message: string };

export type InitialStateOutcome = {
  marking: InitialMarking;
  errors: InitialStateError[];
};

type MarkingTokenRecord = Record<string, InitialTokenAttributeValue>;

/**
 * Coerces one raw token source through the runtime codec, then converts each
 * attribute to its at-rest form (uuid bigints become canonical lowercase
 * strings) so the compiled marking stays JSON-serializable. Arbitrary uuid
 * inputs (free text, numbers) are normalized deterministically via `toUuid`
 * inside `coerceTokenRecord`.
 */
const compileTokenRecord = (
  source: Record<string, unknown>,
  elements: Color["elements"],
): MarkingTokenRecord => {
  const coerced = coerceTokenRecord(
    source,
    elements,
    "Scenario initial state token",
  );
  const token = createUserKeyedRecord<InitialTokenAttributeValue>();
  for (const element of elements) {
    token[element.name] = TYPE_POLICIES[element.type].encodeAtRest(
      coerced[element.name]!,
    );
  }
  return token;
};

const tokenRecordsFromRows = (
  rows: readonly (number | boolean | string)[][],
  elements: Color["elements"],
): MarkingTokenRecord[] =>
  rows.map((row) => {
    const token = createUserKeyedRecord<unknown>();
    elements.forEach((element, index) => {
      token[element.name] = row[index];
    });
    return compileTokenRecord(token, elements);
  });

const normalizeTokenRecords = (
  tokens: unknown[],
  elements: Color["elements"],
): MarkingTokenRecord[] =>
  tokens.flatMap((rawToken) =>
    typeof rawToken !== "object" || rawToken === null || Array.isArray(rawToken)
      ? []
      : [compileTokenRecord(rawToken as Record<string, unknown>, elements)],
  );

/**
 * Evaluates a code-mode initial state body. The body returns a record keyed by
 * place NAME (not id), with numbers for uncoloured places and token-record
 * arrays for coloured ones.
 */
export const compileCodeModeInitialState = (args: {
  prepared: PreparedScenarioItem;
  bindings: HirInterpretBindings;
  placeByName: ReadonlyMap<string, Place>;
  typeById: ReadonlyMap<string, Color>;
}): InitialStateOutcome => {
  const { bindings, placeByName, prepared, typeById } = args;
  // Keyed by place id, but the key set derives from whatever record the
  // user-authored code block returns: no prototype.
  const marking: InitialMarking = createUserKeyedRecord();
  const errors: InitialStateError[] = [];
  const evaluated = interpretPreparedItem(prepared, bindings);
  if (!evaluated.ok) {
    errors.push({
      itemId: "__code__",
      message: `Initial state code: ${evaluated.message}`,
    });
    return { marking, errors };
  }
  if (typeof evaluated.value !== "object" || Array.isArray(evaluated.value)) {
    errors.push({
      itemId: "__code__",
      message: `Initial state code must return an object, got ${typeof evaluated.value}.`,
    });
    return { marking, errors };
  }
  for (const [placeName, tokens] of Object.entries(evaluated.value)) {
    const place = placeByName.get(placeName);
    if (!place) {
      // The type checker cannot see the keys when the inferred return type
      // collapses to unknown (a ternary whose branches return different
      // records), so the name is checked again here.
      errors.push({
        itemId: "__code__",
        message: `Initial state code returned \`${placeName}\`, which is not a place in this net.`,
      });
      continue;
    }
    if (typeof tokens === "number") {
      marking[place.id] = Math.max(0, Math.round(tokens));
    } else if (Array.isArray(tokens)) {
      const color = place.colorId ? typeById.get(place.colorId) : undefined;
      marking[place.id] = normalizeTokenRecords(tokens, color?.elements ?? []);
    }
  }
  return { marking, errors };
};

/**
 * Evaluates per-place initial state: coloured places carry literal token
 * rows, uncoloured places an expression producing a token count.
 */
export const compilePerPlaceInitialState = (args: {
  content: Record<string, string | (number | boolean | string)[][]>;
  /** Type-checked place expressions, keyed like `content`'s string entries. */
  preparedExpressions: ReadonlyMap<string, PreparedScenarioItem>;
  bindings: HirInterpretBindings;
  placeById: ReadonlyMap<string, Place>;
  typeById: ReadonlyMap<string, Color>;
}): InitialStateOutcome => {
  const { bindings, content, placeById, preparedExpressions, typeById } = args;
  const marking: InitialMarking = createUserKeyedRecord();
  const errors: InitialStateError[] = [];
  for (const [placeId, value] of Object.entries(content)) {
    if (Array.isArray(value)) {
      const place = placeById.get(placeId);
      const color = place?.colorId ? typeById.get(place.colorId) : undefined;
      const hasTokenRows = value.length > 0;

      if (hasTokenRows && !place) {
        errors.push({
          itemId: placeId,
          message: `Initial state for place "${placeId}" uses colored token rows, but the place does not exist.`,
        });
        continue;
      }
      if (hasTokenRows && (!color || color.elements.length === 0)) {
        errors.push({
          itemId: placeId,
          message: `Initial state for place "${placeId}" uses colored token rows, but the place has no color elements.`,
        });
        continue;
      }
      const elementCount = color?.elements.length ?? 0;
      const tooWideRow = value.find((row) => row.length > elementCount);
      if (tooWideRow) {
        errors.push({
          itemId: placeId,
          message: `Initial state for place "${placeId}" has ${tooWideRow.length} values per token, but the color type has ${elementCount} elements.`,
        });
        continue;
      }
      try {
        marking[placeId] = tokenRecordsFromRows(value, color?.elements ?? []);
      } catch (error) {
        // Row coercion throws on an invalid typed value; report it like every
        // other compilation failure.
        errors.push({
          itemId: placeId,
          message:
            error instanceof Error
              ? error.message
              : `Invalid token rows for place "${placeId}".`,
        });
      }
      continue;
    }

    if (value.trim() === "") {
      marking[placeId] = 0;
      continue;
    }
    const evaluated = interpretPreparedItem(
      preparedExpressions.get(placeId) ?? staleScenarioItem,
      bindings,
    );
    if (!evaluated.ok) {
      errors.push({
        itemId: placeId,
        message: `Initial state for place "${placeId}": ${evaluated.message}`,
      });
      continue;
    }
    if (typeof evaluated.value !== "number" || Number.isNaN(evaluated.value)) {
      errors.push({
        itemId: placeId,
        message: `Initial state for place "${placeId}" evaluated to ${describeValue(evaluated.value)}, expected a number.`,
      });
      continue;
    }
    marking[placeId] = Math.max(0, Math.round(evaluated.value));
  }
  return { marking, errors };
};
