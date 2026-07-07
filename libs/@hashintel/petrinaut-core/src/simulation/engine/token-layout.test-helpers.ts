/**
 * Test helpers for building engine frames from readable token
 * record fixtures. Not shipped — only imported from `*.test.ts` files.
 */
import {
  createEngineFrame,
  createEngineFrameLayout,
  readEngineFrame,
  type EngineFrame,
  type EngineFrameLayout,
  type EngineFrameSnapshot,
} from "../frames/internal-frame";
import {
  computeTokenSlotLayout,
  createTokenRegionViews,
  encodeTokenToBytes,
  readTokenRecord,
  type TokenSlotLayout,
} from "./token-layout";

import type { Color, ID, TokenRecord, Transition } from "../../types/sdcpn";
import type { SimulationTransitionState } from "../frames/transition-state";

export type ColorElement = Color["elements"][number];

/** Shorthand for `real` elements with the given names. */
export const realElements = (...names: string[]): ColorElement[] =>
  names.map((name) => ({ elementId: name, name, type: "real" as const }));

/**
 * One place's fixture: either a coloured place with token records, or an
 * uncoloured place with only a count.
 */
export type TestPlaceSpec =
  | {
      elements: readonly ColorElement[];
      tokens: readonly Record<string, unknown>[];
    }
  | { elements?: undefined; count: number };

export type TestFrame = EngineFrame & { layout: EngineFrameLayout };

/** Packs token records into a contiguous byte region for one colour. */
export function buildTokenBytes(
  layout: TokenSlotLayout,
  tokens: readonly Record<string, unknown>[],
): Uint8Array {
  const bytes = new Uint8Array(tokens.length * layout.strideBytes);
  for (const [tokenIndex, token] of tokens.entries()) {
    bytes.set(
      encodeTokenToBytes(layout, token, "Test token"),
      tokenIndex * layout.strideBytes,
    );
  }
  return bytes;
}

/** Decodes one packed token byte block back into a record. */
export function decodeTokenBlock(
  elements: readonly ColorElement[],
  block: Uint8Array,
): TokenRecord {
  const layout = computeTokenSlotLayout(elements);
  const { f64, u8 } = createTokenRegionViews(
    block.buffer,
    block.byteOffset,
    block.byteLength,
  );
  return readTokenRecord(layout, f64, u8, 0);
}

/** Decodes all of one place's tokens from a frame. */
export function decodePlaceTokens(
  layout: EngineFrameLayout,
  frame: EngineFrame,
  placeId: ID,
): TokenRecord[] {
  const view = readEngineFrame(layout, frame);
  const placeState = view.getPlaceState(placeId);
  const placeIndex = layout.placeIndexById.get(placeId);
  const tokenLayout =
    placeIndex === undefined ? null : layout.placeTokenLayouts[placeIndex];
  if (!placeState || !tokenLayout || tokenLayout.strideBytes === 0) {
    return [];
  }

  const tokens: TokenRecord[] = [];
  for (let tokenIndex = 0; tokenIndex < placeState.count; tokenIndex++) {
    tokens.push(
      readTokenRecord(
        tokenLayout,
        view.tokenF64,
        view.tokenBytes,
        placeState.byteOffset + tokenIndex * placeState.strideBytes,
      ),
    );
  }
  return tokens;
}

const makeStubTransition = (id: ID): Transition => ({
  id,
  name: id,
  inputArcs: [],
  outputArcs: [],
  lambdaType: "stochastic",
  lambdaCode: "return 1.0;",
  transitionKernelCode: "return {};",
  x: 0,
  y: 0,
});

/**
 * Builds an engine frame (and its layout, attached as `.layout`) from
 * readable per-place fixtures. Coloured places get a synthetic colour named
 * `color:<placeId>` carrying the given elements.
 */
export function makeTestFrame({
  places,
  transitions = {},
}: {
  places: Record<ID, TestPlaceSpec>;
  transitions?: Record<ID, SimulationTransitionState>;
}): TestFrame {
  const types: Color[] = [];
  const sdcpnPlaces = Object.entries(places).map(([placeId, spec]) => {
    let colorId: string | null = null;
    if (spec.elements) {
      colorId = `color:${placeId}`;
      types.push({
        id: colorId,
        name: colorId,
        iconSlug: "circle",
        displayColor: "#000000",
        elements: [...spec.elements],
      });
    }
    return {
      id: placeId,
      name: placeId,
      colorId,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    };
  });

  const layout = createEngineFrameLayout({
    places: sdcpnPlaces,
    transitions: Object.keys(transitions).map(makeStubTransition),
    types,
  });

  const snapshotPlaces: EngineFrameSnapshot["places"] = {};
  const placeBytes: Uint8Array[] = [];
  let byteOffset = 0;
  for (const [placeIndex, [placeId, spec]] of Object.entries(
    places,
  ).entries()) {
    const tokenLayout = layout.placeTokenLayouts[placeIndex] ?? null;
    const strideBytes = tokenLayout?.strideBytes ?? 0;
    const count = spec.elements ? spec.tokens.length : spec.count;
    const bytes =
      spec.elements && tokenLayout
        ? buildTokenBytes(tokenLayout, spec.tokens)
        : new Uint8Array(0);

    snapshotPlaces[placeId] = { byteOffset, count, strideBytes };
    placeBytes.push(bytes);
    byteOffset += bytes.byteLength;
  }

  const buffer = new Uint8Array(byteOffset);
  let writeOffset = 0;
  for (const bytes of placeBytes) {
    buffer.set(bytes, writeOffset);
    writeOffset += bytes.byteLength;
  }

  const frame = createEngineFrame(layout, {
    places: snapshotPlaces,
    transitions,
    buffer,
  }) as TestFrame;
  Object.defineProperty(frame, "layout", { value: layout });
  return frame;
}
