import type { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";

import { mustBeDefined, typedValues } from "../../shared/util.js";
import type { PreprocessContext } from "../context.js";
import { primitiveLinkEntityTypeId } from "../shared.js";

/** Check the inheritance tree of this type to see if it inherits from a link entity type */
const isLinkEntityType = (
  type: EntityType,
  context: PreprocessContext,
  explored: Set<VersionedUrl>,
): boolean => {
  const stack: EntityType[] = [type];

  while (stack.length > 0) {
    const currentType = stack.pop()!;

    const subResult =
      !!currentType.allOf &&
      currentType.allOf.some((inheritedTypeUrl) => {
        if (inheritedTypeUrl.$ref === primitiveLinkEntityTypeId) {
          return true;
        }

        if (context.linkTypeMap[inheritedTypeUrl.$ref] !== undefined) {
          return context.linkTypeMap[inheritedTypeUrl.$ref];
        }

        if (explored.has(inheritedTypeUrl.$ref)) {
          return false;
        }

        const inheritedType = mustBeDefined(
          context.entityTypes[inheritedTypeUrl.$ref],
        );

        stack.push(inheritedType);
        return false;
      });

    context.linkTypeMap[currentType.$id] = subResult;
    explored.add(currentType.$id);

    if (subResult) {
      return true;
    }
  }

  return false;
};

export const identifyLinkEntityTypes = (context: PreprocessContext) => {
  context.logDebug("Identifying link entity types");
  const explored = new Set<VersionedUrl>();

  for (const entityType of typedValues(context.entityTypes)) {
    const isLinkType = isLinkEntityType(entityType, context, explored);

    context.logTrace(
      `Entity type ${entityType.$id} is ${
        isLinkType ? "a" : "not a"
      } link type`,
    );

    context.linkTypeMap[entityType.$id] = isLinkType;
  }
};
