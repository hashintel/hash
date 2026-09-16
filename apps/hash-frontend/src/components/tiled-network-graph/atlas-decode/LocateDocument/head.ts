import * as BinaryEntityId from "../BinaryEntityId";
import * as CborDecoder from "../CborDecoder";
import * as CborPrimitive from "../CborPrimitive";
import * as GenerationId from "../GenerationId";
import * as Result from "../Result";
import * as LocateError from "./error";

import type * as Num from "../Num";

export interface Cell {
  readonly z: Num.u64;
  readonly x: Num.u64;
  readonly y: Num.u64;
}

export interface Head {
  readonly generation: GenerationId.GenerationId;
  readonly variant: Num.u64;
  readonly count: Num.u64;
  readonly zoom: Num.u64;
  readonly cell: Cell;
  readonly edges: Num.u64;
  readonly complete: boolean;
  readonly entityId: BinaryEntityId.BinaryEntityId;
  readonly typeIdsComplete: boolean;
  readonly propertiesComplete: boolean;
}

const cellVisitor: CborDecoder.CborVisitor<
  Cell,
  LocateError.LocateDocumentError
> = {
  expecting: "a [z, x, y] cell",
  visitArray: Result.fn(function* readCell(
    access: CborDecoder.CborArrayAccess,
  ): Result.gen.Return<
    Cell,
    CborDecoder.CborDecoderError | LocateError.LocateDocumentError
  > {
    yield* Result.assert(access.remaining === 3, () =>
      LocateError.LocateDocumentError.invalidLength(
        "head.cell",
        3n,
        access.remaining,
      ),
    );

    const z = yield* access.readElement(CborPrimitive.unsigned);
    const x = yield* access.readElement(CborPrimitive.unsigned);
    const y = yield* access.readElement(CborPrimitive.unsigned);

    return { z, x, y };
  }),
};

const readHead = Result.fn(function* readHead(
  access: CborDecoder.CborMapAccess,
): Result.gen.Return<
  Head,
  | CborDecoder.CborDecoderError
  | BinaryEntityId.BinaryEntityIdError
  | GenerationId.GenerationIdError
  | LocateError.LocateDocumentError
  | Result.All<LocateError.LocateDocumentError>
> {
  const partial: { -readonly [Key in keyof Head]?: Head[Key] } = {};
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
        partial.zoom = yield* access.readValue(CborPrimitive.unsigned);
        break;
      case 4n:
        partial.cell = yield* access.readValue(cellVisitor);
        break;
      case 5n:
        partial.edges = yield* access.readValue(CborPrimitive.unsigned);
        break;
      case 6n:
        partial.complete = yield* access.readValue(CborPrimitive.boolean);
        break;
      case 7n:
        partial.entityId = yield* access.readValue(BinaryEntityId.Visitor);
        break;
      case 8n:
        partial.typeIdsComplete = yield* access.readValue(
          CborPrimitive.boolean,
        );
        break;
      case 9n:
        partial.propertiesComplete = yield* access.readValue(
          CborPrimitive.boolean,
        );
        break;
      default:
        yield* access.readValue(CborPrimitive.ignore);
    }
  }

  const [
    generation,
    variant,
    count,
    zoom,
    cell,
    edges,
    complete,
    entityId,
    typeIdsComplete,
    propertiesComplete,
  ] = yield* Result.all([
    Result.fromNullable(partial.generation, () =>
      LocateError.LocateDocumentError.missing("head.generation"),
    ),
    Result.fromNullable(partial.variant, () =>
      LocateError.LocateDocumentError.missing("head.variant"),
    ),
    Result.fromNullable(partial.count, () =>
      LocateError.LocateDocumentError.missing("head.count"),
    ),
    Result.fromNullable(partial.zoom, () =>
      LocateError.LocateDocumentError.missing("head.zoom"),
    ),
    Result.fromNullable(partial.cell, () =>
      LocateError.LocateDocumentError.missing("head.cell"),
    ),
    Result.fromNullable(partial.edges, () =>
      LocateError.LocateDocumentError.missing("head.edges"),
    ),
    Result.fromNullable(partial.complete, () =>
      LocateError.LocateDocumentError.missing("head.complete"),
    ),
    Result.fromNullable(partial.entityId, () =>
      LocateError.LocateDocumentError.missing("head.entityId"),
    ),
    Result.fromNullable(partial.typeIdsComplete, () =>
      LocateError.LocateDocumentError.missing("head.typeIdsComplete"),
    ),
    Result.fromNullable(partial.propertiesComplete, () =>
      LocateError.LocateDocumentError.missing("head.propertiesComplete"),
    ),
  ]);

  // Row zero supplies the source's point and owns the source properties.
  yield* Result.assert(count > 0n, () =>
    LocateError.LocateDocumentError.invalid(
      "head.count",
      "the source row is missing",
    ),
  );

  return {
    generation,
    variant,
    count,
    zoom,
    cell,
    edges,
    complete,
    entityId,
    typeIdsComplete,
    propertiesComplete,
  };
});

export const decode = (
  bytes: Uint8Array,
): Result.Result<Head, LocateError.LocateDocumentError> =>
  new CborDecoder.CborDecoder(bytes)
    .decode({ expecting: "a locate head", visitMap: readHead })
    .pipe(
      Result.changeContext(() =>
        LocateError.LocateDocumentError.section("head"),
      ),
    );
