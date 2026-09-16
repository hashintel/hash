import { validateVersionedUrl } from "@blockprotocol/type-system";

import * as BinaryEntityId from "./BinaryEntityId";
import * as CborDecoder from "./CborDecoder";
import * as CborPrimitive from "./CborPrimitive";
import * as Envelope from "./Envelope";
import * as GenerationId from "./GenerationId";
import * as NodeId from "./NodeId";
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type * as Decoder from "./Decoder";
import type { VersionedUrl } from "@blockprotocol/type-system";

/** Invalid edges metadata, missing payloads or inconsistent column lengths. */
export type EdgeDocumentErrorReason =
  | {
      readonly _tag: "invalid-kind";
      readonly actual: Envelope.Envelope["kind"];
    }
  | {
      readonly _tag: "unknown-field";
      readonly section: "head" | "trailer";
      readonly key: Decoder.U64;
    }
  | { readonly _tag: "missing-field"; readonly field: string }
  | {
      readonly _tag: "length";
      readonly field: string;
      readonly expected: Decoder.U64;
      readonly actual: number;
    }
  | {
      readonly _tag: "invalid-field";
      readonly field: string;
      readonly detail: string;
    }
  | {
      readonly _tag: "section";
      readonly section: "head" | "columns" | "trailer";
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
      case "section":
        message = `invalid edges ${reason.section}`;
        break;
      case "decode":
        message = "unable to decode edges document";
        break;
    }

    super("EdgeDocumentError", reason, message, options);
  }

  static rejected(section: "head" | "columns" | "trailer"): EdgeDocumentError {
    return new EdgeDocumentError({ _tag: "section", section });
  }

  static missingField(field: string): EdgeDocumentError {
    return new EdgeDocumentError({ _tag: "missing-field", field });
  }

  static invalidField(
    field: string,
    detail = "invalid value",
  ): EdgeDocumentError {
    return new EdgeDocumentError({ _tag: "invalid-field", field, detail });
  }

  static invalidLength(
    field: string,
    expected: Decoder.U64,
    actual: number,
  ): EdgeDocumentError {
    return new EdgeDocumentError({ _tag: "length", field, expected, actual });
  }
}

/** Writable fields during map visitation. */
type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/** Errors propagated before attaching the edges document context. */
type DecodeError =
  | EdgeDocumentError
  | Envelope.EnvelopeError
  | Decoder.DecoderError
  | CborDecoder.CborDecoderError
  | CborPrimitive.ArrayVisitorError
  | GenerationId.GenerationIdError;

/** Per-edge labels and representative types in delivery order. */
export interface EdgeDocumentTrailer {
  readonly typeTable: readonly VersionedUrl[];
  readonly linkLabels: readonly (string | null)[];
  readonly linkTypeIds: readonly (VersionedUrl | null)[];
}

/** Edges metadata with equally sized, borrowed identity columns. */
export interface EdgeDocument<T extends ArrayBufferLike> {
  readonly generation: GenerationId.GenerationId;
  readonly variant: Decoder.U64;
  readonly count: Decoder.U64;
  readonly complete: boolean;
  readonly sources: NodeId.NodeIdColumn<T>;
  readonly targets: NodeId.NodeIdColumn<T>;
  readonly identities: BinaryEntityId.BinaryEntityIdColumn<T>;
  readonly trailer: EdgeDocumentTrailer | null;
}

/** Edges header fields that determine column sizes and trailer presence. */
interface Head {
  readonly generation: GenerationId.GenerationId;
  readonly variant: Decoder.U64;
  readonly count: Decoder.U64;
  readonly complete: boolean;
  readonly hasTrailer: boolean;
}

