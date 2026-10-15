/**
 * Recoverable failures while constructing a HashQL program.
 *
 * Each reason identifies a construction failure independently of its diagnostic wording. Parser failures retain their typed causes. {@link Construction} renders the human-readable message and provides constructors for failures shared by builders.
 *
 * @module
 */
import { Data } from "effect";

import type { Cause, Schema, SchemaIssue } from "effect";

interface NameFailure {
  readonly name: string;
  readonly cause: SchemaIssue.Issue;
}

/**
 * A structured explanation of a construction failure, selected by `_tag`.
 *
 * Name and syntax failures retain their parser cause. `CallbackException` retains the original thrown value inside `Cause.UnknownError`. HashQL compiler diagnostics and query execution errors belong to later stages, outside this reason type.
 */
export type Reason =
  | Data.TaggedEnum<{
      /** A declaration name is not a valid HashQL identifier. */
      InvalidBindingName: NameFailure;
      /** An imported name or alias is not a valid HashQL identifier. */
      InvalidImportName: NameFailure;
      /** A query callback parameter name is not a valid HashQL identifier. */
      InvalidParameterName: NameFailure;
      /** A module export name is not a valid HashQL identifier. */
      InvalidExportName: NameFailure;
      /** A module export table has a symbol key rather than a string name. */
      SymbolExportName: { readonly name: symbol };
      /** An explicit input schema has a symbol key rather than a string name. */
      SymbolInputName: { readonly name: symbol };
      /** A syntax value failed J-Expr schema validation. */
      InvalidExpression: { readonly cause: Schema.SchemaError };
      /** A synchronous authoring callback threw a host value. */
      CallbackException: { readonly cause: Cause.UnknownError };
      /** A module path failed path parsing. */
      InvalidModulePath: NameFailure;
      /** A module declaration used a relative path instead of the required absolute path. */
      RelativeModulePath: { readonly name: string };
      /** A generic type's declared arity is not a nonnegative safe integer. */
      InvalidTypeArity: { readonly arity: number };
      /** A type application supplied a different number of arguments from its declared arity. */
      TypeArgumentCount: {
        readonly expected: number;
        readonly received: number;
      };
      /** Structural shorthand received a host constructor outside BigInt, Number, String and Boolean. */
      UnsupportedTypeConstructor: { readonly name: string };
    }>
  /** A generic type constructor lacks its type arguments. */
  | { readonly _tag: "UnspecializedTypeConstructor" }
  /** A Do block has no terminal expression callback. */
  | { readonly _tag: "MissingBlockBody" }
  /** A Do expression callback occupies a position before the last step. */
  | { readonly _tag: "MisplacedBlockBody" }
  /** A Do declaration position contains something other than a supported declaration step. */
  | { readonly _tag: "InvalidBlockStep" }
  /** An authoring body returned something other than an expression handle. */
  | { readonly _tag: "InvalidBodyResult" };

/** Constructors and matching helpers for the tagged {@link Reason} variants. */
export const Reason: Data.TaggedEnum.Constructor<Reason> =
  Data.taggedEnum<Reason>();

const ConstructionBase: ReturnType<
  typeof Data.TaggedError<"ProgramConstructionError">
> = Data.TaggedError("ProgramConstructionError");

/**
 * Failure to construct a program from declarations or expressions.
 *
 * Inspect `reason._tag` for handling and `message` for display. A builder returns this error in a Result, either directly or through later syntax extraction. Error constructors create values without throwing them.
 *
 * @example <caption>Handle an invalid numeric literal.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Expression } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const syntax = Expression.toJExpr(Expression.number(Number.NaN));
 * assert.ok(Result.isFailure(syntax));
 * assert.equal(syntax.failure.reason._tag, "InvalidExpression");
 * ```
 */
