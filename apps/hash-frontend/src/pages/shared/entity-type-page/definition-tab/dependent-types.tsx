import { Box } from "@mui/material";

import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { isTypeArchived } from "../../../../shared/is-archived";
import { getDependentTypeRows } from "./dependent-types/dependent-type-rows";
import { DependentTypesSection } from "./dependent-types/dependent-types-section";
import { useDependentTypes } from "./dependent-types/use-dependent-types";

import type { OnNavigateToType } from "../shared/on-navigate-to-type";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
} from "@blockprotocol/type-system";

export const DependentTypes = ({
  entityType,
  entityTypeBaseUrl,
  onNavigateToType,
}: {
  entityType: EntityTypeWithMetadata;
  /** `null` for a draft type, which nothing can refer to yet */
  entityTypeBaseUrl: BaseUrl | null;
  onNavigateToType: OnNavigateToType;
}) => {
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const hidden = !entityTypeBaseUrl || isTypeArchived(entityType);

  const { data, error } = useDependentTypes(hidden ? null : entityTypeBaseUrl);

  if (hidden) {
    return null;
  }

  const boldTitle = (
    <Box component="span" sx={{ fontWeight: "bold" }}>
      {entityType.schema.title}
    </Box>
  );

  const heading = <>Types that extend {boldTitle}</>;
  const emptyMessage = <>No types extend {boldTitle} yet.</>;
  const isLinkType = (type: EntityTypeWithMetadata) =>
    isSpecialEntityTypeLookup?.[type.schema.$id]?.isLink ?? false;

  return (
    <DependentTypesSection
      heading={heading}
      emptyMessage={emptyMessage}
      types={
        data
          ? getDependentTypeRows({
              parentBaseUrl: entityTypeBaseUrl,
              ...data,
            }).rows.map((row) => row.entityType)
          : undefined
      }
      error={error}
      isLinkType={isLinkType}
      onTypeClick={(typeId) => onNavigateToType("entityType", typeId)}
    />
  );
};
