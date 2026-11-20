/** Compilers for the mutually recursive path and type model, to type syntax and to constructor syntax. @internal */
import { Array, Record, Tuple } from "effect";

import { compileIdent } from "./ident-parser.js";
import { printer, separated } from "./printer.js";

import type { Path, SegmentArgument } from "../JExpr/Path.js";
import type { ExpressionType } from "../JExpr/schema.js";
import type { Type } from "../JExpr/Type/schema.js";

/** A type to print below an operator of the given precedence, or a path to print. */
type Node =
  | { readonly _tag: "Type"; readonly type: Type; readonly precedence: number }
  | { readonly _tag: "Path"; readonly path: Path };

type Step = string | Node;

const typeStep = (type: Type, precedence: number): Node => ({
  _tag: "Type",
  type,
  precedence,
});

const argumentSteps = (argument: SegmentArgument): readonly Step[] => {
  const bound = typeStep(argument.bound, 0);
  if (argument._tag === "GenericConstraint") {
    return [`${compileIdent(argument.name)}: `, bound];
  }

  return [bound];
};

const pathSteps = (path: Path): readonly Step[] => [
  ...(path.rooted ? ["::"] : []),
  ...separated(path.segments, "::", ({ name, arguments: args }) => {
    const ident = compileIdent(name);
    if (args.length === 0) {
      return [ident];
    }

    return [`${ident}<`, ...separated(args, ", ", argumentSteps), ">"];
  }),
];

/** Inserts parentheses only where precedence or nested members require them. */
const typeSteps = (type: Type, parentPrecedence: number): readonly Step[] => {
  switch (type._tag) {
    case "Infer": {
      return ["_"];
    }
    case "Reference": {
      return [{ _tag: "Path", path: type.path }];
    }
    case "Union":
    case "Intersection": {
      const [first, ...rest] = type.members;
      if (rest.length === 0) {
        return [typeStep(first, parentPrecedence)];
      }

      const precedence = type._tag === "Union" ? 2 : 1;
      const separator = type._tag === "Union" ? " | " : " & ";
      const body = separated(type.members, separator, (member) => [
        typeStep(member, precedence),
      ]);

      return precedence <= parentPrecedence ? ["(", ...body, ")"] : body;
    }
    case "Tuple": {
      if (type.members.length === 0) {
        return ["()"];
      }

      return [
        "(",
        ...separated(type.members, ", ", (member) => [typeStep(member, 0)]),
        type.members.length === 1 ? ",)" : ")",
      ];
    }
    case "Struct": {
      if (type.members.length === 0) {
        return ["(:)"];
      }

      return [
        "(",
        ...separated(type.members, ", ", ([name, member]) => [
          `${compileIdent(name)}: `,
          typeStep(member, 0),
        ]),
        ")",
      ];
    }
  }
};

const print = printer((node: Node): readonly Step[] => {
  switch (node._tag) {
    case "Path": {
      return pathSteps(node.path);
    }
    case "Type": {
      return typeSteps(node.type, node.precedence);
    }
  }
});

export const compilePath = (path: Path): string =>
  print([{ _tag: "Path", path }]);

/** Prints type syntax without adding redundant groups around qualified paths. */
export const compileType = (type: Type): string => print([typeStep(type, 0)]);

/** A type and the expressions of its members built so far, in member order. */
interface Frame {
  readonly type: Type;
  readonly members: readonly Type[];
  readonly expressions: ExpressionType[];
}

const open = (type: Type): Frame => {
  switch (type._tag) {
    case "Infer":
    case "Reference": {
      return { type, members: [], expressions: [] };
    }
    case "Struct": {
      return {
        type,
        members: Array.map(type.members, Tuple.get(1)),
        expressions: [],
      };
    }
    case "Tuple":
    case "Union":
    case "Intersection": {
      return { type, members: type.members, expressions: [] };
    }
  }
};

const construct = ({ type, expressions }: Frame): ExpressionType => {
  switch (type._tag) {
    case "Infer": {
      return "_";
    }
    case "Reference": {
      return compileType(type);
    }
    case "Tuple": {
      return { "#tuple": expressions };
    }
    case "Struct": {
      return {
        "#struct": Record.fromEntries(
          Array.zipWith(type.members, expressions, ([name], expression) => [
            compileIdent(name),
            expression,
          ]),
        ),
      };
    }
    case "Union": {
      return ["::kernel::type::Union", ...expressions];
    }
    case "Intersection": {
      return ["::kernel::type::Intersection", ...expressions];
    }
  }
};

/** Writes a type as the constructor syntax of an expression position. */
export const typeToExpression = (type: Type): ExpressionType => {
  // Types wait here for their members instead of on the call stack, which bounds the nesting depth by memory alone.
  const parents: Frame[] = [];
  let current = open(type);

  for (;;) {
    const member = current.members[current.expressions.length];
    if (member === undefined) {
      const expression = construct(current);
      const parent = parents.pop();
      if (parent === undefined) {
        return expression;
      }

      parent.expressions.push(expression);
      current = parent;
    } else {
      parents.push(current);
      current = open(member);
    }
  }
};
