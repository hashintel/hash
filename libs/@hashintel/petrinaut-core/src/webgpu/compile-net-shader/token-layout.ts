import { tokenWordCount } from "../eligibility";
/**
 * How a run's state, and each token within it, is laid out in u32 words.
 *
 * A token's words are its `real` attributes as f32 bit patterns, then its
 * `integer`/`boolean` attributes as u32. Every read and write of an attribute
 * — in the shader and on the host — goes through this module, so a wider
 * attribute type is added here and nowhere else.
 */
import { WgslBailError } from "../emit-wgsl";

import type { InitialMarking } from "../../simulation/api";
import type { SDCPN } from "../../types/sdcpn";
import type { GpuNetProfile, GpuPlaceProfile } from "../eligibility";
import type { WgslEmitter, WgslValue } from "../emit-wgsl";

export type DiscreteType = "integer" | "boolean";

/**
 * Attribute types of each place's discrete (non-`real`) fields, so a lambda
 * reading a boolean gets a WGSL `bool` rather than a 0/1 float. Eligibility
 * has already refused anything wider than 32 bits.
 */
export const discreteTypesByPlaceId = (
  sdcpn: SDCPN,
): Map<string, ReadonlyMap<string, DiscreteType>> => {
  const colorById = new Map(sdcpn.types.map((type) => [type.id, type]));
  const byPlace = new Map<string, ReadonlyMap<string, DiscreteType>>();
  for (const place of sdcpn.places) {
    const color =
      place.colorId === null ? undefined : colorById.get(place.colorId);
    const types = new Map<string, DiscreteType>();
    for (const element of color?.elements ?? []) {
      if (element.type === "integer" || element.type === "boolean") {
        types.set(element.name, element.type);
      }
    }
    byPlace.set(place.id, types);
  }
  return byPlace;
};

/** Word offsets within one run's state: `counts | firings | rng | status | maxes | tokens`. */
export type StateLayout = {
  countsOffset: number;
  firingsOffset: number;
  rngOffset: number;
  statusOffset: number;
  /** Per derived-capacity place, its running maximum count. */
  maxesOffset: number;
  /** Profile indices of derived-capacity typed places, in `maxes` slot order. */
  derivedPlaceIndices: number[];
  /** First word of each place's token slots; equal to the next place's for an uncoloured place. */
  placeTokenOffsets: number[];
  /** Words per token slot, per place; 0 for an uncoloured place. */
  placeTokenStrides: number[];
  stateWordsPerRun: number;
  /**
   * Words of the compact per-run result: one per place count, the status,
   * then each derived place's maximum. `firings` and the RNG word stay
   * device-side.
   */
  summaryWordsPerRun: number;
};

export const planStateLayout = (
  profile: GpuNetProfile,
  transitionCount: number,
): StateLayout => {
  const placeCount = profile.places.length;
  const countsOffset = 0;
  const firingsOffset = countsOffset + placeCount;
  const rngOffset = firingsOffset + transitionCount;
  const statusOffset = rngOffset + 1;
  const derivedPlaceIndices = profile.places.flatMap((place, index) =>
    place.capacitySource === "derived" && place.colored ? [index] : [],
  );
  const maxesOffset = statusOffset + 1;
  const tokensOffset = maxesOffset + derivedPlaceIndices.length;

  let tokenWords = 0;
  const placeTokenOffsets: number[] = [];
  const placeTokenStrides: number[] = [];
  for (const place of profile.places) {
    placeTokenOffsets.push(tokensOffset + tokenWords);
    const stride = tokenWordCount(place);
    placeTokenStrides.push(stride);
    tokenWords += place.capacity * stride;
  }

  return {
    countsOffset,
    firingsOffset,
    rngOffset,
    statusOffset,
    maxesOffset,
    derivedPlaceIndices,
    placeTokenOffsets,
    placeTokenStrides,
    stateWordsPerRun: tokensOffset + tokenWords,
    summaryWordsPerRun: placeCount + 1 + derivedPlaceIndices.length,
  };
};

/** WGSL for the first word of token `indexVar` of place `placeIndex`. */
export const tokenSlotExpr = (
  layout: StateLayout,
  placeIndex: number,
  indexVar: string,
): string =>
  `(base + ${layout.placeTokenOffsets[placeIndex]!}u + ${indexVar} * ${layout.placeTokenStrides[placeIndex]!}u)`;

/** Field name to a WGSL value reading that field of one token. */
export type TokenReader = (fieldName: string) => WgslValue;

