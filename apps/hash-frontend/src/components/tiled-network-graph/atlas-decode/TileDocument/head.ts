import * as CborDecoder from "../CborDecoder";
import * as CborPrimitive from "../CborPrimitive";
import * as GenerationId from "../GenerationId";
import * as Result from "../Result";
import * as TileError from "./error";

import type * as Num from "../Num";

/** A tile address, exactly as encoded. */
export interface Coordinate {
  readonly z: Num.u64;
  readonly x: Num.u64;
  readonly y: Num.u64;
}

/** Delivery mode: an increment over the ancestors' cuts, or their accumulated view. */
export type Mode = "delta" | "total";

/** A finite wire-frame extent as `[minX, minY, maxX, maxY]`, with ordered endpoints. */
export type Bounds = readonly [
  minX: Num.f32,
  minY: Num.f32,
  maxX: Num.f32,
  maxY: Num.f32,
];

/**
 * Post-intersection metadata for the response's visible set.
 *
 * Root tiles include this metadata for camera framing. Counts and bounds describe the authorized, filtered set.
 */
export interface TileDocumentGlobal {
  /** Visible points at this response's zoom. */
  readonly visible: Num.u64;
  /** Extent of the entire visible set, or null when that set is empty. */
  readonly bounds: Bounds | null;
  /** Deepest bucket the visible set occupies: the coarsest cut delivering all of it. */
  readonly minResolution: Num.u64;
}

