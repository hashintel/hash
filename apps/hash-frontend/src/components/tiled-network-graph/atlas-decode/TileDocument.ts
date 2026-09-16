import * as Envelope from "./Envelope";
import { flow } from "./Function";
import * as NodeId from "./NodeId";
import * as Option from "./Option";
import * as Position from "./Position";
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";
import * as TileError from "./TileDocument/error";
import * as Head from "./TileDocument/head";
import * as Trailer from "./TileDocument/trailer";
import * as TypeMask from "./TypeMask";

import type * as Decoder from "./Decoder";
import type * as GenerationId from "./GenerationId";
import type * as Num from "./Num";

export type { TileDocumentErrorReason } from "./TileDocument/error";
export { TileDocumentError } from "./TileDocument/error";
export type {
  Bounds,
  Context,
  Coordinate,
  Mode,
  TileDocumentGlobal,
} from "./TileDocument/head";
export type { TileDocumentTrailer } from "./TileDocument/trailer";

/** Tile metadata with borrowed geometry columns. */
export interface TileDocument<T extends ArrayBufferLike> {
  readonly generation: GenerationId.GenerationId;
  readonly variant: Num.u64;
  readonly coordinate: Head.Coordinate;
  readonly mode: Head.Mode;
  /** Points delivered by this response. */
  readonly delivered: Num.u64;
  /** Bucket of `runs[0]`. */
  readonly firstBucket: Num.u64;
  /**
   * Per-bucket delivered counts.
   *
   * Bucket `firstBucket + index` holds `runs[index]` points, whose rows begin at column offset `sum(runs[0..index])`. Zero-length entries keep their positional slot.
   */
  readonly runs: readonly Num.u64[];
  /**
   * Occupied-child bitmask: bit `i` marks Morton child `i` as holding an undelivered visible point below this cut.
   *
   * Zero is the completeness signal in both delivery modes: nothing deeper exists.
   */
  readonly children: Num.u64;
  readonly global: Head.TileDocumentGlobal | null;
  readonly positions: Position.PositionColumn<T>;
  readonly rowIds: NodeId.NodeIdColumn<T>;
  /** Absent when the request supplied no colored types. */
  readonly typeMask: Option.Option<TypeMask.TypeMaskColumn<T>>;
  readonly trailer: Trailer.TileDocumentTrailer | null;
}

const checkContext = (
  field: keyof Head.Context,
  value: number,
): Result.Result<void, TileError.TileDocumentError> => {
  if (!Number.isSafeInteger(value) || value < 0) {
    return Result.err(
      new TileError.TileDocumentError({
        _tag: "invalid-context",
        field,
        value,
      }),
    );
  }

  return Result.ok(undefined);
};

const checkCount = (field: string, expected: Num.u64) =>
  Result.filter(
    (column: { readonly length: number }) => BigInt(column.length) === expected,
    (column) =>
      TileError.TileDocumentError.invalidLength(field, expected, column.length),
  );

const decodePositions = <T extends ArrayBufferLike>(
  bytes: Uint8Array<T>,
  delivered: Num.u64,
): Result.Result<Position.PositionColumn<T>, TileError.TileDocumentError> =>
  Position.PositionColumn.decode(bytes).pipe(
    Result.changeContext(() =>
      TileError.TileDocumentError.invalidField("positions"),
    ),
    checkCount("positions", delivered),
  );

const decodeRowIds = <T extends ArrayBufferLike>(
  bytes: Uint8Array<T>,
  delivered: Num.u64,
) =>
  NodeId.NodeIdColumn.decode(bytes).pipe(
    Result.changeContext(() =>
      TileError.TileDocumentError.invalidField("rowIds"),
    ),
    checkCount("rowIds", delivered),
  );

const decodeTypeMask = <T extends ArrayBufferLike>(
  bytes: Option.Option<Uint8Array<T>>,
  delivered: Num.u64,
  coloredTypeCount: number,
) =>
  Option.transposeResult(
    Option.map(
      bytes,
      flow(
        TypeMask.TypeMaskColumn.decode(coloredTypeCount),
        Result.changeContext(() =>
          TileError.TileDocumentError.invalidField("typeMask"),
        ),
        checkCount("typeMask", delivered),
      ),
    ),
  );

export interface DecodeOptions extends Head.Context {
  readonly generation: GenerationId.GenerationId;
  readonly variant: Num.u64;
  readonly mode: Head.Mode;
  readonly coordinate: Head.Coordinate;
}