/** Reads the fields needed to interpret edge columns and the trailer. */
const readHead = Result.fn(function* readHead(
  access: CborDecoder.CborMapAccess,
): Result.gen.Return<Head, DecodeError> {
  const partial: Partial<Mutable<Head>> = {};

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
        partial.count = yield* access.readValue(CborPrimitive.unsigned);
        break;
      case 3n:
        partial.complete = yield* access.readValue(CborPrimitive.boolean);
        break;
      case 4n:
        partial.hasTrailer = yield* access.readValue(CborPrimitive.boolean);
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

  return yield* Result.all([
    Result.fromNullable(partial.generation, () =>
      EdgeDocumentError.missingField("head.generation"),
    ),
    Result.fromNullable(partial.variant, () =>
      EdgeDocumentError.missingField("head.variant"),
    ),
    Result.fromNullable(partial.count, () =>
      EdgeDocumentError.missingField("head.count"),
    ),
    Result.fromNullable(partial.complete, () =>
      EdgeDocumentError.missingField("head.complete"),
    ),
    Result.fromNullable(partial.hasTrailer, () =>
      EdgeDocumentError.missingField("head.hasTrailer"),
    ),
  ]).pipe(
    Result.changeContext(() => EdgeDocumentError.rejected("head")),
    Result.map(([generation, variant, count, complete, hasTrailer]) => ({
      generation,
      variant,
      count,
      complete,
      hasTrailer,
    })),
  );
});

/** Constructs a header or returns a required-field or CBOR error. */
const decodeHead = (bytes: Uint8Array): Result.Result<Head, DecodeError> =>
  new CborDecoder.CborDecoder(bytes).decode({
    expecting: "an edges head",
    visitMap: readHead,
  });

const checkCount = (field: string, expected: Decoder.U64) =>
  Result.filter(
    (column: { readonly length: number }) => BigInt(column.length) === expected,
    (column) => EdgeDocumentError.invalidLength(field, expected, column.length),
  );

/** Borrows a node column or returns invalid storage or a header-count mismatch. */
const decodeNodeIdColumn =
  (count: Decoder.U64, field: string) =>
  <T extends ArrayBufferLike>(bytes: Uint8Array<T>) =>
    NodeId.NodeIdColumn.decode(bytes).pipe(
      Result.changeContext(() =>
        EdgeDocumentError.invalidField(field, "invalid node column width"),
      ),
      checkCount(field, count),
    );

/** Borrows an identity column after validating its width and count. */
const decodeIdentities =
  (count: Decoder.U64) =>
  <T extends ArrayBufferLike>(bytes: Uint8Array<T>) =>
    BinaryEntityId.BinaryEntityIdColumn.decode(bytes).pipe(
      Result.changeContext(() =>
        EdgeDocumentError.invalidField(
          "identities",
          "invalid identity column width",
        ),
      ),
      checkCount("identities", count),
    );

