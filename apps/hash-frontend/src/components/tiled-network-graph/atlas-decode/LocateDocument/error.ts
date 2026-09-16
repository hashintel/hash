import * as TaggedError from "../TaggedError";

import type * as GenerationId from "../GenerationId";
import type * as Num from "../Num";

export type LocateDocumentErrorReason =
  | { readonly _tag: "decode" }
  | { readonly _tag: "missing-field"; readonly field: string }
  | {
      readonly _tag: "invalid-field";
      readonly field: string;
      readonly detail: string;
    }
  | {
      readonly _tag: "length";
      readonly field: string;
      readonly expected: bigint;
      readonly actual: number;
    }
  | {
      readonly _tag: "generation-mismatch";
      readonly expected: GenerationId.GenerationId;
      readonly actual: GenerationId.GenerationId;
    }
  | {
      readonly _tag: "variant-mismatch";
      readonly expected: Num.u64;
      readonly actual: Num.u64;
    }
  | { readonly _tag: "section"; readonly section: string };

/** A locate failure whose causes retain independent decoding errors. */
export class LocateDocumentError extends TaggedError.TaggedError<
  "LocateDocumentError",
  LocateDocumentErrorReason
> {
  private constructor(
    reason: LocateDocumentErrorReason,
    options?: ErrorOptions,
  ) {
    let message: string;
    switch (reason._tag) {
      case "decode":
        message = "invalid locate document";
        break;
      case "section":
        message = `invalid locate ${reason.section}`;
        break;
      case "generation-mismatch":
        message = `locate generation ${reason.actual.toString()} differs from requested ${reason.expected.toString()}`;
        break;
      case "variant-mismatch":
        message = `locate variant ${reason.actual} differs from requested ${reason.expected}`;
        break;
      case "missing-field":
        message = `missing locate ${reason.field}`;
        break;
      case "invalid-field":
        message = `invalid locate ${reason.field}: ${reason.detail}`;
        break;
      case "length":
        message = `${reason.field} requires ${reason.expected} entries, received ${reason.actual}`;
        break;
    }
    super("LocateDocumentError", reason, message, options);
  }

  static decoding(cause: unknown): LocateDocumentError {
    return new LocateDocumentError({ _tag: "decode" }, { cause });
  }

  static missing(field: string): LocateDocumentError {
    return new LocateDocumentError({ _tag: "missing-field", field });
  }

  static invalid(field: string, detail: string): LocateDocumentError {
    return new LocateDocumentError({ _tag: "invalid-field", field, detail });
  }

  static invalidLength(
    field: string,
    expected: bigint,
    actual: number,
  ): LocateDocumentError {
    return new LocateDocumentError({ _tag: "length", field, expected, actual });
  }

  static generationMismatch(
    expected: GenerationId.GenerationId,
    actual: GenerationId.GenerationId,
  ): LocateDocumentError {
    return new LocateDocumentError({
      _tag: "generation-mismatch",
      expected,
      actual,
    });
  }

  static variantMismatch(
    expected: Num.u64,
    actual: Num.u64,
  ): LocateDocumentError {
    return new LocateDocumentError({
      _tag: "variant-mismatch",
      expected,
      actual,
    });
  }

  static section(section: string): LocateDocumentError {
    return new LocateDocumentError({ _tag: "section", section });
  }
}
