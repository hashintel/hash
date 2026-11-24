/**
 * One token through the engine's own codec: the layout of its type, its
 * bytes, and the token read back out of them. Everything here is Petrinaut
 * Core's, so the playground shows what a simulation frame holds.
 */

import {
  computeTokenSlotLayout,
  createTokenRegionViews,
  encodeTokenToBytes,
  readTokenRecord,
  StringPool,
} from "@hashintel/petrinaut-core";

import type {
  ColorElementType,
  TokenRecord,
  TokenSlotLayout,
} from "@hashintel/petrinaut-core";

/** One dimension of the token type the reader declares. */
export interface Dimension {
  name: string;
  type: ColorElementType;
}

export interface EncodedToken {
  layout: TokenSlotLayout;
  bytes: Uint8Array;
  /** The values the reader wrote, before the codec coerced them. */
  input: Record<string, unknown>;
  /** The token read back out of `bytes`, as a simulation reads it. */
  decoded: TokenRecord;
}

/** An encoded token, or why the source or its values could not be encoded. */
export type TokenEncoding = EncodedToken | { error: string };

/** Whether more than one of `dimensions` has `name`. */
export const isNameShared = (
  dimensions: readonly Dimension[],
  name: string,
): boolean =>
  dimensions.filter((dimension) => dimension.name === name).length > 1;

/**
 * Encodes `input` as one token of the type `dimensions` declare. Throws the
 * codec's own message when a value cannot be coerced to its dimension's type,
 * and refuses two dimensions of one name: a token holds one value per name,
 * so the second would be read back in place of the first.
 */
export const encodeToken = (
  dimensions: readonly Dimension[],
  input: Record<string, unknown>,
): EncodedToken => {
  const repeated = dimensions.find(({ name }) =>
    isNameShared(dimensions, name),
  );
  if (repeated !== undefined) {
    throw new Error(
      `Two dimensions are named "${repeated.name}". Give each a name of its own.`,
    );
  }
  const layout = computeTokenSlotLayout(
    dimensions.map((dimension, index) => ({
      elementId: `dimension-${index}`,
      name: dimension.name,
      type: dimension.type,
    })),
  );
  // A run interns every string of every token in one pool. A single token
  // needs only its own, so each encoding starts an empty one.
  const stringPool = new StringPool();
  const bytes = encodeTokenToBytes(layout, input, "token", stringPool);
  const views = createTokenRegionViews(bytes.buffer, 0, bytes.byteLength);
  return {
    layout,
    bytes,
    input,
    decoded: readTokenRecord(layout, views, 0, stringPool),
  };
};

/**
 * The function that evaluates a token source: a JavaScript expression the
 * reader typed, run in the reader's own page.
 */
const compileTokenSource = (source: string): (() => unknown) => {
  try {
    // The line break keeps a trailing `//` comment from swallowing the bracket.
    return new Function(`"use strict"; return (${source}\n);`) as () => unknown;
  } catch {
    // The parser's own message names the bracket above, which the reader
    // never typed, so the playground says it in its own words.
    throw new Error("The token is not valid JavaScript yet.");
  }
};

/** The object a token source evaluates to. */
const evaluateTokenSource = (source: string): Record<string, unknown> => {
  const value = compileTokenSource(source)();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("The token must be an object, such as { amount: 1.25 }");
  }
  return value as Record<string, unknown>;
};

/** Evaluates `source` and encodes the token it describes. */
export const encodeTokenSource = (
  dimensions: readonly Dimension[],
  source: string,
): TokenEncoding => {
  try {
    return encodeToken(dimensions, evaluateTokenSource(source));
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) };
  }
};
