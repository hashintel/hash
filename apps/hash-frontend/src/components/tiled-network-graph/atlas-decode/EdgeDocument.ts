import { validateVersionedUrl } from "@blockprotocol/type-system";

import { BinaryEntityIdColumn } from "./BinaryEntityId";
import { CborDecoder } from "./CborDecoder";
import * as CborPrimitive from "./CborPrimitive";
import * as Envelope from "./Envelope";
import * as GenerationId from "./GenerationId";
import { NodeIdColumn } from "./NodeId";
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type { CborVisitor, CborDecoderError } from "./CborDecoder";
import type { Decoder, DecoderError, U64 } from "./Decoder";
import type { VersionedUrl } from "@blockprotocol/type-system";

/** Invalid edges metadata, missing payloads or inconsistent column lengths. */
export type EdgeDocumentErrorReason =
  | {
      readonly _tag: "invalid-kind";
      readonly actual: Envelope.Envelope["kind"];
    }
  | { readonly _tag: "missing-slot"; readonly slot: number }
  | {
      readonly _tag: "unknown-field";
      readonly section: "head" | "trailer";
      readonly key: U64;
    }
  | { readonly _tag: "missing-field"; readonly field: string }
  | {
      readonly _tag: "length";
      readonly field: string;
      readonly expected: U64;
      readonly actual: number;
    }
  | {
      readonly _tag: "invalid-field";
      readonly field: string;
      readonly detail: string;
    }
  | { readonly _tag: "decode" };

/** An edges document failure with its structured reason and optional cause. */
export class EdgeDocumentError extends TaggedError.TaggedError<
  "EdgeDocumentError",
  EdgeDocumentErrorReason
> {
  /** Describes a rejected field, payload or nested decoding failure. */
  constructor(reason: EdgeDocumentErrorReason, options?: ErrorOptions) {
    let message: string;

    switch (reason._tag) {
      case "invalid-kind":
        message = `expected SALTILEE, received ${reason.actual}`;
        break;
      case "missing-slot":
        message = `required edges slot ${reason.slot} is absent`;
        break;
      case "unknown-field":
        message = `unknown ${reason.section} key ${reason.key}`;
        break;
      case "missing-field":
        message = `missing ${reason.field}`;
        break;
      case "length":
        message = `${reason.field} requires ${reason.expected} entries, received ${reason.actual}`;
        break;
      case "invalid-field":
        message = `${reason.field}: ${reason.detail}`;
        break;
      case "decode":
        message = "unable to decode edges document";
        break;
    }

    super("EdgeDocumentError", reason, message, options);
  }
}

/** Per-edge labels and representative types in delivery order. */
export interface EdgeDocumentTrailer {
  readonly typeTable: readonly VersionedUrl[];
  readonly linkLabels: readonly (string | null)[];
  readonly linkTypeIds: readonly (VersionedUrl | null)[];
}

/** Edges metadata with equally sized, borrowed identity columns. */
export interface EdgeDocument<T extends ArrayBufferLike> {
  readonly generation: GenerationId.GenerationId;
  readonly variant: U64;
  readonly count: U64;
  readonly complete: boolean;
  readonly sources: NodeIdColumn<T>;
  readonly targets: NodeIdColumn<T>;
  readonly identities: BinaryEntityIdColumn<T>;
  readonly trailer: EdgeDocumentTrailer | null;
}

/** Writable fields during map visitation. */
type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/** Edges header fields that determine column sizes and trailer presence. */
interface Head {
  readonly generation: GenerationId.GenerationId;
  readonly variant: U64;
  readonly count: U64;
  readonly complete: boolean;
  readonly hasTrailer: boolean;
}

/** Errors propagated before attaching the edges document context. */
type DecodeError =
  | EdgeDocumentError
  | Envelope.EnvelopeError
  | DecoderError
  | CborDecoderError
  | CborPrimitive.ArrayVisitorError
  | GenerationId.GenerationIdError;

/** Returns a required field or a missing-field error. */
const required = <T>(
  value: T | undefined,
  field: string,
): Result.Result<T, EdgeDocumentError> => {
  if (value === undefined) {
    return Result.err(new EdgeDocumentError({ _tag: "missing-field", field }));
  }

  return Result.ok(value);
};

