import * as CborDecoder from "../cbor-decoder";
import * as CborPrimitive from "../cbor-primitive";
import * as Result from "../result";
import * as TileError from "./error";

import type * as Num from "../num";

/** Per-point labels and icons in delivered order. */
export interface TileDocumentTrailer {
  /** Null marks a point whose label source carries an empty label. */
  readonly labels: readonly (string | null)[];
  /** Null marks a point for which no declared icon resolves. */
  readonly icons: readonly (string | null)[];
}

const readTrailer = Result.fn(function* readTrailer(
  access: CborDecoder.CborMapAccess,
  delivered: Num.u64,
): Result.gen.Return<TileDocumentTrailer, TileError.DecodeError> {
  let labels: (string | null)[] | undefined;
  let icons: (string | null)[] | undefined;

  while (access.remaining > 0) {
    const key = yield* access.readKey();
    switch (key) {
      case 0n:
        labels = yield* access.readValue(
          CborPrimitive.array(
            CborPrimitive.nullable(CborPrimitive.text),
            "trailer.labels",
            delivered,
          ),
        );

        break;
      case 1n:
        icons = yield* access.readValue(
          CborPrimitive.array(
            CborPrimitive.nullable(CborPrimitive.text),
            "trailer.icons",
            delivered,
          ),
        );

        break;
      default:
        return yield* Result.err(
          new TileError.TileDocumentError({
            _tag: "unknown-field",
            section: "trailer",
            key,
          }),
        );
    }
  }

  return yield* Result.all([
    Result.fromNullable(labels, () =>
      TileError.TileDocumentError.missingField("trailer.labels"),
    ),
    Result.fromNullable(icons, () =>
      TileError.TileDocumentError.missingField("trailer.icons"),
    ),
  ]).pipe(
    Result.changeContext(() => TileError.TileDocumentError.rejected("trailer")),
    Result.map(([labelColumn, iconColumn]) => ({
      labels: labelColumn,
      icons: iconColumn,
    })),
  );
});

/** Constructs trailer detail or returns a schema or CBOR error. */
export const decode = (
  bytes: Uint8Array,
  delivered: Num.u64,
): Result.Result<TileDocumentTrailer, TileError.DecodeError> =>
  new CborDecoder.CborDecoder(bytes).decode({
    expecting: "a tile trailer",
    visitMap: (access) => readTrailer(access, delivered),
  });
