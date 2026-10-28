/** Printers for the mutually recursive path and type model. @internal */
import { compileIdent } from "./ident-parser.js";

import type { Path, SegmentArgument } from "../JExpr/Path.js";
import type { Type } from "../JExpr/Type/schema.js";

const compileArgument = (argument: SegmentArgument): string => {
  // oxlint-disable-next-line no-use-before-define -- mutually recursive printers
  const bound = compileType(argument.bound);
  if (argument._tag === "GenericConstraint") {
    return `${compileIdent(argument.name)}: ${bound}`;
  }

  return bound;
};

export const compilePath = (path: Path): string => {
  const segments = path.segments
    .map(({ name, arguments: args }) => {
      const ident = compileIdent(name);
      if (args.length === 0) {
        return ident;
      }
      return `${ident}<${args.map(compileArgument).join(", ")}>`;
    })
    .join("::");

  return path.rooted ? `::${segments}` : segments;
};

/** Inserts parentheses only where precedence or nested members require them. */
const renderType = (type: Type, parentPrecedence: number): string => {
  switch (type._tag) {
    case "Infer": {
      return "_";
    }
    case "Reference": {
      return compilePath(type.path);
    }
    case "Union":
    case "Intersection": {
      const [first, ...rest] = type.members;
      if (rest.length === 0) {
        return renderType(first, parentPrecedence);
      }

      const precedence = type._tag === "Union" ? 2 : 1;
      const separator = type._tag === "Union" ? " | " : " & ";
      const body = type.members
        .map((member) => renderType(member, precedence))
        .join(separator);

      return precedence <= parentPrecedence ? `(${body})` : body;
    }
    case "Tuple": {
      if (type.members.length === 0) {
        return "()";
      }

      const members = type.members
        .map((member) => renderType(member, 0))
        .join(", ");
      return `(${members}${type.members.length === 1 ? "," : ""})`;
    }
    case "Struct": {
      if (type.members.length === 0) {
        return "(:)";
      }

      return `(${type.members.map(([name, member]) => `${compileIdent(name)}: ${renderType(member, 0)}`).join(", ")})`;
    }
  }
};

/** Prints type syntax without adding redundant groups around qualified paths. */
export const compileType = (type: Type): string => renderType(type, 0);
