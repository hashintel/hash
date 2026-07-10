import {
  computeTokenSlotLayout,
  createTokenRegionViews,
  type TokenRegionViews,
  type TokenSlotLayout,
} from "../engine/token-layout";

import type { ID, SDCPN } from "../../types/sdcpn";
import type { SimulationTransitionState } from "./transition-state";

/**
 * Internal place layout within an engine frame.
 *
 * `byteOffset` is the place's offset within the frame's token byte region and
 * `strideBytes` is the packed-struct size of one token of the place's colour
 * (0 for uncoloured places).
 */
export type EngineFramePlaceState = {
  byteOffset: number;
  count: number;
  strideBytes: number;
};

export type EngineFrameSnapshot = {
  places: Record<ID, EngineFramePlaceState>;
  transitions: Record<ID, SimulationTransitionState>;
  /** Token region bytes (packed-struct token layout). */
  buffer: Uint8Array;
};

export type EngineFrameLayout = {
  placeIds: readonly ID[];
  placeIndexById: ReadonlyMap<ID, number>;
  /** Per-place token stride in bytes (0 for uncoloured places). */
  placeStrideBytes: Uint32Array;
  /** Per-place packed token layout (null for uncoloured places). */
  placeTokenLayouts: (TokenSlotLayout | null)[];
  transitionIds: readonly ID[];
  transitionIndexById: ReadonlyMap<ID, number>;
};

/**
 * Internal frame storage layout used by the stepping engine and worker payload.
 *
 * This is intentionally only an `ArrayBuffer`. The SDCPN-specific layout is
 * kept outside each frame and must be supplied to read or write the buffer.
 * Public callers should read engine output through `SimulationFrameReader`.
 */
export type EngineFrame = ArrayBuffer;

type EngineFrameHeader = {
  placeCount: number;
  transitionCount: number;
  tokenByteLength: number;
  placeCountsOffset: number;
  placeValueOffsetsOffset: number;
  transitionElapsedOffset: number;
  transitionFiringCountsOffset: number;
  transitionFiredFlagsOffset: number;
  tokenValuesOffset: number;
  byteLength: number;
};

export type EngineFrameView = {
  /** The whole token byte region. */
  tokenBytes: Uint8Array;
  /** Shared f64/u64/u8 views over the whole token region (region offset/length are 8-aligned). */
  tokenViews: TokenRegionViews;
  getPlaceState(placeId: ID): EngineFramePlaceState | null;
  getPlaceEntries(): [ID, EngineFramePlaceState][];
  getTransitionState(transitionId: ID): SimulationTransitionState | null;
  getTransitionEntries(): [ID, SimulationTransitionState][];
  toSnapshot(): EngineFrameSnapshot;
};

const FRAME_MAGIC = 0x5046524d; // "PFRM"
const FRAME_VERSION = 2;
const HEADER_BYTES = 64;

const enum HeaderOffset {
  Magic = 0,
  Version = 4,
  HeaderBytes = 6,
  PlaceCount = 8,
  TransitionCount = 12,
  TokenByteLength = 16,
  PlaceCountsOffset = 20,
  PlaceValueOffsetsOffset = 24,
  TransitionElapsedOffset = 28,
  TransitionFiringCountsOffset = 32,
  TransitionFiredFlagsOffset = 36,
  TokenValuesOffset = 40,
  ByteLength = 44,
}

const alignTo = (value: number, alignment: number): number =>
  Math.ceil(value / alignment) * alignment;

function getPlaceTokenLayout(
  sdcpn: Pick<SDCPN, "types">,
  place: Pick<SDCPN["places"][number], "id" | "colorId">,
): TokenSlotLayout | null {
  if (!place.colorId) {
    return null;
  }

  const color = sdcpn.types.find((type) => type.id === place.colorId);
  if (!color) {
    throw new Error(
      `Type with ID ${place.colorId} referenced by place ${place.id} does not exist in SDCPN`,
    );
  }

  return computeTokenSlotLayout(color.elements);
}