/** Request parameters needed to interpret a tile response. */
export interface Context {
  /** Colored type ids the request supplied. Zero means the response carries no type mask. */
  readonly coloredTypeCount: number;
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/** Tile header fields that describe the columns and the trailer. */
export interface Head {
  readonly generation: GenerationId.GenerationId;
  readonly variant: Num.u64;
  readonly coordinate: Coordinate;
  readonly mode: Mode;
  readonly delivered: Num.u64;
  readonly firstBucket: Num.u64;
  readonly runs: readonly Num.u64[];
  readonly global: TileDocumentGlobal | null;
  readonly children: Num.u64;
  readonly hasTrailer: boolean;
}

const modeVisitor: CborDecoder.CborVisitor<Mode, TileError.TileDocumentError> =
  {
    expecting: "a delivery mode",
    visitUnsignedInteger: (value) => {
      switch (value) {
        case 0n:
          return Result.ok<Mode>("delta");
        case 1n:
          return Result.ok<Mode>("total");

        default:
          return Result.err(
            TileError.TileDocumentError.invalidField(
              "head.mode",
              `expected 0 (delta) or 1 (total), received ${value}`,
            ),
          );
      }
    },
  };

const coordinateVisitor: CborDecoder.CborVisitor<
  Coordinate,
  TileError.TileDocumentError
> = {
  expecting: "a [z, x, y] coordinate",
  visitArray: Result.fn(function* readCoordinate(
    access: CborDecoder.CborArrayAccess,
  ): Result.gen.Return<
    Coordinate,
    TileError.TileDocumentError | CborDecoder.CborDecoderError
  > {
    if (access.remaining !== 3) {
      return yield* Result.err(
        new TileError.TileDocumentError({
          _tag: "length",
          field: "head.coordinate",
          expected: 3n,
          actual: access.remaining,
        }),
      );
    }

    const z = yield* access.readElement(CborPrimitive.unsigned);
    const x = yield* access.readElement(CborPrimitive.unsigned);
    const y = yield* access.readElement(CborPrimitive.unsigned);

    return { z, x, y };
  }),
};

const boundsVisitor: CborDecoder.CborVisitor<
  Bounds,
  TileError.TileDocumentError
> = {
  expecting: "four f32 bounds",
  visitArray: Result.fn(function* readBounds(
    access: CborDecoder.CborArrayAccess,
  ): Result.gen.Return<
    Bounds,
    TileError.TileDocumentError | CborDecoder.CborDecoderError
  > {
    if (access.remaining !== 4) {
      return yield* Result.err(
        new TileError.TileDocumentError({
          _tag: "length",
          field: "head.global.bounds",
          expected: 4n,
          actual: access.remaining,
        }),
      );
    }

    const minX = yield* access.readElement(CborPrimitive.float32);
    const minY = yield* access.readElement(CborPrimitive.float32);
    const maxX = yield* access.readElement(CborPrimitive.float32);
    const maxY = yield* access.readElement(CborPrimitive.float32);
    const bounds: Bounds = [minX, minY, maxX, maxY];

    yield* Result.assert(
      bounds.every(Number.isFinite) && minX <= maxX && minY <= maxY,
      () =>
        TileError.TileDocumentError.invalidField(
          "head.global.bounds",
          "expected finite bounds with ordered minima and maxima",
        ),
    );

    return bounds;
  }),
};

const readGlobal = Result.fn(function* readGlobal(
  access: CborDecoder.CborMapAccess,
): Result.gen.Return<TileDocumentGlobal, TileError.DecodeError> {
  const partial: Partial<Mutable<TileDocumentGlobal>> = { bounds: null };

  while (access.remaining > 0) {
    const key = yield* access.readKey();
    switch (key) {
      case 0n:
        partial.visible = yield* access.readValue(CborPrimitive.unsigned);
        break;
      case 1n:
        partial.bounds = yield* access.readValue(boundsVisitor);
        break;
      case 2n:
        partial.minResolution = yield* access.readValue(CborPrimitive.unsigned);
        break;
      default:
        return yield* Result.err(
          new TileError.TileDocumentError({
            _tag: "unknown-field",
            section: "global",
            key,
          }),
        );
    }
  }

  return yield* Result.all([
    Result.fromNullable(partial.visible, () =>
      TileError.TileDocumentError.missingField("head.global.visible"),
    ),
    Result.fromNullable(partial.minResolution, () =>
      TileError.TileDocumentError.missingField("head.global.minResolution"),
    ),
  ]).pipe(
    Result.changeContext(() => TileError.TileDocumentError.rejected("head")),
    Result.map(([visible, minResolution]) => ({
      visible,
      bounds: partial.bounds ?? null,
      minResolution,
    })),
  );
});

const globalVisitor: CborDecoder.CborVisitor<
  TileDocumentGlobal,
  TileError.DecodeError
> = {
  expecting: "the tile global metadata",
  visitMap: readGlobal,
};

const readHead = Result.fn(function* readHead(
  access: CborDecoder.CborMapAccess,
): Result.gen.Return<Head, TileError.DecodeError> {
  const partial: Partial<Mutable<Head>> = { global: null };

  while (access.remaining > 0) {
    const key = yield* access.readKey();
    switch (key) {
      case 0n:
        partial.generation = yield* access.readValue(GenerationId.Visitor);
        break;
      case 1n:
        partial.variant = yield* access.readValue(CborPrimitive.unsigned);
        break;
      case 2n:
        partial.coordinate = yield* access.readValue(coordinateVisitor);
        break;
      case 3n:
        partial.mode = yield* access.readValue(modeVisitor);
        break;
      case 4n:
        partial.delivered = yield* access.readValue(CborPrimitive.unsigned);
        break;
      case 6n:
        partial.firstBucket = yield* access.readValue(CborPrimitive.unsigned);
        break;
      case 7n:
        partial.runs = yield* access.readValue(
          CborPrimitive.array(CborPrimitive.unsigned, "head.runs"),
        );
        break;
      case 8n:
        partial.global = yield* access.readValue(globalVisitor);
        break;
      case 9n:
        partial.children = yield* access.readValue(CborPrimitive.unsigned);
        break;
      case 10n:
        partial.hasTrailer = yield* access.readValue(CborPrimitive.boolean);
        break;
      default:
        return yield* Result.err(
          new TileError.TileDocumentError({
            _tag: "unknown-field",
            section: "head",
            key,
          }),
        );
    }
  }

  return yield* Result.all([
    Result.fromNullable(partial.generation, () =>
      TileError.TileDocumentError.missingField("head.generation"),
    ),
    Result.fromNullable(partial.variant, () =>
      TileError.TileDocumentError.missingField("head.variant"),
    ),
    Result.fromNullable(partial.coordinate, () =>
      TileError.TileDocumentError.missingField("head.coordinate"),
    ),
    Result.fromNullable(partial.mode, () =>
      TileError.TileDocumentError.missingField("head.mode"),
    ),
    Result.fromNullable(partial.delivered, () =>
      TileError.TileDocumentError.missingField("head.delivered"),
    ),
    Result.fromNullable(partial.firstBucket, () =>
      TileError.TileDocumentError.missingField("head.firstBucket"),
    ),
    Result.fromNullable(partial.runs, () =>
      TileError.TileDocumentError.missingField("head.runs"),
    ),
    Result.fromNullable(partial.children, () =>
      TileError.TileDocumentError.missingField("head.children"),
    ),
    Result.fromNullable(partial.hasTrailer, () =>
      TileError.TileDocumentError.missingField("head.trailer"),
    ),
  ]).pipe(
    Result.changeContext(() => TileError.TileDocumentError.rejected("head")),
    Result.map(
      ([
        generation,
        variant,
        coordinate,
        mode,
        delivered,
        firstBucket,
        runs,
        children,
        hasTrailer,
      ]) => ({
        generation,
        variant,
        coordinate,
        mode,
        delivered,
        firstBucket,
        runs,
        global: partial.global ?? null,
        children,
        hasTrailer,
      }),
    ),
  );
});

const decodeHead = (
  bytes: Uint8Array,
): Result.Result<Head, TileError.DecodeError> =>
  new CborDecoder.CborDecoder(bytes).decode({
    expecting: "a tile head",
    visitMap: readHead,
  });

const checkRunSum = (
  head: Head,
): Result.Result<void, TileError.TileDocumentError> => {
  const sum = head.runs.reduce((total, run) => total + run, 0n);
  return sum === head.delivered
    ? Result.ok(undefined)
    : Result.err(
        new TileError.TileDocumentError({
          _tag: "run-sum",
          expected: head.delivered,
          actual: sum,
        }),
      );
};

const checkChildren = (
  head: Head,
): Result.Result<void, TileError.TileDocumentError> =>
  // Completeness uses zero as “no occupied children”; only the four child bits can contribute.
  head.children > 15n
    ? Result.err(
        TileError.TileDocumentError.invalidField(
          "head.children",
          `expected a four-child occupancy mask, received ${head.children}`,
        ),
      )
    : Result.ok(undefined);

const checkGlobal = (
  head: Head,
): Result.Result<void, TileError.TileDocumentError> => {
  // Camera framing needs the visible extent even when this tile delivers no points.
  if (head.global === null) {
    return head.coordinate.z === 0n
      ? Result.err(TileError.TileDocumentError.missingField("head.global"))
      : Result.ok(undefined);
  }
  return head.global.bounds === null && head.global.visible !== 0n
    ? Result.err(TileError.TileDocumentError.missingField("head.global.bounds"))
    : Result.ok(undefined);
};

/** Reads metadata and validates the row partition and camera-framing metadata. */
export const decode = Result.fn(function* decode(
  bytes: Uint8Array,
): Result.gen.Return<Head, TileError.DecodeError> {
  const head = yield* decodeHead(bytes);
  yield* Result.all([
    checkRunSum(head),
    checkChildren(head),
    checkGlobal(head),
  ]).pipe(
    Result.changeContext(() => TileError.TileDocumentError.rejected("head")),
  );
  return head;
});
