import type * as ConstructorType from "./ConstructorType.js";
import type * as FunctionType from "./FunctionType.js";
import type * as $Interned from "./Interned.js";
import type * as ObjectType from "./ObjectType.js";
import type * as TypeExpression from "./TypeExpression.js";
import type * as TypeReference from "./TypeReference.js";

export type TypeNode =
  | TypeReference.TypeReference
  | ObjectType.ObjectType
  | FunctionType.FunctionType
  | ConstructorType.ConstructorType
  | TypeExpression.TypeExpression;

export type Interned = $Interned.Interned<TypeNode>;
