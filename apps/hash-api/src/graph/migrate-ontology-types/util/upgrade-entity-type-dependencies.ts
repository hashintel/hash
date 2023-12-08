import { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import { EntityTypeReference } from "@blockprotocol/type-system/dist/cjs";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

const replaceEntityTypeReference = ({
  reference,
  upgradedEntityTypeId,
}: {
  reference: EntityTypeReference;
  upgradedEntityTypeId: VersionedUrl;
}) => {
  const baseUrlToMatch = extractBaseUrl(upgradedEntityTypeId);

  const isDestinationToUpgrade =
    extractBaseUrl(reference.$ref) === baseUrlToMatch;
  if (isDestinationToUpgrade) {
    return {
      $ref: upgradedEntityTypeId,
    };
  }
  return reference;
};
export const upgradeEntityTypeDependency = ({
  schema,
  upgradedEntityTypeId,
}: {
  schema: EntityType;
  upgradedEntityTypeId: VersionedUrl;
}): EntityType => {
  return {
    ...schema,
    allOf: schema.allOf?.map((reference) =>
      replaceEntityTypeReference({
        reference,
        upgradedEntityTypeId,
      }),
    ),
    links: typedEntries(schema.links ?? {}).reduce<
      NonNullable<EntityType["links"]>
    >((accumulator, [linkTypeId, linkSchema]) => {
      const schemaWithUpdatedDestinations = {
        ...linkSchema,
        items: {
          ...linkSchema.items,
          oneOf:
            "oneOf" in linkSchema.items
              ? linkSchema.items.oneOf.map((reference) =>
                  replaceEntityTypeReference({
                    reference,
                    upgradedEntityTypeId,
                  }),
                )
              : linkSchema.items,
        },
      };

      accumulator[linkTypeId] = schemaWithUpdatedDestinations;
      return accumulator;
    }, {}),
  };
};
