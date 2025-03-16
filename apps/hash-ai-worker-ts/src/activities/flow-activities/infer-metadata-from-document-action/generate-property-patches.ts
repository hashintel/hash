import type {
  BaseUrl,
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
  PropertyProvenance,
} from "@blockprotocol/type-system";
import type { NumberOfPagesPropertyValueWithMetadata } from "@local/hash-isomorphic-utils/system-types/academicpaper";
import type { DocProperties } from "@local/hash-isomorphic-utils/system-types/shared";

export const generateDocumentPropertyPatches = ({
  numberOfPages,
  properties,
  provenance,
}: {
  numberOfPages: number;
  properties: PropertyObjectWithMetadata;
  provenance: PropertyProvenance;
}): PropertyPatchOperation[] => {
  const propertyPatches: PropertyPatchOperation[] = [];

  const numPagesKey =
    "https://hash.ai/@h/types/property-type/number-of-pages/" satisfies keyof DocProperties;

  propertyPatches.push({
    op: "add",
    path: [numPagesKey as BaseUrl],
    property: {
      value: numberOfPages,
      metadata: {
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        provenance,
      },
    } satisfies NumberOfPagesPropertyValueWithMetadata,
  });

  for (const [key, propertyWithMetadata] of Object.entries(properties.value)) {
    propertyPatches.push({
      op: "add",
      path: [key as BaseUrl],
      property: propertyWithMetadata,
    });
  }

  return propertyPatches;
};
