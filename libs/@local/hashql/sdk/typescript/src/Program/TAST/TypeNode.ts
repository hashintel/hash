import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

export interface TypeNode<Type extends JExpr.Type.Type>
  extends Pipeable.Pipeable, Referential.Referential {
  readonly _tag: Type["_tag"];

  readonly children: readonly TypeNode.Any[];

  readonly toType: (syntax: never) => Type;
}

export declare namespace TypeNode {
  export type Type<T> = T extends TypeNode<infer Type> ? Type : never;
  type TypeOf<T> = Type<T>;

  export interface Any extends TypeNode<JExpr.Type.Type> {}

  export interface Of<
    Type extends JExpr.Type.Type,
    Children extends readonly Any[],
  > extends TypeNode<Type> {
    readonly children: Children;

    readonly toType: (syntax: {
      readonly [K in keyof Children]: TypeOf<Children[K]>;
    }) => Type;
  }
}

class UnionNode implements TypeNode.Of<
  JExpr.Type.Union.Union,
  readonly [TypeNode.Any, ...TypeNode.Any[]]
> {
  readonly _tag = "Union" as const;
  readonly children: readonly [TypeNode.Any, ...TypeNode.Any[]];
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(members: readonly [TypeNode.Any, ...TypeNode.Any[]]) {
    this.children = members;
    this[Referential.References] = [];
  }

  toType(
    members: readonly [JExpr.Type.Type, ...JExpr.Type.Type[]],
  ): JExpr.Type.Union.Union {
    return JExpr.Type.Union.make({ members });
  }
}

class IntersectionNode implements TypeNode.Of<
  JExpr.Type.Intersection.Intersection,
  readonly [TypeNode.Any, ...TypeNode.Any[]]
> {
  readonly _tag = "Intersection" as const;
  readonly children: readonly [TypeNode.Any, ...TypeNode.Any[]];
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(members: readonly [TypeNode.Any, ...TypeNode.Any[]]) {
    this.children = members;
    this[Referential.References] = [];
  }

  toType(
    members: readonly [JExpr.Type.Type, ...JExpr.Type.Type[]],
  ): JExpr.Type.Intersection.Intersection {
    return JExpr.Type.Intersection.make({ members });
  }
}

class StructNode implements TypeNode.Of<
  JExpr.Type.Struct.Struct,
  readonly TypeNode.Any[]
> {
  readonly _tag = "Struct" as const;
  readonly fields: readonly JExpr.Ident.Ident[];
  readonly children: readonly TypeNode.Any[];
  readonly [Referential.References]: readonly Referential.ReferenceId[];
}

class TupleNode implements TypeNode.Of<
  JExpr.Type.Tuple.Tuple,
  readonly TypeNode.Any[]
> {
  readonly _tag = "Tuple" as const;
  readonly children: readonly TypeNode.Any[];
  readonly [Referential.References]: readonly Referential.ReferenceId[];
}

class ReferenceNode
  extends Pipeable.Class
  implements TypeNode.Of<JExpr.Type.Reference.Reference, readonly []>
{
  readonly _tag = "Reference" as const;
  readonly path: JExpr.Path.Path;
  readonly children: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(reference: Referential.ReferenceId, path: JExpr.Path.Path) {
    super();

    this[Referential.References] = [reference];
    this.path = path;
  }

  toType(): JExpr.Type.Reference.Reference {
    return JExpr.Type.Reference.make({ path: this.path });
  }
}
