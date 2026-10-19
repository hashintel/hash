/**
 * The graph-producing function that query construction recognizes.
 *
 * Draft exposes `$.query.entities` when its prelude's values contain an `entities` function returning the recognized graph descriptor. The graph marker carries the vertex type through filtering and collection.
 *
 * @module
 */
import type * as Type from "../Type/index.js";
import type * as Expression from "./Expression.js";
import type * as Inputs from "./Inputs.js";
import type * as Scope from "./Scope.js";

type Graph<Vertex extends Type.Any> = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Vertex }>
>;

/** Reads the declared `entities` function's arguments, result, requirements and graph vertex, or resolves to `never` when its descriptor does not match. */
export type EntityFunction<S extends Scope.Scope> = S["values"] extends {
  readonly entities: infer E extends Expression.Any;
}
  ? Expression.TypeOf<E> extends Type.Function<infer A, infer R>
    ? R extends Graph<infer V>
      ? {
          readonly args: A;
          readonly returns: R;
          readonly vertex: V;
          readonly inputs: Inputs.Conservative<Expression.Inputs<E>>;
        }
      : never
    : never
  : never;
