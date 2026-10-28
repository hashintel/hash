/** Printers for the mutually recursive path and type model. @internal */
import { compileIdent } from "./ident-parser.js";
import { printer, separated } from "./printer.js";

import type { Path, SegmentArgument } from "../JExpr/Path.js";
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
