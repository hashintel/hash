import { Data } from "effect";

import type { Cause, Schema } from "effect";
import type { PlatformError } from "effect/PlatformError";

/** Why building the reference pages failed. */
export type Reason = Data.TaggedEnum<{
  /** Reading or writing a file failed. */
  FileSystem: { readonly cause: PlatformError };
  /** Oxc rejected a module that a page draws on. */
  SourceSyntax: { readonly file: string; readonly messages: readonly string[] };
  /** A declaration map does not name the source TypeScript emitted its file from. */
  MalformedSourceMap: {
    readonly file: string;
    readonly cause: Schema.SchemaError;
  };
  /** API Extractor could not load the API model the analysis wrote. */
  UnreadableModel: {
    readonly file: string;
    readonly cause: Cause.UnknownError;
  };
  /** The analysis output lacks something a page needs. */
  MalformedAnalysis: { readonly detail: string };
  /** A documentation comment uses TSDoc syntax the pages have no rendering for. */
  UnsupportedComment: { readonly kind: string };
  /** A signature block's meta holds a `links` attribute that the transform did not write. */
  UnreadableCodeBlock: {
    readonly cause: Schema.SchemaError | Cause.UnknownError;
  };
  /** A signature block's code refers to a different number of names than its links cover. */
  MisalignedCodeBlock: { readonly references: number; readonly links: number };
}>;

/** Constructors and matching helpers for the tagged {@link Reason} variants. */
export const Reason: Data.TaggedEnum.Constructor<Reason> =
  Data.taggedEnum<Reason>();

const TransformErrorBase: ReturnType<
  typeof Data.TaggedError<"TransformError">
> = Data.TaggedError("TransformError");

/** Failure to build the reference pages from an analysis. `reason` names the input at fault. */
export class TransformError extends TransformErrorBase<{
  readonly reason: Reason;
}> {
  static readonly fileSystem = (cause: PlatformError): TransformError =>
    new TransformError({ reason: Reason.FileSystem({ cause }) });

  static readonly sourceSyntax = (
    file: string,
    messages: readonly string[],
  ): TransformError =>
    new TransformError({ reason: Reason.SourceSyntax({ file, messages }) });

  static readonly malformedSourceMap = (
    file: string,
    cause: Schema.SchemaError,
  ): TransformError =>
    new TransformError({ reason: Reason.MalformedSourceMap({ file, cause }) });

  static readonly unreadableModel = (
    file: string,
    cause: Cause.UnknownError,
  ): TransformError =>
    new TransformError({ reason: Reason.UnreadableModel({ file, cause }) });

  static readonly malformedAnalysis = (detail: string): TransformError =>
    new TransformError({ reason: Reason.MalformedAnalysis({ detail }) });

  static readonly unsupportedComment = (kind: string): TransformError =>
    new TransformError({ reason: Reason.UnsupportedComment({ kind }) });

  static readonly unreadableCodeBlock = (
    cause: Schema.SchemaError | Cause.UnknownError,
  ): TransformError =>
    new TransformError({ reason: Reason.UnreadableCodeBlock({ cause }) });

  static readonly misalignedCodeBlock = (
    references: number,
    links: number,
  ): TransformError =>
    new TransformError({
      reason: Reason.MisalignedCodeBlock({ references, links }),
    });

  override get message(): string {
    return Reason.$match(this.reason, {
      FileSystem: ({ cause }) => cause.message,
      SourceSyntax: ({ file, messages }) =>
        `${file} does not parse: ${messages.join("; ")}`,
      MalformedSourceMap: ({ file, cause }) => `${file}: ${cause.message}`,
      UnreadableModel: ({ file, cause }) => `${file}: ${cause.message}`,
      MalformedAnalysis: ({ detail }) => detail,
      UnsupportedComment: ({ kind }) =>
        `Documentation comments use ${kind}, which the reference pages cannot render`,
      UnreadableCodeBlock: ({ cause }) =>
        `A signature block's links do not decode: ${cause.message}`,
      MisalignedCodeBlock: ({ references, links }) =>
        `A signature block's code refers to ${references} names, but its links cover ${links}`,
    });
  }
}
