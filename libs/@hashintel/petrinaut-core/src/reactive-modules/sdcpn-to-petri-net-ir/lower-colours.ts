import { walkHir } from "../../hir/hir";

import type { HirExpr, HirFunction } from "../../hir/hir";
import type { Color, SDCPN } from "../../types/sdcpn";
import type { PetriNetIrAttribute, PetriNetIrColour } from "../petri-net-ir";

/**
 * Lowers the colours a net's places use, closing each string attribute to
 * the set of values the net can put in it. A value reaches an attribute from
 * a marking cell, from a string literal a kernel writes or a guard compares
 * it with, or by copy from another attribute; the sets are the least fixed
 * point over those copies. An attribute some kernel writes from anything
 * else stays an open `string`.
 */

/** `<colourId>.<attribute>`. */
type AttributeKey = string;

const keyOf = (colourId: string, attribute: string): AttributeKey =>
  `${colourId}.${attribute}`;

export type StringEvidence = {
  literals: Map<AttributeKey, Set<string>>;
  copies: Map<AttributeKey, Set<AttributeKey>>;
  open: Set<AttributeKey>;
};

export const createStringEvidence = (): StringEvidence => ({
  literals: new Map(),
  copies: new Map(),
  open: new Set(),
});

const addTo = <T>(
  map: Map<AttributeKey, Set<T>>,
  key: AttributeKey,
  value: T,
) => {
  const set = map.get(key) ?? new Set<T>();
  set.add(value);
  map.set(key, set);
};

export const addMarkingLiteral = (
  evidence: StringEvidence,
  colourId: string,
  attribute: string,
  value: string,
): void => addTo(evidence.literals, keyOf(colourId, attribute), value);

type CodeContext = {
  /** The function's input object, `input` or `tokens`. */
  inputName: string | undefined;
  /** The colour of each place the code can read, by display name. */
  placeColours: ReadonlyMap<string, string>;
  /** The colour of the tokens a dynamics function maps over. */
  ownColour?: string;
  /** Local names bound to a token or an array of tokens, by colour. */
  locals: Map<string, string>;
};

/** The colour of the token or token array `expr` denotes, when it denotes one. */
const tokenColour = (
  expr: HirExpr,
  context: CodeContext,
): string | undefined => {
  switch (expr.kind) {
    case "localRef":
      return context.locals.get(expr.name);
    case "indexAccess":
      return tokenColour(expr.target, context);
    case "fieldAccess":
      return expr.target.kind === "localRef" &&
        expr.target.name === context.inputName
        ? context.placeColours.get(expr.field)
        : undefined;
    default:
      return undefined;
  }
};

/** Binds the locals a function introduces to the colours of the tokens they hold. */
const bindLocals = (fn: HirFunction, context: CodeContext): void => {
  if (context.ownColour !== undefined && context.inputName !== undefined) {
    context.locals.set(context.inputName, context.ownColour);
  }
  walkHir(fn.body, (node) => {
    if (node.kind === "let") {
      for (const binding of node.bindings) {
        const colour = tokenColour(binding.value, context);
        if (colour !== undefined) {
          context.locals.set(binding.name, colour);
        }
      }
    }
    if (node.kind === "arrayMap") {
      const colour = tokenColour(node.target, context);
      if (colour !== undefined) {
        context.locals.set(node.param.name, colour);
      }
    }
  });
};

const attributeRead = (
  expr: HirExpr,
  context: CodeContext,
): AttributeKey | undefined => {
  if (expr.kind !== "fieldAccess") {
    return undefined;
  }
  const colour = tokenColour(expr.target, context);
  return colour === undefined ? undefined : keyOf(colour, expr.field);
};

/** String literals a guard or rate compares an attribute with. */
export const addGuardEvidence = (
  evidence: StringEvidence,
  fn: HirFunction,
  placeColours: ReadonlyMap<string, string>,
): void => {
  const context: CodeContext = {
    inputName: fn.params[0]?.name,
    placeColours,
    locals: new Map(),
  };
  bindLocals(fn, context);
  walkHir(fn.body, (node) => {
    if (node.kind !== "binary" || (node.op !== "==" && node.op !== "!=")) {
      return;
    }
    for (const [side, other] of [
      [node.left, node.right],
      [node.right, node.left],
    ] as const) {
      const key = attributeRead(side, context);
      if (key !== undefined && other.kind === "stringLit") {
        addTo(evidence.literals, key, other.value);
      }
    }
  });
};