export class Construction extends ConstructionBase<{
  readonly reason: Reason;
}> {
  /** Retains the invalid declaration name and its parser issue. */
  static invalidBindingName(
    name: string,
    cause: SchemaIssue.Issue,
  ): Construction {
    return new Construction({
      reason: Reason.InvalidBindingName({ name, cause }),
    });
  }

  /** Identifies an unsupported symbol key in a module's export table. */
  static symbolExportName(name: symbol): Construction {
    return new Construction({ reason: Reason.SymbolExportName({ name }) });
  }

  /** Identifies an unsupported symbol key in an explicit input schema. */
  static symbolInputName(name: symbol): Construction {
    return new Construction({ reason: Reason.SymbolInputName({ name }) });
  }

  /** Retains an arity outside the nonnegative safe-integer range. */
  static invalidTypeArity(arity: number): Construction {
    return new Construction({ reason: Reason.InvalidTypeArity({ arity }) });
  }

  /** Records declared arity and the number of type arguments supplied. */
  static typeArgumentCount(expected: number, received: number): Construction {
    return new Construction({
      reason: Reason.TypeArgumentCount({ expected, received }),
    });
  }

  /** Identifies a host constructor not supported by structural type shorthand. */
  static unsupportedTypeConstructor(name: string): Construction {
    return new Construction({
      reason: Reason.UnsupportedTypeConstructor({ name }),
    });
  }

  /** Reports a generic type constructor used before specialization. */
  static unspecializedTypeConstructor(): Construction {
    return new Construction({ reason: Reason.UnspecializedTypeConstructor() });
  }

  /** Reports a Do block without a terminal expression callback. */
  static missingBlockBody(): Construction {
    return new Construction({ reason: Reason.MissingBlockBody() });
  }

  /** Reports a Do body callback occurring before the last step. */
  static misplacedBlockBody(): Construction {
    return new Construction({ reason: Reason.MisplacedBlockBody() });
  }

  /** Reports an unsupported value in a Do declaration position. */
  static invalidBlockStep(): Construction {
    return new Construction({ reason: Reason.InvalidBlockStep() });
  }

  /** Reports a body result that is not an expression handle. */
  static invalidBodyResult(): Construction {
    return new Construction({ reason: Reason.InvalidBodyResult() });
  }

  /** Retains a synchronous callback exception without replacing its original cause. */
  static callbackException(cause: Cause.UnknownError): Construction {
    return new Construction({ reason: Reason.CallbackException({ cause }) });
  }

  /** Human-readable rendering of the reason. Use the reason's tag rather than this wording for programmatic handling. */
  override get message(): string {
    return Reason.$match(this.reason, {
      InvalidBindingName: ({ name }) =>
        `Invalid HashQL binding name: ${JSON.stringify(name)}`,
      InvalidImportName: ({ name }) =>
        `Invalid HashQL import name: ${JSON.stringify(name)}`,
      InvalidParameterName: ({ name }) =>
        `Invalid HashQL parameter name: ${JSON.stringify(name)}`,
      InvalidExportName: ({ name }) =>
        `Invalid HashQL export name: ${JSON.stringify(name)}`,
      SymbolExportName: ({ name }) =>
        `A HashQL export needs a string name, received ${String(name)}`,
      SymbolInputName: ({ name }) =>
        `A HashQL input needs a string name, received ${String(name)}`,
      InvalidExpression: () =>
        "The expression does not have valid J-Expr structure",
      CallbackException: () => "A program callback threw an exception",
      InvalidModulePath: ({ name }) =>
        `Invalid HashQL module path: ${JSON.stringify(name)}`,
      RelativeModulePath: ({ name }) =>
        `A module declaration needs an absolute HashQL path: ${JSON.stringify(name)}`,
      InvalidTypeArity: ({ arity }) =>
        `A type constructor needs a nonnegative safe integer arity, received ${arity}`,
      TypeArgumentCount: ({ expected, received }) =>
        `Expected ${expected} type arguments, received ${received}`,
      UnsupportedTypeConstructor: ({ name }) =>
        `Unsupported primitive type constructor: ${JSON.stringify(name)}`,
      UnspecializedTypeConstructor: () =>
        "A generic type must be specialized before use",
      MissingBlockBody: () => "A Do block must end with an expression callback",
      MisplacedBlockBody: () =>
        "Only the last step may be an expression callback",
      InvalidBlockStep: () =>
        "A Do block expects declaration steps before its expression callback",
      InvalidBodyResult: () =>
        "An expression callback must return a HashQL expression",
    });
  }
}
