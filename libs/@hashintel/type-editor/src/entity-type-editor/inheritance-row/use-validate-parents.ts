import { EntityType, PropertyType } from "@blockprotocol/graph";
import { extractBaseUrl, VersionedUrl } from "@blockprotocol/type-system/slim";
import { useCallback } from "react";

import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import { usePropertyTypesOptions } from "../../shared/property-types-options-context";
import { linkEntityTypeUrl } from "../../shared/urls";
import {
  InheritedValues,
  useGetInheritedValues,
} from "../shared/use-inherited-values";

/**
 * Utility function used in the hook below – the same logic is used to check for both link and property duplicates.
 *
 * @throws if there are any duplicate property or link types (of any version) among inheritedTypes and childsOwnTypeIds,
 *    UNLESS they belong to the exact same entity type version
 */
const throwIfDuplicates = <
  T extends InheritedValues["links"] | InheritedValues["properties"],
>({
  inheritedTypes,
  childsOwnTypeIds,
  label,
  typeOptions,
}: {
  inheritedTypes: T;
  childsOwnTypeIds: VersionedUrl[];
  label: string;
  typeOptions: T extends InheritedValues["links"]
    ? Record<VersionedUrl, EntityType>
    : Record<VersionedUrl, PropertyType>;
}) => {
  for (const inheritedType of inheritedTypes) {
    const fullTypeDetails = typeOptions[inheritedType.$id];
    if (!fullTypeDetails) {
      throw new Error(
        `${label} ${inheritedType.$id} not found in ${label} type options`,
      );
    }

    if (
      childsOwnTypeIds.find(
        (id) => extractBaseUrl(id) === extractBaseUrl(inheritedType.$id),
      )
    ) {
      throw new Error(
        `You must remove the ${fullTypeDetails.title} ${label} from the child type before adding a parent that has it.`,
      );
    }

    if (
      (inheritedTypes as InheritedValues["links"]).filter(
        (type) =>
          // Disallow duplicates of the same type by any version
          extractBaseUrl(type.$id) === extractBaseUrl(inheritedType.$id) &&
          // Unless they belong directly to the exact same entity type version –
          // it might appear in multiple chains, e.g. Father <- Person, Salesman <- Person
          inheritedType.inheritanceChain[ // the direct owner will be the last in the inheritance chain
            inheritedType.inheritanceChain.length - 1
          ]!.$id !==
            type.inheritanceChain[type.inheritanceChain.length - 1]!.$id,
      ).length > 1
    ) {
      throw new Error(
        `You cannot add a parent that contains the ${fullTypeDetails.title} ${label} as another parent already contains it.`,
      );
    }
  }
};

/**
 * Validate that the proposed directParentEntityTypeIds are valid for the child, given its id, properties and links
 *
 * Rules
 * 1. NO CYCLES: The same entity type cannot appear twice in any of the inheritance chains starting from the child
 * 2. LINKS CANNOT INHERIT FROM NON LINKS: if any inheritance chain contains a link type, all types in all chains must be link types
 * 3. NO REPEATED TYPES: A property type or link type can appear only once across ALL properties or links the child has directly or inherits,
 *      UNLESS it belongs to the exact same entity type at the same version (e.g. Person v2s may appear in multiple chains)
 */
export const useValidateParents = (): ((args: {
  childEntityTypeId: VersionedUrl;
  childPropertiesIds: VersionedUrl[];
  childLinksIds: VersionedUrl[];
  directParentIds: VersionedUrl[];
}) => boolean) => {
  const getInheritedValues = useGetInheritedValues();

  const { linkTypes } = useEntityTypesOptions();
  const propertyTypes = usePropertyTypesOptions();

  return useCallback(
    ({
      childEntityTypeId,
      childPropertiesIds,
      childLinksIds,
      directParentIds,
    }) => {
      const areChainsLinkChains = [];

      const {
        links: inheritedLinks,
        properties: inheritedProperties,
        inheritanceChains,
      } = getInheritedValues({
        directParentIds,
      });

      for (const chain of inheritanceChains) {
        const idsInChainIncludingChild = [
          childEntityTypeId,
          ...chain.map((type) => type.$id),
        ];

        let isLinkChain = false;

        for (let i = 0; i < chain.length; i++) {
          const currentType = chain[i]!;

          // Check if the current type's id appears twice in the chain from child to root parent
          if (
            idsInChainIncludingChild.findIndex(
              (id) => extractBaseUrl(id) === extractBaseUrl(currentType.$id),
            ) !==
            // add 1 because the child is included in the array of ids but not the loop
            i + 1
          ) {
            throw new Error(
              `Cannot create a cycle by having ${currentType.title} extend itself.`,
            );
          }

          const isLink = !!(
            linkTypes[currentType.$id] ?? currentType.$id === linkEntityTypeUrl
          );
          if (isLink) {
            isLinkChain = true;
          } else if (isLinkChain) {
            throw new Error(
              `Cannot have link type inherit from non-link type ${currentType.title}.`,
            );
          }

          areChainsLinkChains.push(isLinkChain);
        }

        if (
          areChainsLinkChains.includes(true) &&
          areChainsLinkChains.includes(false)
        ) {
          throw new Error(
            "You cannot have both link types and non-link types as parents",
          );
        }
      }

      throwIfDuplicates({
        inheritedTypes: inheritedLinks,
        childsOwnTypeIds: childLinksIds,
        label: "link",
        typeOptions: linkTypes,
      });

      throwIfDuplicates({
        inheritedTypes: inheritedProperties,
        childsOwnTypeIds: childPropertiesIds,
        label: "property",
        typeOptions: propertyTypes,
      });

      return true;
    },
    [getInheritedValues, linkTypes, propertyTypes],
  );
};