/** Accepts a versioned URL or returns a trailer field error. */
const typeUrlVisitor: CborDecoder.CborVisitor<VersionedUrl, EdgeDocumentError> =
  {
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
const labelVisitor: CborDecoder.CborVisitor<string | null, never> = {
  ...CborPrimitive.nullable(CborPrimitive.text),
  expecting: "a label or null",
};

/** Accepts an intern-table index or its explicit absence. */
const typeIndexVisitor: CborDecoder.CborVisitor<Decoder.U64 | null, never> = {
  ...CborPrimitive.nullable(CborPrimitive.unsigned),
  expecting: "a type index or null",
};

/** Reads edge detail and resolves its interned type references. */
const visitTrailer = (count: Decoder.U64) =>
  Result.fn(function* decodeTrailer(
    access: CborDecoder.CborMapAccess,
  ): Result.gen.Return<EdgeDocumentTrailer, DecodeError> {
    let types: VersionedUrl[] | undefined;
    let labels: (string | null)[] | undefined;
    let indexes: (Decoder.U64 | null)[] | undefined;

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
            CborPrimitive.array(typeIndexVisitor, "trailer.linkTypeIds", count),
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

    const [typeTable, linkLabels, typeIndexes] = yield* Result.all([
      Result.fromNullable(types, () =>
        EdgeDocumentError.missingField("trailer.typeTable"),
      ),
      Result.fromNullable(labels, () =>
        EdgeDocumentError.missingField("trailer.linkLabels"),
      ),
      Result.fromNullable(indexes, () =>
        EdgeDocumentError.missingField("trailer.linkTypeIds"),
      ),
    ]).pipe(Result.changeContext(() => EdgeDocumentError.rejected("trailer")));

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
  });

/** Constructs trailer detail or returns a schema, reference or CBOR error. */
const decodeTrailer = (
  bytes: Uint8Array,
  count: Decoder.U64,
): Result.Result<EdgeDocumentTrailer, DecodeError> =>
  new CborDecoder.CborDecoder(bytes).decode({
    expecting: "an edges trailer",
    visitMap: visitTrailer(count),
  });

export interface DecodeOptions {
  readonly generation: GenerationId.GenerationId;
  readonly variant: Decoder.U64;
}

/** Assembles the envelope's edge columns with their decoded metadata. */
const decodeDocument = Result.fn(function* decodeDocument<
  T extends ArrayBufferLike,
>(
  decoder: Decoder.Decoder<T>,
  { generation: expectedGeneration, variant: expectedVariant }: DecodeOptions,
): Result.gen.Return<EdgeDocument<T>, DecodeError> {
  const [envelope, chunks] = yield* Envelope.decode(decoder);

  if (envelope.kind !== "SALTILEE") {
    return yield* Result.err(
      new EdgeDocumentError({
        _tag: "invalid-kind",
        actual: envelope.kind,
      }),
    );
  }

  const head = yield* decodeHead(yield* Envelope.indexChunk(chunks, 0));

  const [sources, targets, identities] = yield* Result.all([
    Envelope.indexChunk(chunks, 1).pipe(
      Result.andThen(decodeNodeIdColumn(head.count, "sources")),
    ),
    Envelope.indexChunk(chunks, 2).pipe(
      Result.andThen(decodeNodeIdColumn(head.count, "targets")),
    ),
    Envelope.indexChunk(chunks, 3).pipe(
      Result.andThen(decodeIdentities(head.count)),
    ),
  ]).pipe(Result.changeContext(() => EdgeDocumentError.rejected("columns")));

  let trailer: EdgeDocumentTrailer | null = null;
  if (head.hasTrailer) {
    const bytes = yield* decoder.nextUint8Array(decoder.remaining);

    trailer = yield* decodeTrailer(bytes, head.count);
  } else if (decoder.remaining !== 0) {
    return yield* Result.err(
      new EdgeDocumentError({
        _tag: "invalid-field",
        field: "head.hasTrailer",
        detail: "undeclared trailing bytes",
      }),
    );
  }

  yield* Result.assert(head.generation.equals(expectedGeneration), () =>
    EdgeDocumentError.invalidField(
      "head.generation",
      `expected ${expectedGeneration}, received ${head.generation}`,
    ),
  );
  yield* Result.assert(head.variant === expectedVariant, () =>
    EdgeDocumentError.invalidField(
      "head.variant",
      `expected ${expectedVariant}, received ${head.variant}`,
    ),
  );

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
});

/**
 * Decodes an edges response into metadata, identity columns and optional detail.
 *
 * Columns and generation bytes borrow the input. Keep its buffer attached and unchanged while using the document. The response must match the requested generation and variant in {@link DecodeOptions}.
 *
 * @returns The complete document or an {@link EdgeDocumentError}. Independent validation failures appear in a {@link Result.All} under a section error's cause. Underlying errors and unexpected exceptions retain their causes. Cursor reads stop at their first failure, which may advance the decoder.
 */
export const decode = <T extends ArrayBufferLike>(
  decoder: Decoder.Decoder<T>,
  options: DecodeOptions,
): Result.Result<EdgeDocument<T>, EdgeDocumentError> =>
  Result.catch(
    () => decodeDocument(decoder, options),
    (cause) => Result.err(new EdgeDocumentError({ _tag: "decode" }, { cause })),
  ).pipe(
    Result.changeContextIf(
      TaggedError.is("ArrayVisitorError"),
      (error) => new EdgeDocumentError(error.reason),
    ),
    Result.changeContextIf(
      TaggedError.isNot("EdgeDocumentError"),
      () => new EdgeDocumentError({ _tag: "decode" }),
    ),
  );
