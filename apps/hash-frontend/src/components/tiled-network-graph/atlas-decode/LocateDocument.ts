import * as BinaryEntityId from "./BinaryEntityId";
import * as Envelope from "./Envelope";
import { flow } from "./Function";
import * as LocateError from "./LocateDocument/error";
import * as Head from "./LocateDocument/head";
import * as Trailer from "./LocateDocument/trailer";
import * as NodeId from "./NodeId";
import * as Option from "./Option";
import * as Position from "./Position";
import * as Result from "./Result";
import * as TypeMask from "./TypeMask";

import type * as Decoder from "./Decoder";
import type * as GenerationId from "./GenerationId";
import type * as Num from "./Num";

export type { LocateDocumentErrorReason } from "./LocateDocument/error";
export { LocateDocumentError } from "./LocateDocument/error";
export type { Cell } from "./LocateDocument/head";
export type { Properties, Scalar, Trailer } from "./LocateDocument/trailer";

/** A source-first subgraph with borrowed geometry and URL-resolved detail. */
export interface LocateDocument<T extends ArrayBufferLike> extends Head.Head {
  readonly positions: Position.PositionColumn<T>;
  readonly rowIds: NodeId.NodeIdColumn<T>;
  readonly typeMask: Option.Option<TypeMask.TypeMaskColumn<T>>;
  readonly sources: NodeId.NodeIdColumn<T>;
  readonly targets: NodeId.NodeIdColumn<T>;
  readonly edgeIds: BinaryEntityId.BinaryEntityIdColumn<T>;
  readonly trailer: Trailer.Trailer;
}

/** Request data needed to interpret masks and reject responses from another request context. */
export interface DecodeOptions {
  readonly coloredTypeCount: number;
  readonly generation: GenerationId.GenerationId;
  readonly variant: Num.u64;
}

const inSection = (section: string) =>
  Result.changeContext(() => LocateError.LocateDocumentError.section(section));

const checkCount = (field: string, expected: bigint) =>
  Result.filter(
    (column: { readonly length: number }) => BigInt(column.length) === expected,
    (column) =>
      LocateError.LocateDocumentError.invalidLength(
        field,
        expected,
        column.length,
      ),
  );

const decodeDocument = Result.fn(function* decodeDocument<
  T extends ArrayBufferLike,
>(
  decoder: Decoder.Decoder<T>,
  { coloredTypeCount, generation, variant }: DecodeOptions,
): Result.gen.Return<LocateDocument<T>, LocateError.LocateDocumentError> {
  yield* Result.assert(
    Number.isSafeInteger(coloredTypeCount) && coloredTypeCount >= 0,
    () =>
      LocateError.LocateDocumentError.invalid(
        "coloredTypeCount",
        "expected a nonnegative safe integer",
      ),
  );

  const [envelope, chunks] = yield* Envelope.decode(decoder).pipe(
    Result.changeContext(() =>
      LocateError.LocateDocumentError.section("envelope"),
    ),
  );

  yield* Result.assert(envelope.kind === "SALTILEL", () =>
    LocateError.LocateDocumentError.invalid(
      "kind",
      `received ${envelope.kind}`,
    ),
  );

  const [
    head,
    positionBytes,
    rowBytes,
    sourceBytes,
    targetBytes,
    identityBytes,
  ] = yield* Result.all([
    Envelope.indexChunk(chunks, 0).pipe(Result.andThen(Head.decode)),
    Envelope.indexChunk(chunks, 1),
    Envelope.indexChunk(chunks, 2),
    Envelope.indexChunk(chunks, 4),
    Envelope.indexChunk(chunks, 5),
    Envelope.indexChunk(chunks, 6),
  ]).pipe(
    Result.changeContext(() =>
      LocateError.LocateDocumentError.section("slots"),
    ),
  );

  const maskBytes = Envelope.getChunk(chunks, 3);
  yield* Result.assert(Option.isSome(maskBytes) === coloredTypeCount > 0, () =>
    LocateError.LocateDocumentError.invalid(
      "typeMask",
      "presence differs from the requested colored-type count",
    ),
  );

  const typeMask = Option.transposeResult(
    Option.map(
      maskBytes,
      flow(
        TypeMask.TypeMaskColumn.decode(coloredTypeCount),
        checkCount("typeMask", head.count),
        inSection("typeMask"),
      ),
    ),
  );

  const trailerBytes = yield* decoder
    .nextUint8Array(decoder.remaining)
    .pipe(
      Result.changeContext(() =>
        LocateError.LocateDocumentError.section("trailer"),
      ),
    );

  const [positions, rowIds, sources, targets, edgeIds, masks, trailer] =
    yield* Result.all([
      Position.PositionColumn.decode(positionBytes).pipe(
        checkCount("positions", head.count),
        inSection("positions"),
      ),
      NodeId.NodeIdColumn.decode(rowBytes).pipe(
        checkCount("rowIds", head.count),
        inSection("rowIds"),
      ),
      NodeId.NodeIdColumn.decode(sourceBytes).pipe(
        checkCount("sources", head.edges),
        inSection("sources"),
      ),
      NodeId.NodeIdColumn.decode(targetBytes).pipe(
        checkCount("targets", head.edges),
        inSection("targets"),
      ),
      BinaryEntityId.BinaryEntityIdColumn.decode(identityBytes).pipe(
        checkCount("edgeIds", head.edges),
        inSection("edgeIds"),
      ),
      typeMask,
      Trailer.decode(head.count, head.edges)(trailerBytes),
      Result.all([
        Result.assert(generation.equals(head.generation), () =>
          LocateError.LocateDocumentError.generationMismatch(
            generation,
            head.generation,
          ),
        ),
        Result.assert(variant === head.variant, () =>
          LocateError.LocateDocumentError.variantMismatch(
            variant,
            head.variant,
          ),
        ),
      ]).pipe(inSection("request")),
    ]).pipe(
      Result.changeContext(() =>
        LocateError.LocateDocumentError.section("document"),
      ),
    );

  return {
    ...head,
    positions,
    rowIds,
    sources,
    targets,
    edgeIds,
    typeMask: masks,
    trailer,
  };
});

/**
 * Decodes a locate response against its requested generation and variant.
 *
 * Columns, binary identities and completeness masks borrow the input. Keep its buffer attached and unchanged while using the document. Decoding preserves row order and resolves intern references to URLs. Mask iteration excludes unused padding bits.
 *
 * Independent failures retain their causes beneath section errors. Unexpected exceptions become decode errors with their original causes. A failure may advance the decoder.
 */
export const decode = <T extends ArrayBufferLike>(
  decoder: Decoder.Decoder<T>,
  options: DecodeOptions,
): Result.Result<LocateDocument<T>, LocateError.LocateDocumentError> =>
  Result.catch(
    () => decodeDocument(decoder, options),
    (cause) => Result.err(LocateError.LocateDocumentError.decoding(cause)),
  );
