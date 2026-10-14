/**
 * Recoverable failures while constructing a HashQL program.
 *
 * Each reason identifies a construction failure independently of its diagnostic wording. Parser failures retain their typed causes. {@link Construction} renders the human-readable message and provides constructors for failures shared by builders.
 *
 * @module
 */
import { Data } from "effect";

import type { Schema, SchemaIssue } from "effect";

interface NameFailure {
  readonly name: string;
  readonly cause: SchemaIssue.Issue;
}

export type Reason =
  | Data.TaggedEnum<{
      InvalidBindingName: NameFailure;
      InvalidImportName: NameFailure;
      InvalidParameterName: NameFailure;
      InvalidExportName: NameFailure;
      InvalidExpression: { readonly cause: Schema.SchemaError };
      InvalidModulePath: NameFailure;
      RelativeModulePath: { readonly name: string };
      InvalidTypeArity: { readonly arity: number };
      TypeArgumentCount: {
        readonly expected: number;
        readonly received: number;
      };
      UnsupportedTypeConstructor: { readonly name: string };
    }>
  | { readonly _tag: "UnspecializedTypeConstructor" }
  | { readonly _tag: "MissingBlockBody" }
  | { readonly _tag: "MisplacedBlockBody" }
  | { readonly _tag: "InvalidBlockStep" }
  | { readonly _tag: "InvalidBodyResult" };

export const Reason: Data.TaggedEnum.Constructor<Reason> =
  Data.taggedEnum<Reason>();

const ConstructionBase: ReturnType<
  typeof Data.TaggedError<"ProgramConstructionError">
> = Data.TaggedError("ProgramConstructionError");

/** Failure to construct a program from declarations or expressions. */
export class Construction extends ConstructionBase<{
  readonly reason: Reason;
}> {
  static invalidBindingName(
    name: string,
    cause: SchemaIssue.Issue,
  ): Construction {
    return new Construction({
      reason: Reason.InvalidBindingName({ name, cause }),
    });
  }

  static invalidTypeArity(arity: number): Construction {
    return new Construction({ reason: Reason.InvalidTypeArity({ arity }) });
  }

  static typeArgumentCount(expected: number, received: number): Construction {
    return new Construction({
      reason: Reason.TypeArgumentCount({ expected, received }),
    });
  }

  static unsupportedTypeConstructor(name: string): Construction {
    return new Construction({
      reason: Reason.UnsupportedTypeConstructor({ name }),
    });
  }

  static unspecializedTypeConstructor(): Construction {
    return new Construction({ reason: Reason.UnspecializedTypeConstructor() });
  }

  static missingBlockBody(): Construction {
    return new Construction({ reason: Reason.MissingBlockBody() });
  }

  static misplacedBlockBody(): Construction {
    return new Construction({ reason: Reason.MisplacedBlockBody() });
  }

  static invalidBlockStep(): Construction {
    return new Construction({ reason: Reason.InvalidBlockStep() });
  }

  static invalidBodyResult(): Construction {
    return new Construction({ reason: Reason.InvalidBodyResult() });
  }

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
      InvalidExpression: () =>
        "The expression does not have valid J-Expr structure",
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
