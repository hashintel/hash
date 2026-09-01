import {
  getStatusConditionArtifactKey,
  type HirStatusConditionArtifact,
} from "../../hir/instantiate";
import {
  HirInterpretError,
  interpretHir,
  type HirValue,
} from "../../hir/interpret";
import { getOwn } from "../../validation/record-keys";
import { formatUuid } from "../engine/uuid";

import type {
  Color,
  ID,
  Place,
  StatusView,
  TokenAttributeValue,
  TokenRecord,
} from "../../types/sdcpn";
import type { SimulationFrameReader } from "../api";

/**
 * Canonical string encoding of one instance's key tuple: the at-rest string
 * forms of the key element values, joined by a separator no value contains.
 */
export type InstanceKey = string;

export type StatusViewInstanceAssignment = {
  labelId: ID;
  /** Key element values in key order, in at-rest string form (raw display). */
  keyValues: string[];
};

const KEY_SEPARATOR = "\u0000";

export const encodeInstanceKey = (keyValues: readonly string[]): InstanceKey =>
  keyValues.join(KEY_SEPARATOR);

const toKeyString = (value: TokenAttributeValue): string =>
  typeof value === "bigint" ? formatUuid(value) : String(value);

/**
 * Runtime token records carry `uuid` values as bigints; the interpreter's
 * value space (and the at-rest wire form) uses canonical strings.
 */
const toConditionLocals = (token: TokenRecord): Record<string, HirValue> => {
  const locals: Record<string, HirValue> = {};
  for (const [attributeName, attributeValue] of Object.entries(token)) {
    locals[attributeName] =
      typeof attributeValue === "bigint"
        ? formatUuid(attributeValue)
        : attributeValue;
  }
  return locals;
};

type LabelPlaceBinding = {
  place: Place;
  /** Names of the place colour's key elements, in element order. */
  keyElementNames: string[];
};

type LabelBinding = {
  labelId: ID;
  conditionFn: HirStatusConditionArtifact["fn"] | null;
  places: LabelPlaceBinding[];
};

const EMPTY_BINDINGS = { parameters: {}, scenario: {} } as const;

/**
 * Binds a status view to a frame source: per frame, produces the current
 * label of every tracked instance whose token sits in one of the view's
 * places.
 *
 * `places` and `types` must come from the definition the frames execute —
 * the flattened net for simulation (where a componentInstance's copies carry
 * scoped `instanceId::placeId` ids, matching the view's place references) or
 * the recording's definition for actual mode.
 *
 * Labels apply in array order and the first match wins per instance. A label
 * with a token condition matches only tokens for which the condition holds;
 * a condition referencing an attribute the token does not carry simply does
 * not match (cross-colour views merge attributes by name at compile time).
 * The exit label is not assigned here — it needs cross-frame history, which
 * `createStatusViewTracker` owns.
 */
export function createStatusViewFrameEvaluator(args: {
  statusView: StatusView;
  places: readonly Place[];
  types: readonly Color[];
  /** Compiled label conditions, from `HirArtifacts.statusConditions`. */
  statusConditions?: Record<string, HirStatusConditionArtifact>;
}): (
  frame: SimulationFrameReader,
) => Map<InstanceKey, StatusViewInstanceAssignment> {
  const { statusView, places, types, statusConditions = {} } = args;
  const placeById = new Map(places.map((place) => [place.id, place]));
  const colorById = new Map(types.map((color) => [color.id, color]));

  const labelBindings: LabelBinding[] = statusView.labels.map((label) => {
    const placeBindings: LabelPlaceBinding[] = [];
    for (const placeId of label.places) {
      const place = placeById.get(placeId);
      const color = place?.colorId ? colorById.get(place.colorId) : undefined;
      if (!place || !color) {
        continue;
      }
      const keyElementNames = color.elements
        .filter((element) => element.identityRef === statusView.identityRef)
        .map((element) => element.name);
      if (keyElementNames.length === 0) {
        // The place's colour carries no key for this identity, so its tokens
        // name no instance.
        continue;
      }
      placeBindings.push({ place, keyElementNames });
    }
    return {
      labelId: label.id,
      conditionFn:
        getOwn(
          statusConditions,
          getStatusConditionArtifactKey(statusView.id, label.id),
        )?.fn ?? null,
      places: placeBindings,
    };
  });

  return (frame) => {
    const assignments = new Map<InstanceKey, StatusViewInstanceAssignment>();

    for (const labelBinding of labelBindings) {
      for (const { place, keyElementNames } of labelBinding.places) {
        for (const token of frame.getPlaceTokens(place)) {
          const rawKeyValues = keyElementNames.map((elementName) =>
            getOwn(token, elementName),
          );
          if (rawKeyValues.some((value) => value === undefined)) {
            continue;
          }
          const keyValues = rawKeyValues.map((value) =>
            toKeyString(value as TokenAttributeValue),
          );
          const key = encodeInstanceKey(keyValues);
          if (assignments.has(key)) {
            continue;
          }

          if (labelBinding.conditionFn) {
            let holds: HirValue;
            try {
              holds = interpretHir(
                labelBinding.conditionFn,
                EMPTY_BINDINGS,
                new Map([["token", toConditionLocals(token) as HirValue]]),
              );
            } catch (error) {
              if (error instanceof HirInterpretError) {
                continue;
              }
              throw error;
            }
            if (holds !== true) {
              continue;
            }
          }

          assignments.set(key, { labelId: labelBinding.labelId, keyValues });
        }
      }
    }

    return assignments;
  };
}
