import type { ID, SDCPN } from "../../types/sdcpn";
import type { SimulationTransitionState } from "./transition-state";

/**
 * Internal place layout within an engine frame.
 */
export type EngineFramePlaceState = {
  offset: number;
  count: number;
  dimensions: number;
};

export type EngineFrameSnapshot = {
  places: Record<ID, EngineFramePlaceState>;
  transitions: Record<ID, SimulationTransitionState>;
  buffer: Float64Array;
};

export type EngineFrameLayout = {
  placeIds: readonly ID[];
  placeIndexById: ReadonlyMap<ID, number>;
  placeDimensions: Uint32Array;
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
  tokenValueCount: number;
  placeCountsOffset: number;
  placeValueOffsetsOffset: number;
  transitionElapsedOffset: number;
  transitionFiringCountsOffset: number;
  transitionFiredFlagsOffset: number;
  tokenValuesOffset: number;
  byteLength: number;
};

export type EngineFrameView = {
  tokenValues: Float64Array;
  getPlaceState(placeId: ID): EngineFramePlaceState | null;
  getPlaceEntries(): [ID, EngineFramePlaceState][];
  getPlaceTokenValues(placeId: ID): Float64Array | null;
  getTransitionState(transitionId: ID): SimulationTransitionState | null;
  getTransitionEntries(): [ID, SimulationTransitionState][];
  toSnapshot(): EngineFrameSnapshot;
};

const FRAME_MAGIC = 0x5046524d; // "PFRM"
const FRAME_VERSION = 1;
const HEADER_BYTES = 64;

const enum HeaderOffset {
  Magic = 0,
  Version = 4,
  HeaderBytes = 6,
  PlaceCount = 8,
  TransitionCount = 12,
  TokenValueCount = 16,
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

function getPlaceDimensions(
  sdcpn: Pick<SDCPN, "types">,
  place: Pick<SDCPN["places"][number], "id" | "colorId">,
): number {
  if (!place.colorId) {
    return 0;
  }

  const color = sdcpn.types.find((type) => type.id === place.colorId);
  if (!color) {
    throw new Error(
      `Type with ID ${place.colorId} referenced by place ${place.id} does not exist in SDCPN`,
    );
  }

  return color.elements.length;
}

export function createEngineFrameLayout(
  sdcpn: Pick<SDCPN, "places" | "transitions" | "types">,
): EngineFrameLayout {
  const placeIds = sdcpn.places.map((place) => place.id);
  const placeIndexById = new Map<ID, number>();
  const placeDimensions = new Uint32Array(placeIds.length);

  for (let index = 0; index < sdcpn.places.length; index++) {
    const place = sdcpn.places[index]!;
    if (place.id === "__proto__") {
      throw new Error("Cannot add place with id '__proto__'");
    }
    if (placeIndexById.has(place.id)) {
      throw new Error(`Duplicate place id in SDCPN: ${place.id}`);
    }
    placeIndexById.set(place.id, index);
    placeDimensions[index] = getPlaceDimensions(sdcpn, place);
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
    placeDimensions,
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
    tokenValueCount: view.getUint32(HeaderOffset.TokenValueCount, true),
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
  view.setUint32(HeaderOffset.TokenValueCount, header.tokenValueCount, true);
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
  const packedPlaceOffsets = new Uint32Array(placeCount);

  let tokenValueCount = 0;
  for (let index = 0; index < placeCount; index++) {
    const placeId = layout.placeIds[index]!;
    const dimensions = layout.placeDimensions[index] ?? 0;
    const placeState = snapshot.places[placeId] ?? {
      offset: tokenValueCount,
      count: 0,
      dimensions,
    };

    if (placeState.dimensions !== dimensions) {
      throw new Error(
        `Place ${placeId} has ${placeState.dimensions} dimensions in snapshot, expected ${dimensions}`,
      );
    }

    packedPlaceCounts[index] = placeState.count;
    packedPlaceOffsets[index] = tokenValueCount;
    tokenValueCount += placeState.count * dimensions;
  }

  const placeCountsOffset = HEADER_BYTES;
  const placeValueOffsetsOffset =
    placeCountsOffset + packedPlaceCounts.byteLength;
  const transitionElapsedOffset = alignTo(
    placeValueOffsetsOffset + packedPlaceOffsets.byteLength,
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
  const byteLength =
    tokenValuesOffset + tokenValueCount * Float64Array.BYTES_PER_ELEMENT;

  const frame = new ArrayBuffer(byteLength);
  writeHeader(frame, {
    placeCount,
    transitionCount,
    tokenValueCount,
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
    packedPlaceOffsets,
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

  const tokenValues = new Float64Array(
    frame,
    tokenValuesOffset,
    tokenValueCount,
  );
  for (let index = 0; index < placeCount; index++) {
    const placeId = layout.placeIds[index]!;
    const dimensions = layout.placeDimensions[index] ?? 0;
    const count = packedPlaceCounts[index] ?? 0;
    const targetOffset = packedPlaceOffsets[index] ?? 0;
    const size = count * dimensions;
    if (size === 0) {
      continue;
    }

    const sourceState = snapshot.places[placeId]!;
    tokenValues.set(
      snapshot.buffer.subarray(sourceState.offset, sourceState.offset + size),
      targetOffset,
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
  const tokenValues = new Float64Array(
    frame,
    header.tokenValuesOffset,
    header.tokenValueCount,
  );

  const getPlaceState = (placeId: ID): EngineFramePlaceState | null => {
    const index = layout.placeIndexById.get(placeId);
    if (index === undefined) {
      return null;
    }

    return {
      offset: placeValueOffsets[index] ?? 0,
      count: placeCounts[index] ?? 0,
      dimensions: layout.placeDimensions[index] ?? 0,
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
    tokenValues,
    getPlaceState,
    getPlaceEntries,
    getPlaceTokenValues(placeId) {
      const placeState = getPlaceState(placeId);
      if (!placeState) {
        return null;
      }
      const size = placeState.count * placeState.dimensions;
      return tokenValues.subarray(placeState.offset, placeState.offset + size);
    },
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
        buffer: tokenValues.slice(),
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
