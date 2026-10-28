import { Box } from "@mui/material";

import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { isTypeArchived } from "../../../../shared/is-archived";
import { DependentTypesSection } from "./entity-type-children/dependent-types-section";
import { useEntityTypeChildren } from "./entity-type-children/use-entity-type-children";

import type { OnNavigateToType } from "../shared/on-navigate-to-type";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
} from "@blockprotocol/type-system";

export const EntityTypeChildren = ({
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

  const { children, error } = useEntityTypeChildren(
    hidden ? null : entityTypeBaseUrl,
  );

  if (hidden) {
    return null;
  }

  const boldTitle = (
    <Box component="span" sx={{ fontWeight: "bold" }}>
      {entityType.schema.title}
    </Box>
  );

  return (
    <DependentTypesSection
      heading={<>Types that extend {boldTitle}</>}
      emptyMessage={<>No types extend {boldTitle} yet.</>}
      types={children}
      error={error}
      isLinkType={(child) =>
        isSpecialEntityTypeLookup?.[child.schema.$id]?.isLink ??
        isSpecialEntityTypeLookup?.[entityType.schema.$id]?.isLink ??
        false
      }
      onTypeClick={(typeId) => onNavigateToType("entityType", typeId)}
    />
  );
};
