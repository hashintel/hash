import { Schema } from "effect";

const Reason = Schema.TaggedUnion({
  InvalidConfiguration: { file: Schema.String, summary: Schema.String },
  InvalidComment: {
    diagnostics: Schema.Array(
      Schema.Struct({
        messageId: Schema.String,
        text: Schema.String,
        start: Schema.Finite,
        end: Schema.Finite,
      }),
    ),
  },
  InvalidExample: { start: Schema.Finite },
  StrayModuleComment: { start: Schema.Finite },
  ReexportComment: { start: Schema.Finite },
  UnresolvedLink: { destination: Schema.String, start: Schema.Finite },
  UnsupportedReference: { destination: Schema.String, start: Schema.Finite },
  UnknownParameter: { name: Schema.String, start: Schema.Finite },
  UnknownTypeParameter: { name: Schema.String, start: Schema.Finite },
  UnknownStability: { cause: Schema.ErrorInstance() },
  DuplicateTag: { tag: Schema.String },
});

/** A comment failure retains its source file and a reason the caller can inspect. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema constructs the tagged error.
export class DocumentationError extends Schema.TaggedError<DocumentationError>()(
  "DocumentationError",
  {
    file: Schema.String,
    reason: Reason,
  },
) {
  override get message(): string {
    const detail = Reason.match(this.reason, {
      InvalidConfiguration: ({ summary }) => summary,
      InvalidComment: ({ diagnostics }) =>
        diagnostics.map(({ text }) => text).join("; "),
      InvalidExample: ({ start }) =>
        `Expected one fenced code block with an optional caption at ${start}`,
      StrayModuleComment: ({ start }) =>
        `The @module comment at ${start} does not lead its file, so it documents nothing`,
      ReexportComment: ({ start }) =>
        `The comment at ${start} is on a re-export, which shows the documentation of what it exports, so it documents nothing`,
      UnresolvedLink: ({ destination, start }) =>
        `No declaration for the link to ${destination} at ${start}`,
      UnknownParameter: ({ name, start }) =>
        `The @param ${name} at ${start} names no parameter of what the comment documents`,
      UnknownTypeParameter: ({ name, start }) =>
        `The @typeParam ${name} at ${start} names no type parameter of what the comment documents`,
      UnsupportedReference: ({ destination, start }) =>
        `The link to ${destination} at ${start} selects part of a declaration, which a link to a whole declaration cannot keep`,
      UnknownStability: ({ cause }) => `Unknown stability: ${cause}`,
      DuplicateTag: ({ tag }) => `Repeated singleton tag ${tag}`,
    });
    return `${this.file}: ${detail}`;
  }
}
