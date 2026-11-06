import * as CallableConstant from "./CallableConstant.js";
import * as FunctionOverloads from "./FunctionOverloads.js";

import type * as $Interned from "./Interned.js";

/** Function overloads and callable constants expose ordered calls without losing their source forms. */
export type FunctionDeclaration =
  | FunctionOverloads.FunctionOverloads
  | CallableConstant.CallableConstant;

export declare namespace FunctionDeclaration {
  type Function = FunctionOverloads.FunctionOverloads;
  type Constant = CallableConstant.CallableConstant;
  type Fields =
    | (FunctionOverloads.FunctionOverloads.Fields & {
        readonly flavour: "function";
      })
    | (CallableConstant.CallableConstant.Fields & {
        readonly flavour: "const";
      });
}

export type Interned = $Interned.Interned<FunctionDeclaration>;

/** Recognises either supported callable declaration form. */
export const isFunctionDeclaration = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is FunctionDeclaration =>
  FunctionOverloads.isFunctionOverloads(value) ||
  CallableConstant.isCallableConstant(value);

/** Creates the selected callable form without dropping its non-call members. */
export function make(
  fields: FunctionOverloads.FunctionOverloads.Fields & {
    readonly flavour: "function";
  },
): FunctionOverloads.FunctionOverloads;
export function make(
  fields: CallableConstant.CallableConstant.Fields & {
    readonly flavour: "const";
  },
): CallableConstant.CallableConstant;
export function make(fields: FunctionDeclaration.Fields): FunctionDeclaration;
export function make(fields: FunctionDeclaration.Fields): FunctionDeclaration {
  if (fields.flavour === "function") {
    return FunctionOverloads.make(fields);
  }

  return CallableConstant.make(fields);
}
