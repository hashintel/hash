import { walkHir } from "../../hir/hir";
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
import { formatUuid, NIL_UUID } from "../engine/uuid";

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
  /**
   * The place holding the instance's token, as the label references it —
   * scoped (`instanceId::placeId`) for a componentInstance's copies, so
   * consumers can attribute the instance to a node on the canvas.
   */
  placeId: ID;
};

type ColorElement = Color["elements"][number];

/** A token-condition evaluation failure, surfaced instead of swallowed. */
export type StatusConditionEvaluationError = {
  statusViewId: ID;
  labelId: ID;
  message: string;
};

const KEY_SEPARATOR = "\u0000";

export const encodeInstanceKey = (keyValues: readonly string[]): InstanceKey =>
  keyValues.join(KEY_SEPARATOR);

const toKeyString = (value: TokenAttributeValue): string =>
  typeof value === "bigint" ? formatUuid(value) : String(value);

/**
 * Whether a key element value marks the token as untracked: a key that was
 * never set coerces to the type default, and treating the nil uuid or an
 * empty string as an instance key would silently merge every such token
 * into one phantom instance.
 */
const isUnsetKeyValue = (
  element: ColorElement,
  value: TokenAttributeValue,
): boolean =>
  (element.type === "uuid" && value === NIL_UUID) ||
  (element.type === "string" && value === "");

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

/**
 * The token attributes a compiled condition reads (`token.<name>` accesses),
 * plus whether `token` is also used outside such an access — the read set is
 * then an under-approximation and per-place satisfiability cannot be
 * decided statically.
 */
const collectConditionTokenReads = (
  fn: HirStatusConditionArtifact["fn"],
): { attributeNames: Set<string>; tokenEscapes: boolean } => {
  const attributeNames = new Set<string>();
  const accessedTokenRefs = new Set<unknown>();
  walkHir(fn.body, (node) => {
    if (
      node.kind === "fieldAccess" &&
      node.target.kind === "localRef" &&
      node.target.name === "token"
    ) {
      attributeNames.add(node.field);
      accessedTokenRefs.add(node.target);
    }
  });
  let tokenEscapes = false;
  walkHir(fn.body, (node) => {
    if (
      node.kind === "localRef" &&
      node.name === "token" &&
      !accessedTokenRefs.has(node)
    ) {
      tokenEscapes = true;
    }
  });
  return { attributeNames, tokenEscapes };
};

type LabelPlaceBinding = {
  place: Place;
  /** The place colour's key elements for the view's identity, in order. */
  keyElements: ColorElement[];
};

