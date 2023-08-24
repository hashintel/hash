import {
  EntityType,
  extractBaseUrl,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { getFormDataFromSchema } from "../../get-form-data-from-schema";
import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import {
  EntityTypeEditorFormData,
  EntityTypeEditorLinkData,
  EntityTypeEditorPropertyData,
} from "../../shared/form-types";

export type InheritanceData = {
  /**
   * The entity types in the chain this type is inherited via, starting with the child,
   * and ending with the entity type which references this type.
   *
   * e.g. for inherited properties for Dog, which inherits from Animal, which inherits from LivingThing,
   *   the inheritance chain for a property referenced by LivingThing would be [Dog, Animal, LivingThing]
   */
  inheritanceChain: EntityType[];
};

/**
 * Inherited links and properties, each including:
 * 1. The usual form data for links and properties (they won't be edited, but it's convenient given the component design)
 * 2. Additional inheritance information to mark them as inherited, and for use in tooltips etc
 *
 * Also includes an array of inheritance chains, e.g. each path from the child to an entity type with no further parents,
 *    represented as an array containing each parent along the path
 */
export type InheritedValues = {
  inheritanceChains: EntityType[][];
  links: (EntityTypeEditorLinkData & InheritanceData)[];
  properties: (EntityTypeEditorPropertyData & InheritanceData)[];
};

type ValueMap = {
  inheritanceChains: EntityType[][];
  // A map between a link's id -> its form data, and where it's inherited from
  links: Record<VersionedUrl, InheritedValues["links"][0]>;
  // A map between a property's id -> its form data, and where it's inherited from
  properties: Record<VersionedUrl, InheritedValues["properties"][0]>;
};

/*
 * Mutates the provided map to add inherited values for the given entity type
 *
 * If moving this outside of this file, probably should consider a non-mutating approach.
 * This was the easiest way of generating a unique set of types.
 */
const addInheritedValuesForEntityType = (
  entityTypeId: VersionedUrl,
  entityTypeOptions: Record<VersionedUrl, EntityType>,
  inheritedValuesMap: ValueMap,
  inheritanceChainToHere: EntityType[] = [],
) => {
  const entity = entityTypeOptions[entityTypeId];

  if (!entity) {
    throw new Error(
      `Entity type ${entityTypeId} not found in entity type options`,
    );
  }

  const newInheritanceChain = [...inheritanceChainToHere, entity];

  const { properties, links } = getFormDataFromSchema(entity);

  for (const link of links) {
    // eslint-disable-next-line no-param-reassign
    inheritedValuesMap.links[link.$id] = {
      ...link,
      inheritanceChain: newInheritanceChain,
    };
  }

  for (const property of properties) {
    if (
      Object.keys(inheritedValuesMap.properties).find((versionedUrl) =>
        versionedUrl.startsWith(extractBaseUrl(property.$id)),
      )
    ) {
      throw new Error(
        `Duplicate property ${property.$id} found in inheritance chain`,
      );
    }

    // eslint-disable-next-line no-param-reassign
    inheritedValuesMap.properties[property.$id] = {
      ...property,
      inheritanceChain: newInheritanceChain,
    };
  }

  if (!entity.allOf?.length) {
    // we have reached a root entity type, add the inheritance chain to the map
    inheritedValuesMap.inheritanceChains.push(newInheritanceChain);
  } else {
    entity.allOf.map(({ $ref }) =>
      addInheritedValuesForEntityType(
        $ref,
        entityTypeOptions,
        inheritedValuesMap,
        newInheritanceChain,
      ),
    );
  }
};

export const useGetInheritedValues = (): ((args: {
  directParentIds: VersionedUrl[];
}) => InheritedValues) => {
  const { entityTypes, linkTypes } = useEntityTypesOptions();

  return useCallback(
    ({ directParentIds }) => {
      const inheritedValuesMap: ValueMap = {
        inheritanceChains: [],
        links: {},
        properties: {},
      };
      for (const parentId of directParentIds) {
        addInheritedValuesForEntityType(
          parentId,
          { ...entityTypes, ...linkTypes },
          inheritedValuesMap,
        );
      }

      return {
        inheritanceChains: Object.values(inheritedValuesMap.inheritanceChains),
        links: Object.values(inheritedValuesMap.links),
        properties: Object.values(inheritedValuesMap.properties),
      };
    },
    [entityTypes, linkTypes],
  );
};

export const useInheritedValuesForCurrentDraft = () => {
  const { control } = useFormContext<EntityTypeEditorFormData>();

  const directParentIds = useWatch({
    control,
    name: "allOf",
  });

  const getInheritedValues = useGetInheritedValues();

  return getInheritedValues({ directParentIds });
};
