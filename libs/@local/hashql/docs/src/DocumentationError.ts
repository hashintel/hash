import { Array, Option, Schema } from "effect";

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
  UnlinkedName: { code: Schema.String, start: Schema.Finite },
  UnknownParameter: { name: Schema.String, start: Schema.Finite },
  UnknownTypeParameter: { name: Schema.String, start: Schema.Finite },
  UnknownStability: { cause: Schema.ErrorInstance(), start: Schema.Finite },
  DuplicateTag: { tag: Schema.String, start: Schema.Finite },
});

/** A declaration in the package's source: the names the source declares it under, outermost first, with its file and line. A module has no names. */
const Declared = Schema.Struct({
  names: Schema.Array(Schema.String),
  file: Schema.String,
  line: Schema.Finite,
});

/**
 * A comment failure retains its source file and a reason the caller can inspect.
 *
 * `file` is the file the parser read the comment from, which for a package is a copy of its built declarations, and a reason's `start` is an offset into it. `declaration` is what the comment is on in the package's own source, once the generation has found it, and the message then names that.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema constructs the tagged error.
export class DocumentationError extends Schema.TaggedError<DocumentationError>()(
  "DocumentationError",
  {
    file: Schema.String,
    reason: Reason,
    declaration: Schema.optionalKey(Declared),
  },
) {
  /** The offset in `file` that the reason is about, or none for a failure of the configuration. */
  get start(): Option.Option<number> {
    return Reason.match(this.reason, {
      InvalidConfiguration: () => Option.none(),
      InvalidComment: ({ diagnostics }) =>
        Option.map(Array.head(diagnostics), ({ start }) => start),
      InvalidExample: ({ start }) => Option.some(start),
      StrayModuleComment: ({ start }) => Option.some(start),
      ReexportComment: ({ start }) => Option.some(start),
      UnresolvedLink: ({ start }) => Option.some(start),
      UnknownParameter: ({ start }) => Option.some(start),
      UnknownTypeParameter: ({ start }) => Option.some(start),
      UnlinkedName: ({ start }) => Option.some(start),
      UnsupportedReference: ({ start }) => Option.some(start),
      UnknownStability: ({ start }) => Option.some(start),
      DuplicateTag: ({ start }) => Option.some(start),
    });
  }

  /** Where the failure is: the declaration in the package's source, as `eq at src/Operators.ts:12`. Without one, it is the file the parser read the comment from, with the offset in it. */
  get place(): string {
    if (this.declaration !== undefined) {
      const { names, file, line } = this.declaration;
      if (names.length === 0) {
        return `${file}:${line}`;
      }

      return `${names.join(".")} at ${file}:${line}`;
    }

    return Option.match(this.start, {
      onNone: () => this.file,
      onSome: (start) => `${this.file}, offset ${start}`,
    });
  }

  override get message(): string {
    const detail = Reason.match(this.reason, {
      InvalidConfiguration: ({ summary }) => summary,
      InvalidComment: ({ diagnostics }) =>
        diagnostics.map(({ text }) => text).join("; "),
      InvalidExample: () =>
        "Expected one fenced code block with an optional caption",
      StrayModuleComment: () =>
        "The @module comment does not lead its file, so it documents nothing",
      ReexportComment: () =>
        "The comment is on a re-export, which shows the documentation of what it exports, so it documents nothing",
      UnresolvedLink: ({ destination }) =>
        `No declaration for the link to ${destination}`,
      UnknownParameter: ({ name }) =>
        `The @param ${name} names no parameter of a call the reference reads from the declaration it is on. A declaration it reads no call from, such as a type alias, takes no @param`,
      UnknownTypeParameter: ({ name }) =>
        `The @typeParam ${name} names no type parameter of what the comment documents`,
      UnlinkedName: ({ code }) =>
        `The code ${code} names a public declaration that no earlier link in its paragraph points to`,
      UnsupportedReference: ({ destination }) =>
        `The link to ${destination} selects part of a declaration, which a link to a whole declaration cannot keep`,
      UnknownStability: ({ cause }) => `Unknown stability: ${cause}`,
      DuplicateTag: ({ tag }) => `Repeated singleton tag ${tag}`,
    });
    return `${this.place}: ${detail}`;
  }
}