type LabelBinding = {
  labelId: ID;
  conditionFn: HirStatusConditionArtifact["fn"] | null;
  /**
   * True when the condition's read set could not be decided statically
   * (`token` escapes a direct attribute access): an interpretation failure
   * then keeps the documented missing-attribute semantics (no match, no
   * report) instead of being surfaced as an error.
   */
  conditionReadsUndecidable: boolean;
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
 * a condition referencing an attribute the place's colour does not carry
 * does not match tokens in that place (cross-colour views merge attributes
 * by name at compile time). A label whose declared condition has no compiled
 * artifact — not compiled yet, or failed to compile — matches nothing, so a
 * broken condition narrows a label rather than widening it to every token.
 * A token whose key element holds the type default (nil uuid, empty string)
 * is untracked. The exit label is not assigned here — it needs cross-frame
 * history, which `createStatusViewTracker` owns.
 */
export function createStatusViewFrameEvaluator(args: {
  statusView: StatusView;
  places: readonly Place[];
  types: readonly Color[];
  /** Compiled label conditions, from `HirArtifacts.statusConditions`. */
  statusConditions?: Record<string, HirStatusConditionArtifact>;
  /** Called for each token-condition evaluation failure (see the doc). */
  onConditionError?: (error: StatusConditionEvaluationError) => void;
}): (
  frame: SimulationFrameReader,
) => Map<InstanceKey, StatusViewInstanceAssignment> {
  const {
    statusView,
    places,
    types,
    statusConditions = {},
    onConditionError,
  } = args;
  const placeById = new Map(places.map((place) => [place.id, place]));
  const colorById = new Map(types.map((color) => [color.id, color]));

  const labelBindings: LabelBinding[] = statusView.labels.map((label) => {
    const conditionArtifact = getOwn(
      statusConditions,
      getStatusConditionArtifactKey(statusView.id, label.id),
    );
    const declaresCondition = (label.tokenCondition ?? "").trim() !== "";
    const conditionReads = conditionArtifact
      ? collectConditionTokenReads(conditionArtifact.fn)
      : null;

    const placeBindings: LabelPlaceBinding[] = [];
    // A declared condition without a compiled artifact fails closed: the
    // label binds no places, so it matches nothing until compilation lands.
    if (!declaresCondition || conditionArtifact) {
      for (const placeId of label.places) {
        const place = placeById.get(placeId);
        const color = place?.colorId ? colorById.get(place.colorId) : undefined;
        if (!place || !color) {
          continue;
        }
        const keyElements = color.elements.filter(
          (element) => element.identityRef === statusView.identityRef,
        );
        if (keyElements.length === 0) {
          // The place's colour carries no key for this identity, so its
          // tokens name no instance.
          continue;
        }
        if (conditionReads && !conditionReads.tokenEscapes) {
          const elementNames = new Set(
            color.elements.map((element) => element.name),
          );
          const readsSatisfiable = [...conditionReads.attributeNames].every(
            (attributeName) => elementNames.has(attributeName),
          );
          if (!readsSatisfiable) {
            // The condition reads an attribute this colour does not carry:
            // its tokens never match this label.
            continue;
          }
        }
        placeBindings.push({ place, keyElements });
      }
    }
    return {
      labelId: label.id,
      conditionFn: conditionArtifact?.fn ?? null,
      conditionReadsUndecidable: conditionReads?.tokenEscapes ?? false,
      places: placeBindings,
    };
  });

  // Reused across tokens: `interpretHir` reads the locals map, never
  // mutates or retains it.
  const conditionLocals = new Map<string, HirValue>();

  return (frame) => {
    const assignments = new Map<InstanceKey, StatusViewInstanceAssignment>();
    // A place can be listed by several labels; decode its tokens once.
    const tokensByPlaceId = new Map<ID, readonly TokenRecord[]>();
    const getPlaceTokens = (place: Place): readonly TokenRecord[] => {
      let tokens = tokensByPlaceId.get(place.id);
      if (!tokens) {
        tokens = frame.getPlaceTokens(place);
        tokensByPlaceId.set(place.id, tokens);
      }
      return tokens;
    };

    for (const labelBinding of labelBindings) {
      for (const { place, keyElements } of labelBinding.places) {
        for (const token of getPlaceTokens(place)) {
          let keyValues: string[] | null = [];
          for (const element of keyElements) {
            const value = getOwn(token, element.name);
            if (value === undefined || isUnsetKeyValue(element, value)) {
              keyValues = null;
              break;
            }
            keyValues.push(toKeyString(value));
          }
          if (keyValues === null) {
            continue;
          }
          const key = encodeInstanceKey(keyValues);
          if (assignments.has(key)) {
            continue;
          }

          if (labelBinding.conditionFn) {
            let holds: HirValue;
            try {
              conditionLocals.set(
                "token",
                toConditionLocals(token) as HirValue,
              );
              holds = interpretHir(
                labelBinding.conditionFn,
                EMPTY_BINDINGS,
                conditionLocals,
              );
            } catch (error) {
              if (error instanceof HirInterpretError) {
                if (!labelBinding.conditionReadsUndecidable) {
                  onConditionError?.({
                    statusViewId: statusView.id,
                    labelId: labelBinding.labelId,
                    message: error.message,
                  });
                }
                continue;
              }
              throw error;
            }
            if (holds !== true) {
              continue;
            }
          }

          assignments.set(key, {
            labelId: labelBinding.labelId,
            keyValues,
            placeId: place.id,
          });
        }
      }
    }

    return assignments;
  };
}
