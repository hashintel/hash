import {
  binary,
  bool,
  ite,
  num,
  type ReactiveExpr,
  type ReactiveVariable,
  ref,
} from "../reactive-module-graph";
import { attributeName, presentName } from "./shared/names";

import type {
  PetriNetIr,
  PetriNetIrAttribute,
  PetriNetIrToken,
  ResolvedZerothTarget,
} from "../petri-net-ir";
import type { PetriNetIrDiagnostic } from "../sdcpn-to-petri-net-ir";
import type { AttributeValue, TokenBinding } from "./linear-hir";

/**
 * How a coloured place becomes variables: a bounded number of slots, each
 * with a present flag and one variable per attribute the theories can hold.
 * A real or integer attribute is a Real, a boolean a Bool, a closed string
 * a Real holding the index of its value; an open string or a uuid has no
 * variable, and a read of it is refused where it happens.
 *
 * Present slots always form a dense prefix at the start of a step, as the
 * engine's token arrays do, so `input.P[i]` is the i-th present slot.
 */

export type SlotAttribute = {
  name: string;
  sort: "real" | "bool";
  /** What the code reads it as. */
  reads: "number" | "boolean" | "string";
  /** A closed string's values; the variable holds an index into them. */
  codes?: readonly string[];
  /** Dynamics integrate it: a real attribute in the model's terms. */
  integrates: boolean;
};

export type PlaceLayout = {
  place: string;
  colour: string;
  slots: number;
  /** The slots are the place's capacity, which the guards enforce, so no token can overflow. */
  capped: boolean;
  attributes: SlotAttribute[];
  /** Attributes the theories cannot hold, with the reason. */
  refused: Map<string, string>;
};

const slotAttribute = (
  name: string,
  attribute: PetriNetIrAttribute,
): SlotAttribute | string => {
  if (attribute === "real" || attribute === "integer") {
    return {
      name,
      sort: "real",
      reads: "number",
      integrates: attribute === "real",
    };
  }
  if (attribute === "boolean") {
    return { name, sort: "bool", reads: "boolean", integrates: false };
  }
  if (attribute === "uuid") {
    return "a 128-bit id has no sort in the theories";
  }
  if (attribute === "string") {
    return "an open string attribute has no code table; only a closed set of values does";
  }
  return {
    name,
    sort: "real",
    reads: "string",
    codes: attribute.enum,
    integrates: false,
  };
};

/** The layout of every coloured place, keyed by place. */
export const layoutColouredPlaces = (
  ir: PetriNetIr,
  target: ResolvedZerothTarget,
  errors: PetriNetIrDiagnostic[],
): Map<string, PlaceLayout> => {
  const layouts = new Map<string, PlaceLayout>();
  for (const [name, place] of Object.entries(ir.places)) {
    const colourName = place?.colour;
    if (colourName === undefined) {
      continue;
    }
    const colour = ir.colours?.[colourName];
    if (colour === undefined) {
      errors.push({
        code: "unknown-colour",
        message: `the place's colour ${colourName} is not in the document`,
        item: { kind: "place", id: name, name },
      });
      continue;
    }
    const attributes: SlotAttribute[] = [];
    const refused = new Map<string, string>();
    for (const [attribute, type] of Object.entries(colour)) {
      const lowered = slotAttribute(attribute, type);
      if (typeof lowered === "string") {
        refused.set(attribute, lowered);
      } else {
        attributes.push(lowered);
      }
    }
    const slots = place?.capacity ?? target.slots;
    const initial = ir.marking?.[name];
    if (Array.isArray(initial) && initial.length > slots) {
      errors.push({
        code: "marking-exceeds-slots",
        message: `the place starts with ${initial.length} tokens and has ${slots} slots; set a capacity or the zeroth slots flag`,
        item: { kind: "place", id: name, name },
      });
    }
    layouts.set(name, {
      place: name,
      colour: colourName,
      slots,
      capped: place?.capacity !== undefined,
      attributes,
      refused,
    });
  }
  return layouts;
};

/** The variables of a layout, present flags first per slot, in slot order. */
export const layoutVariables = (layout: PlaceLayout): ReactiveVariable[] => {
  const variables: ReactiveVariable[] = [];
  for (let slot = 0; slot < layout.slots; slot++) {
    variables.push({
      name: presentName(layout.place, slot),
      sort: "bool",
      role: "place",
      comment: `${layout.place} slot ${slot} holds a token`,
    });
    for (const attribute of layout.attributes) {
      variables.push({
        name: attributeName(layout.place, slot, attribute.name),
        sort: attribute.sort,
        role: "place",
        ...(attribute.codes === undefined
          ? {}
          : {
              comment: `code: ${attribute.codes.map((code, index) => `${index} ${code}`).join(", ")}`,
            }),
      });
    }
  }
  return variables;
};

/** The initial value of every layout variable, from the marking's token rows. */
export const layoutInitialValues = (
  layout: PlaceLayout,
  rows: PetriNetIrToken[],
): ReactiveExpr[] => {
  const values: ReactiveExpr[] = [];
  for (let slot = 0; slot < layout.slots; slot++) {
    const row = rows[slot];
    values.push(bool(row !== undefined));
    for (const attribute of layout.attributes) {
      const cell = row?.[attribute.name];
      if (attribute.sort === "bool") {
        values.push(bool(cell === true));
      } else if (attribute.codes !== undefined) {
        const code =
          typeof cell === "string" ? attribute.codes.indexOf(cell) : -1;
        values.push(num(Math.max(code, 0)));
      } else {
        values.push(num(typeof cell === "number" ? cell : 0));
      }
    }
  }
  return values;
};

/** The number of present slots, as a sum of indicators over the given present expressions. */
export const countExpr = (
  layout: PlaceLayout,
  present: (slot: number) => ReactiveExpr,
): ReactiveExpr => {
  let total: ReactiveExpr | null = null;
  for (let slot = 0; slot < layout.slots; slot++) {
    const indicator = ite(present(slot), num(1), num(0));
    total = total === null ? indicator : binary("+", total, indicator);
  }
  return total ?? num(0);
};

/** The token in a slot, as the code reads it: each attribute by its variable. */
export const slotToken = (
  layout: PlaceLayout,
  slot: number,
  attributeExpr: (attribute: SlotAttribute) => ReactiveExpr = (attribute) =>
    ref(attributeName(layout.place, slot, attribute.name)),
): TokenBinding => ({
  attribute: (
    name,
  ): AttributeValue | { refused: string; message: string } | undefined => {
    const attribute = layout.attributes.find(
      (candidate) => candidate.name === name,
    );
    if (attribute !== undefined) {
      return {
        expr: attributeExpr(attribute),
        sort: attribute.reads,
        ...(attribute.codes === undefined ? {} : { codes: attribute.codes }),
      };
    }
    const refusal = layout.refused.get(name);
    return refusal === undefined
      ? undefined
      : { refused: "attribute-not-lowerable", message: `${name}: ${refusal}` };
  },
});
