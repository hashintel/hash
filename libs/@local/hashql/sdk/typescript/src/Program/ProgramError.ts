/**
 * Recoverable failures while constructing a HashQL program.
 *
 * Each reason identifies a construction failure independently of its diagnostic wording. Parser failures retain their typed causes. {@link Construction} renders the human-readable message and provides constructors for failures shared by builders.
 *
 * @module
 */
import { Cause, Schema, SchemaIssue } from "effect";

const Issue = Schema.declare(SchemaIssue.isIssue);

/**
 * A structured explanation of a construction failure, selected by `_tag`.
 *
 * Name and syntax failures retain their parser cause. `CallbackException` retains the original thrown value inside `Cause.UnknownError`. HashQL compiler diagnostics and query execution errors belong to later stages, outside this reason type.
 */
export const Reason = Schema.TaggedUnion({
  /** A declaration name is not a valid HashQL identifier. */
  InvalidBindingName: { name: Schema.String, cause: Issue },
  /** A struct or struct type names a field that an earlier field already names, such as `+` after `` `+` ``. `name` is the later spelling. */
  DuplicateStructField: { name: Schema.String },
  /** An imported name or alias is not a valid HashQL identifier. */
  InvalidImportName: { name: Schema.String, cause: Issue },
  /** A query callback parameter name is not a valid HashQL identifier. */
  InvalidParameterName: { name: Schema.String, cause: Issue },
  /** A module export name is not a valid HashQL identifier. */
  InvalidExportName: { name: Schema.String, cause: Issue },
  /** A syntax value failed J-Expr schema validation. */
  InvalidExpression: { cause: Issue },
  /** A synchronous authoring callback threw a host value. */
  CallbackException: { cause: Schema.instanceOf(Cause.UnknownError) },
  /** A module path failed path parsing. */
  InvalidModulePath: { path: Schema.String, cause: Issue },
  /** A module declaration used a relative path instead of the required absolute path. */
  RelativeModulePath: { path: Schema.String },
  /** A generic type's declared arity is not a nonnegative safe integer. */
  InvalidTypeArity: {
    // oxlint-disable-next-line effecttsgo/schema-number -- this error must retain rejected NaN and infinite arities
    arity: Schema.Number,
  },
  /** A type application supplied a different number of arguments from its declared arity. */
  TypeArgumentCountMismatch: {
    expected: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
    received: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  },
  /** Structural shorthand received a host constructor outside BigInt, Number, String and Boolean. */
  UnsupportedTypeConstructor: { name: Schema.String },
  /** A generic type constructor lacks its type arguments. */
  UnspecializedTypeConstructor: {},
  /** An authoring body returned something other than an expression handle. */
  InvalidBodyResult: {},
});

/**
 * Failure to construct a program from declarations or expressions.
 *
 * Inspect `reason._tag` for handling and `message` for display. A builder returns this error in a Result, either directly or through later syntax extraction. Error constructors create values without throwing them.
 *
 * @example <caption>Handle an invalid generic arity.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { TypeExpression } = Program;
 * const path = Result.getOrThrow(JExpr.Path.decodeResult("::example::List"));
 * const declaration = TypeExpression.constructor<Type.TypeConstructor>(path, -1);
 * assert.ok(Result.isFailure(declaration));
 * assert.equal(declaration.failure.reason._tag, "InvalidTypeArity");
 * ```
 */