/** What a kernel writes into each string attribute of the tokens it produces. */
const addTokenWrite = (
  evidence: StringEvidence,
  colourId: string,
  colour: Color,
  token: HirExpr,
  context: CodeContext,
): void => {
  const stringAttributes = colour.elements.filter(
    (element) => element.type === "string",
  );
  if (token.kind !== "recordLit") {
    const source = tokenColour(token, context);
    for (const element of stringAttributes) {
      const key = keyOf(colourId, element.name);
      if (source === undefined) {
        evidence.open.add(key);
      } else {
        addTo(evidence.copies, key, keyOf(source, element.name));
      }
    }
    return;
  }
  for (const element of stringAttributes) {
    const key = keyOf(colourId, element.name);
    const entry = token.entries.find(
      (candidate) => candidate.key === element.name,
    );
    if (entry === undefined) {
      continue;
    }
    if (entry.value.kind === "stringLit") {
      addTo(evidence.literals, key, entry.value.value);
      continue;
    }
    const source = attributeRead(entry.value, context);
    if (source === undefined) {
      evidence.open.add(key);
    } else {
      addTo(evidence.copies, key, source);
    }
  }
};

const resultRecords = (expr: HirExpr): HirExpr[] => {
  switch (expr.kind) {
    case "let":
      return resultRecords(expr.body);
    case "cond":
      return [
        ...resultRecords(expr.thenBranch),
        ...resultRecords(expr.elseBranch),
      ];
    default:
      return [expr];
  }
};

export const addKernelEvidence = (
  evidence: StringEvidence,
  fn: HirFunction,
  placeColours: ReadonlyMap<string, string>,
  coloursById: ReadonlyMap<string, Color>,
): void => {
  const context: CodeContext = {
    inputName: fn.params[0]?.name,
    placeColours,
    locals: new Map(),
  };
  bindLocals(fn, context);
  for (const record of resultRecords(fn.body)) {
    if (record.kind !== "recordLit") {
      continue;
    }
    for (const entry of record.entries) {
      const colourId = placeColours.get(entry.key);
      const colour =
        colourId === undefined ? undefined : coloursById.get(colourId);
      if (colourId === undefined || colour === undefined) {
        continue;
      }
      if (entry.value.kind === "arrayLit") {
        for (const token of entry.value.elements) {
          addTokenWrite(evidence, colourId, colour, token, context);
        }
      } else if (entry.value.kind === "arrayMap") {
        addTokenWrite(evidence, colourId, colour, entry.value.body, context);
      } else {
        addTokenWrite(evidence, colourId, colour, entry.value, context);
      }
    }
  }
};

/** The closed value sets, once copies have propagated; `null` for an open attribute. */
const closeStrings = (
  evidence: StringEvidence,
): Map<AttributeKey, Set<string> | null> => {
  const values = new Map<AttributeKey, Set<string> | null>();
  const keys = new Set([
    ...evidence.literals.keys(),
    ...evidence.copies.keys(),
    ...evidence.open,
  ]);
  for (const key of keys) {
    values.set(
      key,
      evidence.open.has(key) ? null : new Set(evidence.literals.get(key)),
    );
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, sources] of evidence.copies) {
      const current = values.get(key);
      if (current === null || current === undefined) {
        continue;
      }
      for (const source of sources) {
        const from = values.get(source);
        if (from === null) {
          values.set(key, null);
          changed = true;
          break;
        }
        for (const value of from ?? []) {
          if (!current.has(value)) {
            current.add(value);
            changed = true;
          }
        }
      }
    }
  }
  return values;
};

const attributeType = (
  colourId: string,
  element: Color["elements"][number],
  closed: ReadonlyMap<AttributeKey, Set<string> | null>,
): PetriNetIrAttribute => {
  if (element.type !== "string") {
    return element.type;
  }
  const values = closed.get(keyOf(colourId, element.name));
  return values === null || values === undefined || values.size === 0
    ? "string"
    : { enum: [...values] };
};

/** The colours the given places use, keyed by IR name, with their attributes typed. */
export const lowerColours = (
  sdcpn: SDCPN,
  usedColourIds: ReadonlySet<string>,
  colourNames: ReadonlyMap<string, string>,
  evidence: StringEvidence,
): Record<string, PetriNetIrColour> => {
  const closed = closeStrings(evidence);
  const colours: Record<string, PetriNetIrColour> = {};
  for (const colour of sdcpn.types) {
    const name = colourNames.get(colour.id);
    if (name === undefined || !usedColourIds.has(colour.id)) {
      continue;
    }
    colours[name] = Object.fromEntries(
      colour.elements.map((element) => [
        element.name,
        attributeType(colour.id, element, closed),
      ]),
    );
  }
  return colours;
};