export function createEngineFrameLayout(
  sdcpn: Pick<SDCPN, "places" | "transitions" | "types">,
): EngineFrameLayout {
  const placeIds = sdcpn.places.map((place) => place.id);
  const placeIndexById = new Map<ID, number>();
  const placeStrideBytes = new Uint32Array(placeIds.length);
  const placeTokenLayouts: (TokenSlotLayout | null)[] = [];

  for (let index = 0; index < sdcpn.places.length; index++) {
    const place = sdcpn.places[index]!;
    if (place.id === "__proto__") {
      throw new Error("Cannot add place with id '__proto__'");
    }
    if (placeIndexById.has(place.id)) {
      throw new Error(`Duplicate place id in SDCPN: ${place.id}`);
    }
    placeIndexById.set(place.id, index);
    const tokenLayout = getPlaceTokenLayout(sdcpn, place);
    placeTokenLayouts.push(tokenLayout);
    placeStrideBytes[index] = tokenLayout?.strideBytes ?? 0;
  }

  const transitionIds = sdcpn.transitions.map((transition) => transition.id);
  const transitionIndexById = new Map<ID, number>();
  for (let index = 0; index < sdcpn.transitions.length; index++) {
    const transition = sdcpn.transitions[index]!;
    if (transition.id === "__proto__") {
      throw new Error("Cannot add transition with id '__proto__'");
    }
    if (transitionIndexById.has(transition.id)) {
      throw new Error(`Duplicate transition id in SDCPN: ${transition.id}`);
    }
    transitionIndexById.set(transition.id, index);
  }

  return {
    placeIds,
    placeIndexById,
    placeStrideBytes,
    placeTokenLayouts,
    transitionIds,
    transitionIndexById,
  };
}

function readHeader(frame: EngineFrame): EngineFrameHeader {
  if (frame.byteLength < HEADER_BYTES) {
    throw new Error("Invalid EngineFrame: frame is shorter than its header");
  }

  const view = new DataView(frame);
  const magic = view.getUint32(HeaderOffset.Magic, true);
  if (magic !== FRAME_MAGIC) {
    throw new Error("Invalid EngineFrame: unexpected frame magic");
  }

  const version = view.getUint16(HeaderOffset.Version, true);
  if (version !== FRAME_VERSION) {
    throw new Error(`Unsupported EngineFrame version: ${version}`);
  }

  const headerBytes = view.getUint16(HeaderOffset.HeaderBytes, true);
  if (headerBytes !== HEADER_BYTES) {
    throw new Error(`Unsupported EngineFrame header size: ${headerBytes}`);
  }

  const byteLength = view.getUint32(HeaderOffset.ByteLength, true);
  if (byteLength !== frame.byteLength) {
    throw new Error("Invalid EngineFrame: byte length mismatch");
  }

  return {
    placeCount: view.getUint32(HeaderOffset.PlaceCount, true),
    transitionCount: view.getUint32(HeaderOffset.TransitionCount, true),
    tokenByteLength: view.getUint32(HeaderOffset.TokenByteLength, true),
    placeCountsOffset: view.getUint32(HeaderOffset.PlaceCountsOffset, true),
    placeValueOffsetsOffset: view.getUint32(
      HeaderOffset.PlaceValueOffsetsOffset,
      true,
    ),
    transitionElapsedOffset: view.getUint32(
      HeaderOffset.TransitionElapsedOffset,
      true,
    ),
    transitionFiringCountsOffset: view.getUint32(
      HeaderOffset.TransitionFiringCountsOffset,
      true,
    ),
    transitionFiredFlagsOffset: view.getUint32(
      HeaderOffset.TransitionFiredFlagsOffset,
      true,
    ),
    tokenValuesOffset: view.getUint32(HeaderOffset.TokenValuesOffset, true),
    byteLength,
  };
}

function assertLayoutMatchesFrame(
  layout: EngineFrameLayout,
  header: EngineFrameHeader,
): void {
  if (layout.placeIds.length !== header.placeCount) {
    throw new Error(
      `EngineFrame place count mismatch: layout has ${layout.placeIds.length}, frame has ${header.placeCount}`,
    );
  }
  if (layout.transitionIds.length !== header.transitionCount) {
    throw new Error(
      `EngineFrame transition count mismatch: layout has ${layout.transitionIds.length}, frame has ${header.transitionCount}`,
    );
  }
}

