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

// This assumes a hash.ai/blockprotocol.org type URL format ending in [slugified-title]/v/[number]
const versionedUrlToTitle = (url: VersionedUrl) =>
  url
    .split("/")
    .slice(-3, -2)[0]!
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

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
  const entityType = entityTypeOptions[entityTypeId];

  if (!entityType) {
    throw new Error(
      `Entity type ${entityTypeId} not found in entity type options`,
    );
  }

  const newInheritanceChain = [...inheritanceChainToHere, entityType];

  const { properties, links } = getFormDataFromSchema(entityType);

  for (const link of links) {
    const duplicateLinkKey = Object.keys(inheritedValuesMap.links).find(
      (versionedUrl) => versionedUrl.startsWith(extractBaseUrl(link.$id)),
    ) as VersionedUrl | undefined;
    if (duplicateLinkKey) {
      const duplicateInheritedFrom =
        inheritedValuesMap.links[duplicateLinkKey]!.inheritanceChain[
          inheritedValuesMap.links[duplicateLinkKey]!.inheritanceChain.length -
            1
        ]!;
      throw new Error(
        `Link type '${versionedUrlToTitle(
          duplicateLinkKey,
        )}' found on two parents: '${duplicateInheritedFrom.title}' and '${
          entityType.title
        }'. Please remove it from one in order to have both as a parent.`,
      );
    }

    // eslint-disable-next-line no-param-reassign
    inheritedValuesMap.links[link.$id] = {
      ...link,
      inheritanceChain: newInheritanceChain,
    };
  }

  for (const property of properties) {
    const duplicatePropertyKey = Object.keys(
      inheritedValuesMap.properties,
    ).find((versionedUrl) =>
      versionedUrl.startsWith(extractBaseUrl(property.$id)),
    ) as VersionedUrl | undefined;
    if (duplicatePropertyKey) {
      const duplicateInheritedFrom =
        inheritedValuesMap.properties[duplicatePropertyKey]!.inheritanceChain[
          inheritedValuesMap.properties[duplicatePropertyKey]!.inheritanceChain
            .length - 1
        ]!;
      throw new Error(
        `Property type '${versionedUrlToTitle(
          duplicatePropertyKey,
        )}' found on two parents: '${duplicateInheritedFrom.title}' and '${
          entityType.title
        }'. Please remove it from one in order to have both as a parent.`,
      );
    }

    // eslint-disable-next-line no-param-reassign
    inheritedValuesMap.properties[property.$id] = {
      ...property,
      inheritanceChain: newInheritanceChain,
    };
  }

  if (!entityType.allOf?.length) {
    // we have reached a root entity type, add the inheritance chain to the map
    inheritedValuesMap.inheritanceChains.push(newInheritanceChain);
  } else {
    entityType.allOf.map(({ $ref }) =>
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
