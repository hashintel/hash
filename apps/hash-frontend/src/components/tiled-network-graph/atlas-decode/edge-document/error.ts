import * as TaggedError from "../tagged-error";

import type * as Detail from "../detail";
import type * as Envelope from "../envelope";
import type * as GenerationId from "../generation-id";
import type * as Num from "../num";

/** Document sections that group independent validation failures. */
export type Section = "head" | "columns" | "trailer" | "request";

/** Invalid edges metadata, payloads, column lengths or request echoes. */
export type EdgeDocumentErrorReason =
  | {
      readonly _tag: "invalid-kind";
      readonly actual: Envelope.Envelope["kind"];
    }
  | {
      readonly _tag: "unknown-field";
      readonly section: "head" | "trailer";
      readonly key: Num.u64;
    }
  | { readonly _tag: "missing-field"; readonly field: string }
  | {
      readonly _tag: "length";
      readonly field: string;
      readonly expected: Num.u64;
      readonly actual: number;
    }
  | {
      readonly _tag: "invalid-field";
      readonly field: string;
      readonly detail: string;
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
  | {
      readonly _tag: "detail-mismatch";
      readonly expected: Detail.Detail;
      readonly actual: Detail.Detail;
    }
  | { readonly _tag: "section"; readonly section: Section }
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
      case "generation-mismatch":
        message = `expected generation ${reason.expected}, received ${reason.actual}`;
        break;
      case "variant-mismatch":
        message = `expected variant ${reason.expected}, received ${reason.actual}`;
        break;
      case "detail-mismatch":
        message = `expected detail ${reason.expected}, received ${reason.actual}`;
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

  static generationMismatch(
    expected: GenerationId.GenerationId,
    actual: GenerationId.GenerationId,
  ): EdgeDocumentError {
    return new EdgeDocumentError({
      _tag: "generation-mismatch",
      expected,
      actual,
    });
  }

  static variantMismatch(
    expected: Num.u64,
    actual: Num.u64,
  ): EdgeDocumentError {
    return new EdgeDocumentError({
      _tag: "variant-mismatch",
      expected,
      actual,
    });
  }

  static detailMismatch(
    expected: Detail.Detail,
    actual: Detail.Detail,
  ): EdgeDocumentError {
    return new EdgeDocumentError({ _tag: "detail-mismatch", expected, actual });
  }

  static rejected(section: Section): EdgeDocumentError {
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
    expected: Num.u64,
    actual: number,
  ): EdgeDocumentError {
    return new EdgeDocumentError({ _tag: "length", field, expected, actual });
  }
}
