import type * as Parameter from "./Parameter.js";
import type * as TypeNode from "./TypeNode.js";
import type * as TypeParameter from "./TypeParameter.js";
import type { Chunk, Option } from "effect";

/** Parameters and result types belong to each overload, independently of its enclosing declaration. */
export interface Signature {
  readonly typeParameters: Chunk.Chunk<TypeParameter.Interned>;
  readonly parameters: Chunk.Chunk<Parameter.Interned>;
  readonly returns: Option.Option<TypeNode.Interned>;
}
