import { Array, Pipeable, Result, pipe } from "effect";

import * as Overflow from "../../internal/overflow.js";
import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";
import * as ProgramError from "../ProgramError.js";
import { compile } from "./TypeNode.js";

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

    // `apply` checked this path when it made the node, so `make` does not throw here.
    return {
      _tag: "Reference",
      path: JExpr.Path.make(applied(this.path, arguments_)),
    };
  }
}

// Arguments can hold syntax that nothing has checked, such as a type expression made from host syntax. Checking the applied path here turns an invalid argument into a construction failure instead of a throw.
const makePath = Overflow.makeResult(JExpr.Path.Schema);

/**
 * Applies generic arguments to a named type, after checking the path they make.
 *
 * `reference` is the binding the path's first segment resolves to, when the program binds it.
 *
 * An argument whose syntax the path schema refuses returns a {@link ProgramError.Construction} with the `InvalidExpression` reason.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- applies arguments to the path that names the type
export const apply = (
  path: JExpr.Path.Path,
  arguments_: readonly TypeNode.Any[],
  reference?: Referential.ReferenceId,
): Result.Result<Reference, ProgramError.Construction> =>
  pipe(
    applied(path, Array.map(arguments_, compile)),
    makePath,
    Result.mapBoth({
      onFailure: (cause) => ProgramError.Construction.invalidExpression(cause),
      onSuccess: () => new Reference(path, arguments_, reference),
    }),
  );
