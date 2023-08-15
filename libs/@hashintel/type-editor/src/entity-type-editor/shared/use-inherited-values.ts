import { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { useMemo } from "react";
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
   * The titles of entity types in the chain this type is inherited via.
   * This is a convenience for displaying the inheritance chain to the user in tooltips.
   *
   * e.g. for inherited properties for Dog, which inherits from Animal, which inherits from LivingThing,
   *   the inheritance chain where inheritedFrom is LivingThing would be ["Animal", "LivingThing"]
   */
  inheritanceChain: string[];
  /**
   * The entity type this type is inherited from.
   */
  inheritedFrom: EntityType;
};

/**
 * Inherited links and properties, each including:
 * 1. The usual form data for links and properties (they won't be edited, but it's convenient given the component design)
 * 2. Additional inheritance information to mark them as inherited, and for use in tooltips etc
 */
export type InheritedValues = {
  links: (EntityTypeEditorLinkData & InheritanceData)[];
  properties: (EntityTypeEditorPropertyData & InheritanceData)[];
};

type ValueMap = {
  links: Record<VersionedUrl, InheritedValues["links"][0]>;
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
  inheritanceChain: string[] = [],
) => {
  const entity = entityTypeOptions[entityTypeId];

  if (!entity) {
    throw new Error(
      `Entity type ${entityTypeId} not found in entity type options`,
    );
  }

  const newInheritanceChain = [...inheritanceChain, entity.title];

  const { properties, links } = getFormDataFromSchema(entity);

  for (const link of links) {
    // eslint-disable-next-line no-param-reassign
    inheritedValuesMap.links[link.$id] = {
      ...link,
      inheritedFrom: entity,
      inheritanceChain: newInheritanceChain,
    };
  }

  for (const property of properties) {
    // eslint-disable-next-line no-param-reassign
    inheritedValuesMap.properties[property.$id] = {
      ...property,
      inheritedFrom: entity,
      inheritanceChain: newInheritanceChain,
    };
  }

  (entity.allOf ?? []).map(({ $ref }) =>
    addInheritedValuesForEntityType(
      $ref,
      entityTypeOptions,
      inheritedValuesMap,
      newInheritanceChain,
    ),
  );
};

export const useInheritedValues = (): InheritedValues => {
  const { control } = useFormContext<EntityTypeEditorFormData>();

  const { entityTypes } = useEntityTypesOptions();

  const directParentIds = useWatch({
    control,
    name: "allOf",
  });

  return useMemo(() => {
    const inheritedValuesMap: ValueMap = { links: {}, properties: {} };
    for (const parent of directParentIds) {
      addInheritedValuesForEntityType(parent, entityTypes, inheritedValuesMap);
    }
    return {
      links: Object.values(inheritedValuesMap.links),
      properties: Object.values(inheritedValuesMap.properties),
    };
  }, [directParentIds, entityTypes]);
};
