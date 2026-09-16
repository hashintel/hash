import * as Envelope from "./Envelope";
import * as NodeId from "./NodeId";
import * as Position from "./Position";
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";
import * as TileError from "./TileDocument/error";
import * as Head from "./TileDocument/head";
import * as Trailer from "./TileDocument/trailer";
import * as TypeMask from "./TypeMask";

import type * as Decoder from "./Decoder";
import type * as GenerationId from "./GenerationId";

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
  readonly variant: Decoder.U64;
  readonly coordinate: Head.Coordinate;
  readonly mode: Head.Mode;
  /** Points delivered by this response. */
  readonly delivered: Decoder.U64;
  /** Bucket of `runs[0]`. */
  readonly firstBucket: Decoder.U64;
  /**
   * Per-bucket delivered counts.
   *
   * Bucket `firstBucket + index` holds `runs[index]` points, whose rows begin at column offset `sum(runs[0..index])`. Zero-length entries keep their positional slot.
   */
  readonly runs: readonly Decoder.U64[];
  /**
   * Occupied-child bitmask: bit `i` marks Morton child `i` as holding an undelivered visible point below this cut.
   *
   * Zero is the completeness signal in both delivery modes: nothing deeper exists.
   */
  readonly children: Decoder.U64;
  readonly global: Head.TileDocumentGlobal | null;
  readonly positions: Position.PositionColumn<T>;
  readonly rowIds: NodeId.NodeIdColumn<T>;
  /** Null when the request supplied no colored types. */
  readonly typeMask: TypeMask.TypeMaskColumn<T> | null;
  readonly trailer: Trailer.TileDocumentTrailer | null;
}

const contextCount = (
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

const indexChunk = <T extends ArrayBufferLike>(
  chunks: readonly Envelope.Chunk<T>[],
  index: number,
): Result.Result<Uint8Array<T>, TileError.TileDocumentError> => {
  const bytes = chunks[index]?.bytes;
  if (bytes === null || bytes === undefined) {
    return Result.err(
      new TileError.TileDocumentError({ _tag: "missing-slot", slot: index }),
    );
  }

  return Result.ok(bytes);
};

const checkCount = (
  actual: number,
  expected: Decoder.U64,
  field: string,
): Result.Result<void, TileError.TileDocumentError> =>
  Result.filter(
    (actual) => BigInt(actual) === expected,
    () =>
      new TileError.TileDocumentError({
        _tag: "length",
        field,
        expected,
        actual,
      }),
  );

const decodePositions = <T extends ArrayBufferLike>(
  bytes: Uint8Array<T>,
  delivered: Decoder.U64,
): Result.Result<Position.PositionColumn<T>, TileError.TileDocumentError> =>
  Position.PositionColumn.decode(bytes).pipe(
    Result.changeContext(TileError.invalidField("positions")),
    Result.andThen(checkCount("positions", delivered)),
  );

const decodeRowIds = <T extends Uint8Array>(
  bytes: Uint8Array<T>,
  delivered: Decoder.U64,
) =>
  NodeId.NodeIdColumn.decode(bytes).pipe(
    Result.changeContext(TileError.invalidField("rowIds")),
    Result.andThen(checkCount("rowIds", delivered)),
  );

const decodeTypeMask = <T extends ArrayBufferLike>(
  bytes: Option.Option<Uint8Array<T>>,
  delivered: Decoder.U64,
) =>
  Option.map(
    bytes,
    flow(
      TypeMask.TypeMaskColumn.decode,
      Result.changeContext(TileError.invalidField("typeMask")),
      Result.andThen(checkCount("typeMask", delivered)),
    ),
  );

const decodeDocument = Result.fn(function* decodeDocument<
  T extends ArrayBufferLike,
>(
  decoder: Decoder.Decoder<T>,
  context: Head.Context,
): Result.gen.Return<TileDocument<T>, TileError.DecodeError> {
  yield* contextCount("coloredTypeCount", context.coloredTypeCount);

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
    indexChunk(chunks, 0).pipe(Result.andThen(Head.decode)),
    indexChunk(chunks, 1),
    indexChunk(chunks, 2),
    Result.ok(Option.fromNullable(chunks[3])),
  ]).pipe(Result.changeContext(TileError.rejected("slot")));

  yield* Option.match(typeMaskChunk, {
    onSome: () => Result.assert(head.coloredTypeCount !== 0),
    onNone: () => Result.assert(head.coloredTypeCount === 0),
  });

  const [positions, rowIds, typeMask] = yield* Result.all([
    decodePositions(positionsChunk, head.delivered),
    decodeRowIds(rowIdsChunk, head.delivered),
    decodeTypeMask(typeMaskChunk, head.delivered),
  ]).pipe(Result.changeContext(TileError.rejected("columns")));

  let trailer: Trailer.TileDocumentTrailer | null = null;
  if (head.hasTrailer) {
    const bytes = yield* decoder.nextUint8Array(decoder.remaining);
    trailer = yield* Trailer.decode(bytes, head.delivered);
  } else if (decoder.remaining !== 0) {
    return yield* TileError.invalidField(
      "head.trailer",
      "undeclared trailing bytes",
    );
  }

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
 * The context supplies the requested colored-type count. The caller must match generation, variant, coordinate, mode and trailer presence to its request.
 *
 * @returns The complete document or a {@link TileError.TileDocumentError} whose causes preserve underlying errors and unexpected exceptions. Failure may advance the decoder.
 */
export const decode = <T extends ArrayBufferLike>(
  decoder: Decoder.Decoder<T>,
  context: Head.Context,
): Result.Result<TileDocument<T>, TileError.TileDocumentError> =>
  Result.catch(
    () => decodeDocument(decoder, context),
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