const decodeDocument = Result.fn(function* decodeDocument<
  T extends ArrayBufferLike,
>(
  decoder: Decoder.Decoder<T>,
  { generation, variant, coloredTypeCount, coordinate, mode }: DecodeOptions,
): Result.gen.Return<TileDocument<T>, TileError.DecodeError> {
  yield* checkContext("coloredTypeCount", coloredTypeCount);

  const [envelope, chunks] = yield* Envelope.decode(decoder);

  if (envelope.kind !== "SALTILET") {
    return yield* Result.err(
      new TileError.TileDocumentError({
        _tag: "invalid-kind",
        actual: envelope.kind,
      }),
    );
  }

  const [head, positionsChunk, rowIdsChunk, typeMaskChunk] = yield* Result.all([
    Envelope.indexChunk(chunks, 0).pipe(Result.andThen(Head.decode)),
    Envelope.indexChunk(chunks, 1),
    Envelope.indexChunk(chunks, 2),
    Result.ok(Envelope.getChunk(chunks, 3)),
  ]).pipe(
    Result.changeContext(() => TileError.TileDocumentError.rejected("slot")),
  );

  yield* Option.match(typeMaskChunk, {
    onSome: () =>
      Result.assert(coloredTypeCount !== 0, () =>
        TileError.TileDocumentError.unexpectedSlot(3),
      ),
    onNone: () =>
      Result.assert(coloredTypeCount === 0, () =>
        Envelope.EnvelopeError.missingSlot(3),
      ),
  });

  const [positions, rowIds, typeMask] = yield* Result.all([
    decodePositions(positionsChunk, head.delivered),
    decodeRowIds(rowIdsChunk, head.delivered),
    decodeTypeMask(typeMaskChunk, head.delivered, coloredTypeCount),
  ]).pipe(
    Result.changeContext(() => TileError.TileDocumentError.rejected("columns")),
  );

  let trailer: Trailer.TileDocumentTrailer | null = null;
  if (head.hasTrailer) {
    const bytes = yield* decoder.nextUint8Array(decoder.remaining);
    trailer = yield* Trailer.decode(bytes, head.delivered);
  } else if (decoder.remaining !== 0) {
    return yield* Result.err(
      TileError.TileDocumentError.invalidField(
        "head.trailer",
        "undeclared trailing bytes",
      ),
    );
  }

  yield* Result.all([
    Result.assert(head.generation.equals(generation), () =>
      TileError.TileDocumentError.generationMismatch(
        generation,
        head.generation,
      ),
    ),
    Result.assert(head.variant === variant, () =>
      TileError.TileDocumentError.variantMismatch(variant, head.variant),
    ),
    Result.assert(head.mode === mode, () =>
      TileError.TileDocumentError.modeMismatch(mode, head.mode),
    ),
    Result.assert(
      head.coordinate.z === coordinate.z &&
        head.coordinate.x === coordinate.x &&
        head.coordinate.y === coordinate.y,
      () =>
        TileError.TileDocumentError.coordinateMismatch(
          coordinate,
          head.coordinate,
        ),
    ),
  ]).pipe(
    Result.changeContext(() => TileError.TileDocumentError.rejected("request")),
  );

  return {
    generation: head.generation,
    variant: head.variant,
    coordinate: head.coordinate,
    mode: head.mode,
    delivered: head.delivered,
    firstBucket: head.firstBucket,
    runs: head.runs,
    children: head.children,
    global: head.global,
    positions,
    rowIds,
    typeMask,
    trailer,
  };
});

/**
 * Decodes a tile response into metadata, geometry columns, and optional detail.
 *
 * Columns and generation bytes borrow the input. Keep its buffer attached and unchanged while using the document. Slots this decoder has no table entry for stay encoded, populated or not.
 *
 * The options supply the requested colored-type count and the expected generation, variant, coordinate and mode. A {@link Result.All} retains request mismatches under the request section's error. The caller decides whether a declared trailer satisfies its detail request.
 *
 * @returns The complete document or a {@link TileError.TileDocumentError} whose causes preserve underlying errors and unexpected exceptions. Failure may advance the decoder.
 */
export const decode = <T extends ArrayBufferLike>(
  decoder: Decoder.Decoder<T>,
  options: DecodeOptions,
): Result.Result<TileDocument<T>, TileError.TileDocumentError> =>
  Result.catch(
    () => decodeDocument(decoder, options),
    (cause) =>
      Result.err(
        new TileError.TileDocumentError({ _tag: "decode" }, { cause }),
      ),
  ).pipe(
    Result.changeContextIf(
      TaggedError.is("ArrayVisitorError"),
      (error) => new TileError.TileDocumentError(error.reason),
    ),
    Result.changeContextIf(
      TaggedError.isNot("TileDocumentError"),
      () => new TileError.TileDocumentError({ _tag: "decode" }),
    ),
  );