function writeHeader(buffer: ArrayBuffer, header: EngineFrameHeader): void {
  const view = new DataView(buffer);
  view.setUint32(HeaderOffset.Magic, FRAME_MAGIC, true);
  view.setUint16(HeaderOffset.Version, FRAME_VERSION, true);
  view.setUint16(HeaderOffset.HeaderBytes, HEADER_BYTES, true);
  view.setUint32(HeaderOffset.PlaceCount, header.placeCount, true);
  view.setUint32(HeaderOffset.TransitionCount, header.transitionCount, true);
  view.setUint32(HeaderOffset.TokenByteLength, header.tokenByteLength, true);
  view.setUint32(
    HeaderOffset.PlaceCountsOffset,
    header.placeCountsOffset,
    true,
  );
  view.setUint32(
    HeaderOffset.PlaceValueOffsetsOffset,
    header.placeValueOffsetsOffset,
    true,
  );
  view.setUint32(
    HeaderOffset.TransitionElapsedOffset,
    header.transitionElapsedOffset,
    true,
  );
  view.setUint32(
    HeaderOffset.TransitionFiringCountsOffset,
    header.transitionFiringCountsOffset,
    true,
  );
  view.setUint32(
    HeaderOffset.TransitionFiredFlagsOffset,
    header.transitionFiredFlagsOffset,
    true,
  );
  view.setUint32(
    HeaderOffset.TokenValuesOffset,
    header.tokenValuesOffset,
    true,
  );
  view.setUint32(HeaderOffset.ByteLength, header.byteLength, true);
}

export function createEngineFrame(
  layout: EngineFrameLayout,
  snapshot: EngineFrameSnapshot,
): EngineFrame {
  const placeCount = layout.placeIds.length;
  const transitionCount = layout.transitionIds.length;
  const packedPlaceCounts = new Uint32Array(placeCount);
  const packedPlaceByteOffsets = new Uint32Array(placeCount);

  let tokenByteLength = 0;
  for (let index = 0; index < placeCount; index++) {
    const placeId = layout.placeIds[index]!;
    const strideBytes = layout.placeStrideBytes[index] ?? 0;
    const placeState = snapshot.places[placeId] ?? {
      byteOffset: tokenByteLength,
      count: 0,
      strideBytes,
    };

    if (placeState.strideBytes !== strideBytes) {
      throw new Error(
        `Place ${placeId} has a token stride of ${placeState.strideBytes} bytes in snapshot, expected ${strideBytes}`,
      );
    }

    packedPlaceCounts[index] = placeState.count;
    packedPlaceByteOffsets[index] = tokenByteLength;
    tokenByteLength += placeState.count * strideBytes;
  }

  const placeCountsOffset = HEADER_BYTES;
  const placeValueOffsetsOffset =
    placeCountsOffset + packedPlaceCounts.byteLength;
  const transitionElapsedOffset = alignTo(
    placeValueOffsetsOffset + packedPlaceByteOffsets.byteLength,
    8,
  );
  const transitionFiringCountsOffset =
    transitionElapsedOffset + transitionCount * Float64Array.BYTES_PER_ELEMENT;
  const transitionFiredFlagsOffset =
    transitionFiringCountsOffset +
    transitionCount * Uint32Array.BYTES_PER_ELEMENT;
  const tokenValuesOffset = alignTo(
    transitionFiredFlagsOffset + transitionCount * Uint8Array.BYTES_PER_ELEMENT,
    8,
  );
  const byteLength = tokenValuesOffset + tokenByteLength;

  const frame = new ArrayBuffer(byteLength);
  writeHeader(frame, {
    placeCount,
    transitionCount,
    tokenByteLength,
    placeCountsOffset,
    placeValueOffsetsOffset,
    transitionElapsedOffset,
    transitionFiringCountsOffset,
    transitionFiredFlagsOffset,
    tokenValuesOffset,
    byteLength,
  });

  new Uint32Array(frame, placeCountsOffset, placeCount).set(packedPlaceCounts);
  new Uint32Array(frame, placeValueOffsetsOffset, placeCount).set(
    packedPlaceByteOffsets,
  );

  const transitionElapsed = new Float64Array(
    frame,
    transitionElapsedOffset,
    transitionCount,
  );
  const transitionFiringCounts = new Uint32Array(
    frame,
    transitionFiringCountsOffset,
    transitionCount,
  );
  const transitionFiredFlags = new Uint8Array(
    frame,
    transitionFiredFlagsOffset,
    transitionCount,
  );

  for (let index = 0; index < transitionCount; index++) {
    const transitionId = layout.transitionIds[index]!;
    const transitionState = snapshot.transitions[transitionId] ?? {
      timeSinceLastFiringMs: 0,
      firedInThisFrame: false,
      firingCount: 0,
    };
    transitionElapsed[index] = transitionState.timeSinceLastFiringMs;
    transitionFiringCounts[index] = transitionState.firingCount;
    transitionFiredFlags[index] = transitionState.firedInThisFrame ? 1 : 0;
  }

  const tokenBytes = new Uint8Array(frame, tokenValuesOffset, tokenByteLength);
  for (let index = 0; index < placeCount; index++) {
    const placeId = layout.placeIds[index]!;
    const strideBytes = layout.placeStrideBytes[index] ?? 0;
    const count = packedPlaceCounts[index] ?? 0;
    const targetByteOffset = packedPlaceByteOffsets[index] ?? 0;
    const byteSize = count * strideBytes;
    if (byteSize === 0) {
      continue;
    }

    const sourceState = snapshot.places[placeId]!;
    tokenBytes.set(
      snapshot.buffer.subarray(
        sourceState.byteOffset,
        sourceState.byteOffset + byteSize,
      ),
      targetByteOffset,
    );
  }

  return frame;
}

