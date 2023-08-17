import { InheritanceData } from "./use-inherited-values";

export const generateReadonlyMessage = (
  args:
    | {
        parentPropertyName: string;
      }
    | InheritanceData,
) =>
  "inheritanceChain" in args
    ? `This property is inherited. To edit this value or remove it, modify the parent type from which it is inherited (${
        args.inheritedFrom.title
      }${
        args.inheritanceChain.length > 1
          ? ` via ${args.inheritanceChain.slice(0, -1).join(", ")}`
          : ""
      }), or remove ${args.inheritedFrom.title}${
        args.inheritanceChain.length > 1
          ? " from the inheritance chain"
          : " from the 'extends' section"
      }.`
    : `Edit the '${args.parentPropertyName}' property to change this`;
