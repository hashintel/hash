import { Schema } from "effect";

const Reason = Schema.TaggedUnion({
  MissingModule: { file: Schema.String },
  MissingSource: { file: Schema.String },
  MissingDeclaration: { name: Schema.String },
  UnsupportedDeclaration: {
    name: Schema.String,
    kinds: Schema.Array(Schema.String),
  },
  UnsupportedMerge: { name: Schema.String, kinds: Schema.Array(Schema.String) },
  UnresolvedReference: { file: Schema.String, text: Schema.String },
  UnreservedReference: { name: Schema.String, owner: Schema.String },
});

/** Parsing stops for missing or unsupported declaration input. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema constructs the tagged error.
export class ParseError extends Schema.TaggedError<ParseError>()("ParseError", {
  reason: Reason,
}) {
  override get message(): string {
    return Reason.match(this.reason, {
      MissingModule: ({ file }) => `No module symbol for ${file}`,
      MissingSource: ({ file }) => `No source file at the root ${file}`,
      MissingDeclaration: ({ name }) => `No source declaration for ${name}`,
      UnsupportedDeclaration: ({ name, kinds }) =>
        `Unsupported declaration ${name}: ${kinds.join(", ")}`,
      UnsupportedMerge: ({ name, kinds }) =>
        `Unsupported merge for ${name}: ${kinds.join(", ")}`,
      UnresolvedReference: ({ file, text }) =>
        `Unresolved reference ${text} in ${file}`,
      UnreservedReference: ({ name, owner }) =>
        `Reference to ${name} before ${owner} reserved its node`,
    });
  }
}

/** An entrypoint's file has no module symbol. */
export const missingModule = (fields: { readonly file: string }): ParseError =>
  ParseError.make({ reason: { _tag: "MissingModule", ...fields } });

/** The program holds no source file at a root it was given. */
export const missingSource = (fields: { readonly file: string }): ParseError =>
  ParseError.make({ reason: { _tag: "MissingSource", ...fields } });

/** A symbol has no declaration in the program's sources. */
export const missingDeclaration = (fields: {
  readonly name: string;
}): ParseError =>
  ParseError.make({ reason: { _tag: "MissingDeclaration", ...fields } });

/** A declaration is of a kind the AST does not model. */
export const unsupportedDeclaration = (fields: {
  readonly name: string;
  readonly kinds: readonly string[];
}): ParseError =>
  ParseError.make({ reason: { _tag: "UnsupportedDeclaration", ...fields } });

/** Declarations merge into one symbol in a combination the AST does not model. */
export const unsupportedMerge = (fields: {
  readonly name: string;
  readonly kinds: readonly string[];
}): ParseError =>
  ParseError.make({ reason: { _tag: "UnsupportedMerge", ...fields } });

/** A name refers to a symbol inside a declaration the parse is still building, before that declaration reserved the symbol's node. */
export const unreservedReference = (fields: {
  readonly name: string;
  readonly owner: string;
}): ParseError =>
  ParseError.make({ reason: { _tag: "UnreservedReference", ...fields } });

/** A name the AST must resolve has no symbol. */
export const unresolvedReference = (fields: {
  readonly file: string;
  readonly text: string;
}): ParseError =>
  ParseError.make({ reason: { _tag: "UnresolvedReference", ...fields } });