export function readEngineFrame(
  layout: EngineFrameLayout,
  frame: EngineFrame,
): EngineFrameView {
  const header = readHeader(frame);
  assertLayoutMatchesFrame(layout, header);

  const placeCounts = new Uint32Array(
    frame,
    header.placeCountsOffset,
    header.placeCount,
  );
  const placeValueOffsets = new Uint32Array(
    frame,
    header.placeValueOffsetsOffset,
    header.placeCount,
  );
  const transitionElapsed = new Float64Array(
    frame,
    header.transitionElapsedOffset,
    header.transitionCount,
  );
  const transitionFiringCounts = new Uint32Array(
    frame,
    header.transitionFiringCountsOffset,
    header.transitionCount,
  );
  const transitionFiredFlags = new Uint8Array(
    frame,
    header.transitionFiredFlagsOffset,
    header.transitionCount,
  );
  const tokenViews = createTokenRegionViews(
    frame,
    header.tokenValuesOffset,
    header.tokenByteLength,
  );
  const tokenBytes = tokenViews.u8;

  const getPlaceState = (placeId: ID): EngineFramePlaceState | null => {
    const index = layout.placeIndexById.get(placeId);
    if (index === undefined) {
      return null;
    }

    return {
      byteOffset: placeValueOffsets[index] ?? 0,
      count: placeCounts[index] ?? 0,
      strideBytes: layout.placeStrideBytes[index] ?? 0,
    };
  };

  const getTransitionState = (
    transitionId: ID,
  ): SimulationTransitionState | null => {
    const index = layout.transitionIndexById.get(transitionId);
    if (index === undefined) {
      return null;
    }

    return {
      timeSinceLastFiringMs: transitionElapsed[index] ?? 0,
      firedInThisFrame: (transitionFiredFlags[index] ?? 0) !== 0,
      firingCount: transitionFiringCounts[index] ?? 0,
    };
  };

  const getPlaceEntries = (): [ID, EngineFramePlaceState][] =>
    layout.placeIds.map((placeId) => [placeId, getPlaceState(placeId)!]);

  const getTransitionEntries = (): [ID, SimulationTransitionState][] =>
    layout.transitionIds.map((transitionId) => [
      transitionId,
      getTransitionState(transitionId)!,
    ]);

  return {
    tokenBytes,
    tokenViews,
    getPlaceState,
    getPlaceEntries,
    getTransitionState,
    getTransitionEntries,
    toSnapshot() {
      const places: EngineFrameSnapshot["places"] = {};
      for (const [placeId, placeState] of getPlaceEntries()) {
        places[placeId] = placeState;
      }

      const transitions: EngineFrameSnapshot["transitions"] = {};
      for (const [transitionId, transitionState] of getTransitionEntries()) {
        transitions[transitionId] = transitionState;
      }

      return {
        places,
        transitions,
        buffer: tokenBytes.slice(),
      };
    },
  };
}

export function materializeEngineFrame(
  layout: EngineFrameLayout,
  frame: EngineFrame,
): EngineFrameSnapshot {
  return readEngineFrame(layout, frame).toSnapshot();
}
