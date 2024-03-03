import {
  EntityType,
  EntityTypeReference,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

export const replaceEntityTypeReference = ({
  reference,
  upgradedEntityTypeIds,
}: {
  reference: EntityTypeReference;
  upgradedEntityTypeIds: VersionedUrl[];
}) => {
  for (const upgradedEntityTypeId of upgradedEntityTypeIds) {
    const baseUrlToMatch = extractBaseUrl(upgradedEntityTypeId);

    const isDestinationToUpgrade =
      extractBaseUrl(reference.$ref) === baseUrlToMatch;

    if (isDestinationToUpgrade) {
      return {
        $ref: upgradedEntityTypeId,
      };
    }
  }
  return reference;
};

/**
 * Given a schema and a new entity type id for a type which may be referenced by it,
 * generate a new schema which updates to the new id if the type appears as:
 * 1. A parent in the schema
 * 2. A link in the schema
 * 3. A link destination in the schema
 */
export const upgradeEntityTypeDependencies = ({
  schema,
  upgradedEntityTypeIds,
}: {
  schema: EntityType;
  upgradedEntityTypeIds: VersionedUrl[];
}): EntityType => {
  return {
    ...schema,
    allOf: schema.allOf?.map((reference) =>
      replaceEntityTypeReference({
        reference,
        upgradedEntityTypeIds,
      }),
    ),
    links: typedEntries(schema.links ?? {}).reduce<
      NonNullable<EntityType["links"]>
    >((accumulator, [uncheckedLinkTypeId, linkSchema]) => {
      const schemaWithUpdatedDestinations = {
        ...linkSchema,
        items: {
          ...linkSchema.items,
          oneOf:
            "oneOf" in linkSchema.items
              ? linkSchema.items.oneOf.map((reference) =>
                  replaceEntityTypeReference({
                    reference,
                    upgradedEntityTypeIds,
                  }),
                )
              : linkSchema.items,
        },
      };

      let linkTypeId = uncheckedLinkTypeId;
      for (const upgradedEntityTypeId of upgradedEntityTypeIds) {
        const linkTypeBaseUrl = extractBaseUrl(uncheckedLinkTypeId);
        const upgradedEntityTypeBaseUrl = extractBaseUrl(upgradedEntityTypeId);

        if (linkTypeBaseUrl === upgradedEntityTypeBaseUrl) {
          linkTypeId = upgradedEntityTypeId;
        }
      }

      accumulator[linkTypeId] = schemaWithUpdatedDestinations;
      return accumulator;
    }, {}),
  };
};