/** Constructs a complete header or returns a field or CBOR error. */
const decodeHead = (bytes: Uint8Array): Result.Result<Head, DecodeError> =>
  new CborDecoder(bytes).decode({
    expecting: "an edges head",
    visitMap: (access) =>
      Result.gen(function* readHead(): Result.gen.Return<Head, DecodeError> {
        const partial: Partial<Mutable<Head>> = {};

        while (access.remaining > 0) {
          const key = yield* access.readKey();
          switch (key) {
            case 0n:
              partial.generation = yield* access.readValue(
                GenerationId.Visitor,
              );

              break;
            case 1n:
              partial.variant = yield* access.readValue(CborPrimitive.unsigned);
              break;
            case 2n:
              partial.count = yield* access.readValue(CborPrimitive.unsigned);
              break;
            case 3n:
              partial.complete = yield* access.readValue(CborPrimitive.boolean);
              break;
            case 4n:
              partial.hasTrailer = yield* access.readValue(
                CborPrimitive.boolean,
              );
              break;
            default:
              return yield* Result.err(
                new EdgeDocumentError({
                  _tag: "unknown-field",
                  section: "head",
                  key,
                }),
              );
          }
        }

        return {
          generation: yield* required(partial.generation, "head.generation"),
          variant: yield* required(partial.variant, "head.variant"),
          count: yield* required(partial.count, "head.count"),
          complete: yield* required(partial.complete, "head.complete"),
          hasTrailer: yield* required(partial.hasTrailer, "head.hasTrailer"),
        };
      }),
  });

/** Checks a column's row count against its header declaration. */
const checkCount = (
  actual: number,
  expected: U64,
  field: string,
): Result.Result<void, EdgeDocumentError> => {
  if (BigInt(actual) !== expected) {
    return Result.err(
      new EdgeDocumentError({ _tag: "length", field, expected, actual }),
    );
  }
  return Result.ok(undefined);
};

/** Borrows a node column or returns a header-count mismatch. */
const decodeNodeIdColumn = <T extends ArrayBufferLike>(
  bytes: Uint8Array<T>,
  count: U64,
  field: string,
) => {
  const column = new NodeIdColumn(
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  );

  return Result.map(checkCount(column.length, count, field), () => column);
};

/** Borrows an identity column or returns a header-count mismatch. */
const decodeIdentities = <T extends ArrayBufferLike>(
  bytes: Uint8Array<T>,
  count: U64,
) => {
  const column = new BinaryEntityIdColumn(
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  );
  return Result.map(
    checkCount(column.length, count, "identities"),
    () => column,
  );
};

/** Accepts a versioned URL or returns a trailer field error. */
const typeUrlVisitor: CborVisitor<VersionedUrl, EdgeDocumentError> = {
  expecting: "a versioned type URL",
  visitTextString: (value) => {
    const parsed = validateVersionedUrl(value);

    if (parsed.type === "Err") {
      return Result.err(
        new EdgeDocumentError({
          _tag: "invalid-field",
          field: "trailer.typeTable",
          detail: "expected a versioned URL",
        }),
      );
    }

    return Result.ok(parsed.inner);
  },
};

/** Accepts a label or its explicit absence. */
const labelVisitor: CborVisitor<string | null, never> = {
  expecting: "a label or null",
  visitTextString: Result.ok,
  visitNull: () => Result.ok(null),
};

/** Accepts an intern-table index or its explicit absence. */
const typeIndexVisitor: CborVisitor<U64 | null, never> = {
  expecting: "a type index or null",
  visitUnsignedInteger: Result.ok,
  visitNull: () => Result.ok(null),
};

