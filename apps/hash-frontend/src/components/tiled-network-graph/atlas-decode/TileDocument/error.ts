import * as TaggedError from "../TaggedError";

import type * as CborDecoder from "../CborDecoder";
import type * as CborPrimitive from "../CborPrimitive";
import type * as Decoder from "../Decoder";
import type * as Envelope from "../Envelope";
import type * as GenerationId from "../GenerationId";

/** Document sections that group independent validation failures. */
export type Section = "slot" | "columns" | "head" | "trailer";

/** Invalid tile metadata, missing payloads, or columns the head does not describe. */
export type TileDocumentErrorReason =
  | {
      readonly _tag: "invalid-kind";
      readonly actual: Envelope.Envelope["kind"];
    }
  | { readonly _tag: "unexpected-slot"; readonly slot: number }
  | {
      readonly _tag: "unknown-field";
      readonly section: "global" | "head" | "trailer";
      readonly key: Decoder.U64;
    }
  | { readonly _tag: "missing-field"; readonly field: string }
  | {
      readonly _tag: "length";
      readonly field: string;
      readonly expected: bigint;
      readonly actual: number;
    }
  | {
      readonly _tag: "run-sum";
      readonly expected: bigint;
      readonly actual: bigint;
    }
  | {
      readonly _tag: "invalid-field";
      readonly field: string;
      readonly detail: string;
    }
  | {
      readonly _tag: "invalid-context";
      readonly field: string;
      readonly value: number;
    }
  /** Independent failures retained as an aggregate in the section error's cause. */
  | { readonly _tag: "section"; readonly section: Section }
  | { readonly _tag: "decode" };

/** A tile document failure with its structured reason and optional cause. */
export class TileDocumentError extends TaggedError.TaggedError<
  "TileDocumentError",
  TileDocumentErrorReason
> {
  /** Describes a rejected field, payload, or nested decoding failure. */
  constructor(reason: TileDocumentErrorReason, options?: ErrorOptions) {
    let message: string;

    switch (reason._tag) {
      case "invalid-kind":
        message = `expected SALTILET, received ${reason.actual}`;
        break;
      case "unexpected-slot":
        message = `tile slot ${reason.slot} is present`;
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
      case "run-sum":
        message = `bucket runs describe ${reason.actual} rows, received ${reason.expected}`;
        break;
      case "invalid-field":
        message = `${reason.field}: ${reason.detail}`;
        break;
      case "invalid-context":
        message = `${reason.field} must be a nonnegative safe integer, received ${reason.value}`;
        break;
      case "section":
        message = `${reason.section} checks failed`;
        break;
      case "decode":
        message = "unable to decode tile document";
        break;
    }

    super("TileDocumentError", reason, message, options);
  }

  static rejected(section: Section): TileDocumentError {
    return new TileDocumentError({ _tag: "section", section });
  }

  static missingField(field: string): TileDocumentError {
    return new TileDocumentError({ _tag: "missing-field", field });
  }

  static invalidField(
    field: string,
    detail = "invalid value",
  ): TileDocumentError {
    return new TileDocumentError({ _tag: "invalid-field", field, detail });
  }

  static invalidLength(
    field: string,
    expected: bigint,
    actual: number,
  ): TileDocumentError {
    return new TileDocumentError({ _tag: "length", field, expected, actual });
  }

  static unexpectedSlot(slot: number): TileDocumentError {
    return new TileDocumentError({ _tag: "unexpected-slot", slot });
  }
}

/** Errors propagated before attaching the tile document context. */
export type DecodeError =
  | TileDocumentError
  | Envelope.EnvelopeError
  | Decoder.DecoderError
  | CborDecoder.CborDecoderError
  | CborPrimitive.ArrayVisitorError
  | GenerationId.GenerationIdError;
