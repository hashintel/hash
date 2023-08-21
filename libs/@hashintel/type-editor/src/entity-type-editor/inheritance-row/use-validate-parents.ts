import { extractBaseUrl, VersionedUrl } from "@blockprotocol/type-system/slim";

import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import { usePropertyTypesOptions } from "../../shared/property-types-options-context";
import { linkEntityTypeUrl } from "../../shared/urls";
import { useInheritedValues } from "../shared/use-inherited-values";

/**
 * Validate that the proposed directParentEntityTypeIds are valid for the child, given its id, properties and links
 *
 * Rules
 * 1. NO CYCLES: The same entity type cannot appear twice in any of the inheritance chains starting from the child
 * 2. LINKS CANNOT INHERIT FROM NON LINKS: if any inheritance chain contains a link type, all types in all chains must be link types
 * 3. NO REPEATED TYPES: A property type or link type can appear only once across ALL properties or links the child has directly or inherits,
 *      UNLESS it belongs to the exact same entity type at the same version (e.g. Person v2s may appear in multiple chains)
 */
export const useValidateParents = ({
  childEntityTypeId,
  childPropertiesIds,
  childLinksIds,
  directParentEntityTypeIds,
}: {
  childEntityTypeId: VersionedUrl;
  childPropertiesIds: VersionedUrl[];
  childLinksIds: VersionedUrl[];
  directParentEntityTypeIds: VersionedUrl[];
}) => {
  const {
    inheritanceChains,
    properties: inheritedProperties,
    links: inheritedLinks,
  } = useInheritedValues({
    directParentIds: directParentEntityTypeIds,
  });

  const { linkTypes } = useEntityTypesOptions();
  const propertyTypes = usePropertyTypesOptions();

  const areChainsLinkChains = [];

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
        "You cannot add a non-link type as a parent of a link type",
      );
    }
  }

  for (const inheritedProperty of inheritedProperties) {
    const fullPropertyDetails = propertyTypes[inheritedProperty.$id];
    if (!fullPropertyDetails) {
      throw new Error(
        `Property ${inheritedProperty.$id} not found in property type options`,
      );
    }

    if (
      childPropertiesIds.find(
        (id) => extractBaseUrl(id) === extractBaseUrl(inheritedProperty.$id),
      )
    ) {
      throw new Error(
        `You must remove the ${fullPropertyDetails.title} property from the child type before adding a parent that has it.`,
      );
    }

    if (
      inheritedProperties.filter(
        (property) =>
          // Disallow duplicates of the same property by any version
          extractBaseUrl(property.$id) ===
            extractBaseUrl(inheritedProperty.$id) &&
          // Unless they belong directly to the exact same entity type version –
          // it might appear in multiple chains, e.g. Father <- Person, Salesman <- Person
          inheritedProperty.inheritanceChain[
            inheritedProperty.inheritanceChain.length - 1
          ]!.$id !==
            property.inheritanceChain[property.inheritanceChain.length - 1]!
              .$id,
      ).length > 1
    ) {
      throw new Error(
        `You cannot add a parent that contains the ${fullPropertyDetails.title} property as another parent already contains it.`,
      );
    }
  }

  for (const inheritedLink of inheritedLinks) {
    const fullLinkDetails = linkTypes[inheritedLink.$id];
    if (!fullLinkDetails) {
      throw new Error(
        `Link ${inheritedLink.$id} not found in link type options`,
      );
    }

    if (
      childLinksIds.find(
        (id) => extractBaseUrl(id) === extractBaseUrl(inheritedLink.$id),
      )
    ) {
      throw new Error(
        `You must remove the ${fullLinkDetails.title} link from the child type before adding a parent that has it.`,
      );
    }

    if (
      inheritedLinks.filter(
        (link) =>
          extractBaseUrl(link.$id) === extractBaseUrl(inheritedLink.$id) &&
          inheritedLink.inheritanceChain[
            inheritedLink.inheritanceChain.length - 1
          ]!.$id !==
            link.inheritanceChain[link.inheritanceChain.length - 1]!.$id,
      ).length > 1
    ) {
      throw new Error(
        `You cannot add a parent that contains the ${fullLinkDetails.title} link as another parent already contains it.`,
      );
    }
  }

  return true;
};