/** Constructs trailer detail or returns a schema, reference or CBOR error. */
const decodeTrailer = (
  bytes: Uint8Array,
  count: U64,
): Result.Result<EdgeDocumentTrailer, DecodeError> =>
  new CborDecoder(bytes).decode({
    expecting: "an edges trailer",
    visitMap: (access) =>
      Result.gen(function* readTrailer(): Result.gen.Return<
        EdgeDocumentTrailer,
        DecodeError
      > {
        let types: VersionedUrl[] | undefined;
        let labels: (string | null)[] | undefined;
        let indexes: (U64 | null)[] | undefined;

        while (access.remaining > 0) {
          const key = yield* access.readKey();
          switch (key) {
            case 0n:
              types = yield* access.readValue(
                CborPrimitive.array(typeUrlVisitor, "trailer.typeTable"),
              );
              break;
            case 1n:
              labels = yield* access.readValue(
                CborPrimitive.array(labelVisitor, "trailer.linkLabels", count),
              );
              break;
            case 2n:
              indexes = yield* access.readValue(
                CborPrimitive.array(
                  typeIndexVisitor,
                  "trailer.linkTypeIds",
                  count,
                ),
              );
              break;
            default:
              return yield* Result.err(
                new EdgeDocumentError({
                  _tag: "unknown-field",
                  section: "trailer",
                  key,
                }),
              );
          }
        }

        const typeTable = yield* required(types, "trailer.typeTable");
        const linkLabels = yield* required(labels, "trailer.linkLabels");
        const typeIndexes = yield* required(indexes, "trailer.linkTypeIds");

        if (new Set(typeTable).size !== typeTable.length) {
          return yield* Result.err(
            new EdgeDocumentError({
              _tag: "invalid-field",
              field: "trailer.typeTable",
              detail: "entries must be unique",
            }),
          );
        }

        const linkTypeIds: (VersionedUrl | null)[] = [];
        for (const index of typeIndexes) {
          if (index === null) {
            linkTypeIds.push(null);
            continue;
          }

          if (index >= BigInt(typeTable.length)) {
            return yield* Result.err(
              new EdgeDocumentError({
                _tag: "invalid-field",
                field: "trailer.linkTypeIds",
                detail: `index ${index} is outside the type table`,
              }),
            );
          }

          // the table length bounds this conversion and lookup.
          linkTypeIds.push(typeTable[Number(index)]!);
        }

        return { typeTable, linkLabels, linkTypeIds };
      }),
  });

/** Returns a present slot, retaining empty views for zero-edge columns. */
const requiredSlot = <T extends ArrayBufferLike>(
  chunks: readonly Envelope.Chunk<T>[],
  slot: number,
): Result.Result<Uint8Array<T>, EdgeDocumentError> => {
  const bytes = chunks[slot]?.bytes;
  if (bytes === null || bytes === undefined) {
    return Result.err(new EdgeDocumentError({ _tag: "missing-slot", slot }));
  }

  return Result.ok(bytes);
};

/**
 * Constructs an edges document from one complete response.
 *
 * Columns and generation bytes borrow the input. Keep its buffer attached and unchanged while using the document. The generation and variant are decoded values for comparison with the request that produced the response.
 *
 * Returns {@link EdgeDocumentError} for envelope, schema, column-count or trailer failures. Underlying errors and unexpected exceptions are retained as causes. Failure may advance the decoder.
 */
export const decode = <T extends ArrayBufferLike>(
  decoder: Decoder<T>,
): Result.Result<EdgeDocument<T>, EdgeDocumentError> =>
  Result.catch(
    () =>
      Result.gen(function* decodeEdges(): Result.gen.Return<
        EdgeDocument<T>,
        DecodeError
      > {
        const [envelope, chunks] = yield* Envelope.decode(decoder);

        if (envelope.kind !== "SALTILEE") {
          return yield* Result.err(
            new EdgeDocumentError({
              _tag: "invalid-kind",
              actual: envelope.kind,
            }),
          );
        }

        const head = yield* decodeHead(yield* requiredSlot(chunks, 0));
        const sources = yield* decodeNodeIdColumn(
          yield* requiredSlot(chunks, 1),
          head.count,
          "sources",
        );
        const targets = yield* decodeNodeIdColumn(
          yield* requiredSlot(chunks, 2),
          head.count,
          "targets",
        );
        const identities = yield* decodeIdentities(
          yield* requiredSlot(chunks, 3),
          head.count,
        );

        let trailer: EdgeDocumentTrailer | null = null;
        if (head.hasTrailer) {
          trailer = yield* decodeTrailer(
            yield* decoder.nextUint8Array(decoder.remaining),
            head.count,
          );
        } else if (decoder.remaining !== 0) {
          return yield* Result.err(
            new EdgeDocumentError({
              _tag: "invalid-field",
              field: "head.hasTrailer",
              detail: "undeclared trailing bytes",
            }),
          );
        }

        return {
          generation: head.generation,
          variant: head.variant,
          count: head.count,
          complete: head.complete,
          sources,
          targets,
          identities,
          trailer,
        };
      }).pipe(
        Result.changeContextIf(
          TaggedError.is("ArrayVisitorError"),
          (error) => new EdgeDocumentError(error.reason),
        ),
        Result.changeContextIf(
          TaggedError.isNot("EdgeDocumentError"),
          () => new EdgeDocumentError({ _tag: "decode" }),
        ),
      ),
    (cause) => Result.err(new EdgeDocumentError({ _tag: "decode" }, { cause })),
  );
