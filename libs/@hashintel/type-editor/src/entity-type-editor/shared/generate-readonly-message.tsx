import { InheritanceData } from "./use-inherited-values";

export const generateReadonlyMessage = (
  args:
    | {
        parentPropertyName: string;
      }
    | InheritanceData,
) => {
  const entityTypeInheritedFrom =
    "inheritanceChain" in args
      ? args.inheritanceChain[args.inheritanceChain.length - 1]
      : undefined;

  return "inheritanceChain" in args
    ? `This property is inherited. To edit this value or remove it, modify the parent type from which it is inherited (${
        entityTypeInheritedFrom!.schema.title
      }${
        args.inheritanceChain.length > 1
          ? ` via ${args.inheritanceChain
              .slice(0, -1)
              .map((type) => type.schema.title)
              .join(", ")}`
          : ""
      }), or remove ${entityTypeInheritedFrom!.schema.title}${
        args.inheritanceChain.length > 1
          ? " from the inheritance chain"
          : " from the 'extends' section"
      }.`
    : `Edit the '${args.parentPropertyName}' property to change this`;
};
