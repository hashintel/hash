import { Data } from "effect";

interface ParserFailure {
  // oxlint-disable-next-line typescript/no-restricted-types -- callers can inspect parser details without depending on the parser's error type
  readonly cause: unknown;
}

interface NameFailure extends ParserFailure {
  readonly name: string;
}

export type Reason = Data.TaggedEnum<{
  InvalidBindingName: NameFailure;
  InvalidImportName: NameFailure;
  InvalidParameterName: NameFailure;
  InvalidExportName: NameFailure;
  InvalidExpression: ParserFailure;
  InvalidModulePath: NameFailure;
  RelativeModulePath: { readonly name: string };
  InvalidTypeArity: { readonly arity: number };
  TypeArgumentCount: { readonly expected: number; readonly received: number };
  InvalidBlock: { readonly message: string };
}>;

export const Reason: Data.TaggedEnum.Constructor<Reason> =
  Data.taggedEnum<Reason>();

const ConstructionBase: ReturnType<
  typeof Data.TaggedError<"ProgramConstructionError">
> = Data.TaggedError("ProgramConstructionError");

/** Failure to construct a program from declarations or expressions. */
export class Construction extends ConstructionBase<{
  readonly reason: Reason;
}> {
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
      InvalidBlock: ({ message }) => message,
    });
  }
}
