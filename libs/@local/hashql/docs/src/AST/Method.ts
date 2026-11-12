import * as CallableProperty from "./CallableProperty.js";
import * as MethodOverloads from "./MethodOverloads.js";

import type * as $Interned from "./Interned.js";

/** Method overloads and callable properties expose ordered calls without losing their source forms. */
export type Method =
  | MethodOverloads.MethodOverloads
  | CallableProperty.CallableProperty;

export declare namespace Method {
  type Overloads = MethodOverloads.MethodOverloads;
  type Property = CallableProperty.CallableProperty;
  type Fields =
    | (MethodOverloads.MethodOverloads.Fields & {
        readonly flavour: "method";
      })
    | (CallableProperty.CallableProperty.Fields & {
        readonly flavour: "property";
      });
}

export type Interned = $Interned.Interned<Method>;

/** Recognises either supported callable member form. */
export const isMethod = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Method =>
  MethodOverloads.isMethodOverloads(value) ||
  CallableProperty.isCallableProperty(value);

/** Creates the selected callable form without dropping what its declaration states besides the calls. */
export function make(
  fields: MethodOverloads.MethodOverloads.Fields & {
    readonly flavour: "method";
  },
): MethodOverloads.MethodOverloads;
export function make(
  fields: CallableProperty.CallableProperty.Fields & {
    readonly flavour: "property";
  },
): CallableProperty.CallableProperty;
export function make(fields: Method.Fields): Method;
export function make(fields: Method.Fields): Method {
  if (fields.flavour === "method") {
    return MethodOverloads.make(fields);
  }

  return CallableProperty.make(fields);
}
