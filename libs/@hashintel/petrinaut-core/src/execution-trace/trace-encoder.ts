import {
  createEngineFrame,
  createEngineFrameLayout,
  type EngineFrameSnapshot,
} from "../simulation/frames/internal-frame";
import { encodeTokenToBytes } from "../tokens/token-layout";

import type { InitialTokenAttributeValue } from "../simulation/api";
import type { SimulationFrameNewStrings } from "../simulation/frames/frame-payload";
import type { SDCPN } from "../types/sdcpn";
import type { TraceEvent } from "./trace-event";

/** One token of a coloured place, by attribute name. An attribute left out takes its type's default. */
export type TraceToken = Readonly<Record<string, InitialTokenAttributeValue>>;

/**
 * Tokens per place id: a count, or one record per token of a coloured place.
 * A count in a coloured place stands for that many tokens of default values.
 */
export type TraceMarking = Readonly<
  Record<string, number | readonly TraceToken[]>
>;

/** What one firing did to the state before it. */
export type TraceFiring = {
  /** The transitions that fired, at one position. */
  transitionIds: readonly string[];
  /** Tokens taken per place id: how many, the oldest first. */
  consumed?: Readonly<Record<string, number>>;
  /** Tokens added per place id: a count, or the tokens of a coloured place. */
  produced?: TraceMarking;
};

/**
 * Writes the events of an execution for a source that has no engine: it
 * keeps the marking, applies each firing to it, and records every state in
 * the frame format a trace holds.
 *
 * A place or transition id the net does not have is skipped. A host's net
 * and its events can be out of step, and the rest of the event still shows.
 */
export interface TraceEncoder {
  /**
   * Records a state the source knows whole. The first event of a trace is
   * one: `initial` when the execution starts there, `reference` when the
   * trace joins an execution under way.
   */
  state(
    this: void,
    time: number,
    marking: TraceMarking,
    kind?: "initial" | "reference",
  ): TraceEvent;
  /** Records a firing as its effect on the state before it. */
  firing(this: void, time: number, firing: TraceFiring): TraceEvent;
}

const tokenCountOf = (value: number | readonly TraceToken[]): number =>
  typeof value === "number"
    ? Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : 0
    : value.length;