// oxlint-disable-next-line unicorn/throw-new-error -- false positive
export class Construction extends Schema.TaggedError<Construction>()(
  "ProgramError/Construction",
  { reason: Reason },
) {
  /** Retains the invalid declaration name and its parser issue. */
  static invalidBindingName(
    name: string,
    cause: SchemaIssue.Issue,
  ): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "InvalidBindingName", name, cause }),
    });
  }

  /** Retains the field name whose decoded identifier repeats an earlier field. */
  static duplicateStructField(name: string): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "DuplicateStructField", name }),
    });
  }

  /** Retains the schema issue for invalid J-Expr syntax. */
  static invalidExpression(cause: SchemaIssue.Issue): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "InvalidExpression", cause }),
    });
  }

  /** Retains the invalid imported name or alias and its parser issue. */
  static invalidImportName(
    name: string,
    cause: SchemaIssue.Issue,
  ): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "InvalidImportName", name, cause }),
    });
  }

  /** Retains the invalid module export name and its parser issue. */
  static invalidExportName(
    name: string,
    cause: SchemaIssue.Issue,
  ): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "InvalidExportName", name, cause }),
    });
  }

  /** Retains the invalid module path and its parser issue. */
  static invalidModulePath(
    path: string,
    cause: SchemaIssue.Issue,
  ): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "InvalidModulePath", path, cause }),
    });
  }

  /** Identifies a module path that is not absolute. */
  static relativeModulePath(path: string): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "RelativeModulePath", path }),
    });
  }

  /** Retains an arity outside the non-negative safe-integer range. */
  static invalidTypeArity(arity: number): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "InvalidTypeArity", arity }),
    });
  }

  /** Records declared arity and the number of type arguments supplied. */
  static typeArgumentCount(expected: number, received: number): Construction {
    return Construction.make({
      reason: Reason.make({
        _tag: "TypeArgumentCountMismatch",
        expected,
        received,
      }),
    });
  }

  /** Identifies a host constructor not supported by structural type shorthand. */
  static unsupportedTypeConstructor(name: string): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "UnsupportedTypeConstructor", name }),
    });
  }

  /** Reports a generic type constructor used before specialization. */
  static unspecializedTypeConstructor(): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "UnspecializedTypeConstructor" }),
    });
  }

  /** Reports a body result that is not an expression handle. */
  static invalidBodyResult(): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "InvalidBodyResult" }),
    });
  }

  /** Retains a synchronous callback exception without replacing its original cause. */
  static callbackException(cause: Cause.UnknownError): Construction {
    return Construction.make({
      reason: Reason.make({ _tag: "CallbackException", cause }),
    });
  }

  /** The underlying failure retained by the reason, if it has one. */
  override get cause(): Cause.UnknownError | SchemaIssue.Issue | undefined {
    return "cause" in this.reason ? this.reason.cause : undefined;
  }

  /** Human-readable rendering of the reason. Use the reason's tag rather than this wording for programmatic handling. */
  override get message(): string {
    return Reason.match(this.reason, {
      InvalidBindingName: ({ name }) =>
        `Invalid HashQL binding name: ${JSON.stringify(name)}`,
      DuplicateStructField: ({ name }) =>
        `Duplicate HashQL struct field: ${JSON.stringify(name)}`,
      InvalidImportName: ({ name }) =>
        `Invalid HashQL import name: ${JSON.stringify(name)}`,
      InvalidParameterName: ({ name }) =>
        `Invalid HashQL parameter name: ${JSON.stringify(name)}`,
      InvalidExportName: ({ name }) =>
        `Invalid HashQL export name: ${JSON.stringify(name)}`,
      InvalidExpression: () =>
        "The expression does not have valid J-Expr structure",
      CallbackException: () => "A program callback threw an exception",
      InvalidModulePath: ({ path }) =>
        `Invalid HashQL module path: ${JSON.stringify(path)}`,
      RelativeModulePath: ({ path }) =>
        `A module declaration needs an absolute HashQL path: ${JSON.stringify(path)}`,
      InvalidTypeArity: ({ arity }) =>
        `A type constructor needs a nonnegative safe integer arity, received ${arity}`,
      TypeArgumentCountMismatch: ({ expected, received }) =>
        `Expected ${expected} type arguments, received ${received}`,
      UnsupportedTypeConstructor: ({ name }) =>
        `Unsupported primitive type constructor: ${JSON.stringify(name)}`,
      UnspecializedTypeConstructor: () =>
        "A generic type must be specialized before use",
      InvalidBodyResult: () =>
        "An expression callback must return a HashQL expression",
    });
  }
}
