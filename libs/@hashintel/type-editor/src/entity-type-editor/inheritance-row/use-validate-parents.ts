import type {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/graph";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { extractBaseUrl } from "@blockprotocol/type-system/slim";
import { useCallback } from "react";

import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import { usePropertyTypesOptions } from "../../shared/property-types-options-context";
import { linkEntityTypeUrl } from "../../shared/urls";
import type { InheritedValues } from "../shared/use-inherited-values";
import { useGetInheritedValues } from "../shared/use-inherited-values";

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
  newParentTitle,
  typeOptions,
}: {
  inheritedTypes: T;
  childsOwnTypeIds: VersionedUrl[];
  label: string;
  newParentTitle: string;
  typeOptions: T extends InheritedValues["links"]
    ? Record<VersionedUrl, EntityTypeWithMetadata>
    : Record<VersionedUrl, PropertyTypeWithMetadata>;
}) => {
  for (const inheritedType of inheritedTypes) {
    const inheritedFrom =
      inheritedType.inheritanceChain[
        inheritedType.inheritanceChain.length - 1
      ]!;

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
        `The parent type you’re adding (${newParentTitle}) ${
          inheritedFrom.schema.title !== newParentTitle
            ? `has a parent (${inheritedFrom.schema.title}) which `
            : ""
        }
        specifies a ${label} type (${
          fullTypeDetails.schema.title
        }) already present on your type. Please remove it from your type in order to make ${newParentTitle} a parent.`,
      );
    }

    const duplicateFromAnotherParent = (
      inheritedTypes as InheritedValues["links"]
    ).find(
      (type) =>
        // Disallow duplicates of the same type by any version
        extractBaseUrl(type.$id) === extractBaseUrl(inheritedType.$id) &&
        // Unless they belong directly to the exact same entity type version –
        // it might appear in multiple chains, e.g. Father <- Person, Salesman <- Person
        inheritedType.inheritanceChain[ // the direct owner will be the last in the inheritance chain
          inheritedType.inheritanceChain.length - 1
        ]!.schema.$id !==
          type.inheritanceChain[type.inheritanceChain.length - 1]!.schema.$id,
    );

    if (duplicateFromAnotherParent) {
      const duplicateInheritedFrom =
        duplicateFromAnotherParent.inheritanceChain[
          duplicateFromAnotherParent.inheritanceChain.length - 1
        ]!;

      throw new Error(
        `The new type you’re adding (${newParentTitle}) ${
          inheritedFrom.schema.title !== newParentTitle
            ? `has a parent ${inheritedFrom.schema.title} which `
            : ""
        }
        specifies a ${label} (${
          fullTypeDetails.schema.title
        }) already present on another parent (${
          duplicateInheritedFrom.schema.title
        }). Please remove it from either ${newParentTitle} or ${
          duplicateInheritedFrom.schema.title
        } in order to add ${newParentTitle} as a parent.`,
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
  newParentTitle: string;
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
      newParentTitle,
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
          ...chain.map((type) => type.schema.$id),
        ];

        let isLinkChain = false;

        for (let i = 0; i < chain.length; i++) {
          const currentType = chain[i]!;

          // Check if the current type's id appears twice in the chain from child to root parent
          if (
            idsInChainIncludingChild.findIndex(
              (id) =>
                extractBaseUrl(id) === extractBaseUrl(currentType.schema.$id),
            ) !==
            // add 1 because the child is included in the array of ids but not the loop
            i + 1
          ) {
            throw new Error(
              `You cannot create a cycle by having ${currentType.schema.title} extend itself.`,
            );
          }

          const isLink = !!(
            linkTypes[currentType.schema.$id] ??
            currentType.schema.$id === linkEntityTypeUrl
          );
          if (isLink) {
            isLinkChain = true;
          } else if (isLinkChain) {
            throw new Error(
              `You cannot have link type extend non-link type ${currentType.schema.title}.`,
            );
          }

          areChainsLinkChains.push(isLinkChain);
        }

        if (
          areChainsLinkChains.includes(true) &&
          areChainsLinkChains.includes(false)
        ) {
          throw new Error(
            "You cannot extend both link types and non-link types.",
          );
        }
      }

      throwIfDuplicates({
        inheritedTypes: inheritedLinks,
        childsOwnTypeIds: childLinksIds,
        label: "link",
        newParentTitle,
        typeOptions: linkTypes,
      });

      throwIfDuplicates({
        inheritedTypes: inheritedProperties,
        childsOwnTypeIds: childPropertiesIds,
        label: "property",
        newParentTitle,
        typeOptions: propertyTypes,
      });

      return true;
    },
    [getInheritedValues, linkTypes, propertyTypes],
  );
};