export function createTraceEncoder(
  net: Pick<SDCPN, "places" | "transitions" | "types">,
): TraceEncoder {
  const layout = createEngineFrameLayout(net);
  const placeCount = layout.placeIds.length;

  /** Per frame place index, the tokens of a place whose colour has attributes, each as its packed bytes. */
  let tokens: Uint8Array[][] = layout.placeIds.map(() => []);
  /** Per frame place index, the count of a place whose tokens carry nothing. */
  let counts: number[] = layout.placeIds.map(() => 0);
  const firingCounts = layout.transitionIds.map(() => 0);
  const lastFiringTimes: (number | null)[] = layout.transitionIds.map(
    () => null,
  );

  const strings: string[] = [""];
  const stringIds = new Map<string, number>([["", 0]]);
  let shippedStringCount = strings.length;
  const stringPool = {
    intern(value: string): number {
      let id = stringIds.get(value);
      if (id === undefined) {
        id = strings.length;
        strings.push(value);
        stringIds.set(value, id);
      }
      return id;
    },
  };

  let eventCount = 0;
  let startTime = 0;
  let lastTime = Number.NEGATIVE_INFINITY;

  const carriesBytes = (placeIndex: number): boolean =>
    (layout.placeStrideBytes[placeIndex] ?? 0) > 0;

  const encodeTokens = (
    placeIndex: number,
    value: number | readonly TraceToken[],
  ): Uint8Array[] => {
    const tokenLayout = layout.placeTokenLayouts[placeIndex]!;
    const context = `trace.${layout.placeIds[placeIndex]!}`;
    return typeof value === "number"
      ? Array.from({ length: tokenCountOf(value) }, () =>
          encodeTokenToBytes(tokenLayout, {}, context, stringPool),
        )
      : value.map((token) =>
          encodeTokenToBytes(tokenLayout, token, context, stringPool),
        );
  };

  const add = (
    placeId: string,
    value: number | readonly TraceToken[],
  ): number | null => {
    const placeIndex = layout.placeIndexById.get(placeId);
    if (placeIndex === undefined) {
      return null;
    }
    if (carriesBytes(placeIndex)) {
      tokens[placeIndex]!.push(...encodeTokens(placeIndex, value));
    } else {
      counts[placeIndex] = counts[placeIndex]! + tokenCountOf(value);
    }
    return placeIndex;
  };

  const remove = (placeId: string, count: number): number | null => {
    const placeIndex = layout.placeIndexById.get(placeId);
    if (placeIndex === undefined) {
      return null;
    }
    const taken = tokenCountOf(count);
    if (carriesBytes(placeIndex)) {
      tokens[placeIndex]!.splice(0, taken);
    } else {
      counts[placeIndex] = Math.max(0, counts[placeIndex]! - taken);
    }
    return placeIndex;
  };

  const takeNewStrings = (): SimulationFrameNewStrings | undefined => {
    if (strings.length === shippedStringCount) {
      return undefined;
    }
    const delta = {
      baseId: shippedStringCount,
      values: strings.slice(shippedStringCount),
    };
    shippedStringCount = strings.length;
    return delta;
  };

  const record = (
    time: number,
    kind: TraceEvent["kind"],
    fired: readonly string[],
    touched: ReadonlySet<number>,
  ): TraceEvent => {
    if (time < lastTime) {
      throw new Error(
        `Trace events should be in order of time: received ${time} after ${lastTime}`,
      );
    }
    if (eventCount === 0) {
      startTime = time;
    }
    lastTime = time;

    const firedIds = new Set(fired);
    const transitions: EngineFrameSnapshot["transitions"] = {};
    for (const [index, transitionId] of layout.transitionIds.entries()) {
      const firedNow = firedIds.has(transitionId);
      if (firedNow) {
        firingCounts[index] = firingCounts[index]! + 1;
        lastFiringTimes[index] = time;
      }
      transitions[transitionId] = {
        timeSinceLastFiringMs:
          (time - (lastFiringTimes[index] ?? startTime)) * 1000,
        firedInThisFrame: firedNow,
        firingCount: firingCounts[index]!,
      };
    }

    const places: EngineFrameSnapshot["places"] = {};
    let byteLength = 0;
    for (let placeIndex = 0; placeIndex < placeCount; placeIndex++) {
      const strideBytes = layout.placeStrideBytes[placeIndex] ?? 0;
      const count = carriesBytes(placeIndex)
        ? tokens[placeIndex]!.length
        : counts[placeIndex]!;
      places[layout.placeIds[placeIndex]!] = {
        byteOffset: byteLength,
        count,
        strideBytes,
      };
      byteLength += count * strideBytes;
    }
    const buffer = new Uint8Array(byteLength);
    for (let placeIndex = 0; placeIndex < placeCount; placeIndex++) {
      let byteOffset = places[layout.placeIds[placeIndex]!]!.byteOffset;
      for (const token of tokens[placeIndex]!) {
        buffer.set(token, byteOffset);
        byteOffset += token.byteLength;
      }
    }

    const newStrings = takeNewStrings();
    return {
      index: eventCount++,
      time,
      kind,
      firedTransitionIds: layout.transitionIds.filter((id) => firedIds.has(id)),
      touchedPlaceIndices: Uint32Array.from(touched).sort(),
      frame: createEngineFrame(layout, { places, transitions, buffer }),
      // A host reports what fired, never how a token's attributes move
      // between two firings.
      derivatives: layout.placeIds.map(() => null),
      ...(newStrings === undefined ? {} : { newStrings }),
    };
  };

  return {
    state(time, marking, kind = "reference") {
      tokens = layout.placeIds.map(() => []);
      counts = layout.placeIds.map(() => 0);
      for (const [placeId, value] of Object.entries(marking)) {
        add(placeId, value);
      }
      return record(time, kind, [], new Set());
    },

    firing(time, { transitionIds, consumed = {}, produced = {} }) {
      const touched = new Set<number>();
      for (const [placeId, count] of Object.entries(consumed)) {
        const placeIndex = remove(placeId, count);
        if (placeIndex !== null) {
          touched.add(placeIndex);
        }
      }
      for (const [placeId, value] of Object.entries(produced)) {
        const placeIndex = add(placeId, value);
        if (placeIndex !== null) {
          touched.add(placeIndex);
        }
      }
      return record(time, "firing", transitionIds, touched);
    },
  };
}
