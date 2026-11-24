import { Array, Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "./TypeNode.js";

/** The path with each argument appended to the arguments of its last segment. */
const applied = (
  path: JExpr.Path.Path,
  arguments_: readonly JExpr.Type.Type[],
): Parameters<typeof JExpr.Path.make>[0] => ({
  rooted: path.rooted,
  segments: Array.modifyLastNonEmpty(path.segments, (segment) => ({
    name: segment.name,
    arguments: [
      ...segment.arguments,
      ...Array.map(arguments_, (bound) => ({
        _tag: "GenericArgument" as const,
        bound,
      })),
    ],
  })),
});

/**
 * A named type, with generic arguments appended to the last segment of its path.
 *
 * A reference to a binding in the program keeps that binding's id. A path the program does not bind, such as `::kernel::type::List`, keeps none.
 */
export class Reference
  extends Pipeable.Class
  implements
    TypeNode.Of<JExpr.Type.Reference.Reference, readonly TypeNode.Any[]>
{
  readonly _tag = "Reference" as const;
  readonly path: JExpr.Path.Path;
  /** The generic arguments, which follow the arguments `path` already carries. */
  readonly children: readonly TypeNode.Any[];
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(
    path: JExpr.Path.Path,
    arguments_: readonly TypeNode.Any[],
    reference?: Referential.ReferenceId,
  ) {
    super();

    this.path = path;
    this.children = arguments_;
    this[Referential.References] = reference === undefined ? [] : [reference];
  }

  toType(
    arguments_: readonly JExpr.Type.Type[],
  ): JExpr.Type.Reference.Reference {
    if (arguments_.length === 0) {
      return { _tag: "Reference", path: this.path };
    }

    // The builders check a path and an argument's syntax where each enters the tree. `disableChecks` skips checking them again and still builds the segment and argument instances.
    return {
      _tag: "Reference",
      path: JExpr.Path.make(applied(this.path, arguments_), {
        disableChecks: true,
      }),
    };
  }
}
