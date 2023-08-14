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
   * The entity type these values are inherited from.
   */
  inheritedFrom: EntityType;
};

/**
 * The form data for the entity type in inheritedFrom, augmented with inheritance information.
 * The data is not intended to be edited, but the components are written to expect data in this format
 */
export type InheritedValues = {
  links: (EntityTypeEditorLinkData & InheritanceData)[];
  properties: (EntityTypeEditorPropertyData & InheritanceData)[];
};

const getInheritedValuesForEntityType = (
  entityTypeId: VersionedUrl,
  entityTypeOptions: Record<VersionedUrl, EntityType>,
  inheritanceChain: string[] = [],
): InheritedValues => {
  const entity = entityTypeOptions[entityTypeId];

  if (!entity) {
    throw new Error(
      `Entity type ${entityTypeId} not found in entity type options`,
    );
  }

  const newInheritanceChain = [...inheritanceChain, entity.title];

  const { properties, links } = getFormDataFromSchema(entity);

  const inheritedValues = {
    links: links.map((link) => ({
      ...link,
      inheritedFrom: entity,
      inheritanceChain: newInheritanceChain,
    })),
    properties: properties.map((property) => ({
      ...property,
      inheritedFrom: entity,
      inheritanceChain: newInheritanceChain,
    })),
  };

  const parentsInheritedValues = (entity.allOf ?? []).map(({ $ref }) =>
    getInheritedValuesForEntityType(
      $ref,
      entityTypeOptions,
      newInheritanceChain,
    ),
  );

  return {
    links: [
      ...inheritedValues.links,
      ...parentsInheritedValues.map((parent) => parent.links).flat(),
    ],
    properties: [
      ...inheritedValues.properties,
      ...parentsInheritedValues.map((parent) => parent.properties).flat(),
    ],
  };
};

export const useInheritedValues = (): InheritedValues => {
  const { control } = useFormContext<EntityTypeEditorFormData>();

  const { entityTypes } = useEntityTypesOptions();

  const directParentIds = useWatch({
    control,
    name: "allOf",
  });

  return useMemo(
    () =>
      directParentIds.reduce<InheritedValues>(
        (acc, id) => {
          const inheritedValues = getInheritedValuesForEntityType(
            id,
            entityTypes,
          );

          return {
            links: [...acc.links, ...inheritedValues.links],
            properties: [...acc.properties, ...inheritedValues.properties],
          };
        },
        { links: [], properties: [] },
      ),
    [directParentIds, entityTypes],
  );
};