/**
 * Builds a reader for one token slot of a place. `slotExpr` is WGSL for the
 * token's first word, so the caller decides which token — a loop variable,
 * or one leg of a pair scan.
 */
export const makeTokenReader = (
  place: GpuPlaceProfile,
  discreteTypes: ReadonlyMap<string, DiscreteType>,
  slotExpr: string,
): TokenReader => {
  return (fieldName) => {
    const realOrdinal = place.realFields.indexOf(fieldName);
    if (realOrdinal !== -1) {
      return {
        kind: "f32",
        code: `bitcast<f32>(state[${slotExpr} + ${realOrdinal}u])`,
      };
    }

    const discreteOrdinal = place.discreteFields.indexOf(fieldName);
    if (discreteOrdinal === -1) {
      throw new WgslBailError(
        `place \`${place.name}\` has no attribute \`${fieldName}\``,
      );
    }
    const word = `state[${slotExpr} + ${place.realFields.length + discreteOrdinal}u]`;
    // A boolean is a WGSL `bool`, so a condition reading one composes without
    // an explicit comparison; the HIR's type checker has established which it is.
    return discreteTypes.get(fieldName) === "boolean"
      ? { kind: "bool", code: `(${word} != 0u)` }
      : { kind: "f32", code: `f32(${word})` };
  };
};

/**
 * The `tokens` argument of a lambda or kernel: a record keyed by input slot
 * name, holding one token per consumed token. A slot with no readers is an
 * empty tuple, which is what an uncoloured place has.
 */
export const tokenSlotsValue = (
  tokenSlots: ReadonlyMap<string, readonly TokenReader[]>,
): WgslValue => ({
  kind: "record",
  fields: new Map(
    [...tokenSlots].map(([slotName, readers]) => [
      slotName,
      {
        kind: "array" as const,
        elements: readers.map((read): WgslValue => ({ kind: "token", read })),
      },
    ]),
  ),
});

/** One attribute write of an output token, as a word relative to its slot. */
export type TokenWordWrite = { wordOffset: number; valueExpr: string };

/**
 * Encodes one produced token's attributes as slot-relative word writes, in
 * the same order `makeTokenReader` reads them.
 */
export const encodeTokenWrites = (
  place: GpuPlaceProfile,
  discreteTypes: ReadonlyMap<string, DiscreteType>,
  fieldValue: (fieldName: string) => WgslValue | undefined,
  emitter: WgslEmitter,
  slotName: string,
): TokenWordWrite[] => {
  const requireField = (field: string): WgslValue => {
    const value = fieldValue(field);
    if (value === undefined) {
      throw new WgslBailError(
        `the kernel does not set \`${field}\` on a token for \`${slotName}\``,
      );
    }
    return value;
  };
  const writes: TokenWordWrite[] = [];
  for (const [ordinal, field] of place.realFields.entries()) {
    writes.push({
      wordOffset: ordinal,
      valueExpr: `bitcast<u32>(${emitter.f32(requireField(field))})`,
    });
  }
  for (const [ordinal, field] of place.discreteFields.entries()) {
    const value = requireField(field);
    writes.push({
      wordOffset: place.realFields.length + ordinal,
      valueExpr:
        discreteTypes.get(field) === "boolean"
          ? `select(0u, 1u, ${emitter.bool(value)})`
          : `u32(${emitter.f32(value)})`,
    });
  }
  return writes;
};

/**
 * Encodes a typed place's initial tokens in its slot layout, one buffer per
 * place: `count × stride` words, empty for an uncoloured place.
 */
export const encodeInitialTokenWords = (
  place: GpuPlaceProfile,
  marking: InitialMarking[string] | undefined,
): Uint32Array => {
  if (!Array.isArray(marking)) {
    return new Uint32Array(0);
  }
  const stride = tokenWordCount(place);
  const words = new Uint32Array(marking.length * stride);
  const floats = new Float32Array(words.buffer);
  for (const [tokenIndex, token] of marking.entries()) {
    const base = tokenIndex * stride;
    for (const [fieldIndex, field] of place.realFields.entries()) {
      floats[base + fieldIndex] = Number(token[field] ?? 0);
    }
    for (const [fieldIndex, field] of place.discreteFields.entries()) {
      const value = token[field];
      words[base + place.realFields.length + fieldIndex] =
        typeof value === "boolean"
          ? value
            ? 1
            : 0
          : Math.round(Number(value ?? 0));
    }
  }
  return words;
};
