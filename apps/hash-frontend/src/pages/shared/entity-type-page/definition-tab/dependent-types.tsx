import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { isTypeArchived } from "../../../../shared/is-archived";
import { getDependentTypeRows } from "./dependent-types/dependent-type-rows";
import { DependentTypesSection } from "./dependent-types/dependent-types-section";
import { getDependentTypes } from "./dependent-types/get-dependent-types";
import { useDependentTypes } from "./dependent-types/use-dependent-types";

import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

export const DependentTypes = ({
  entityType,
  entityTypeBaseUrl,
  onOpenType,
}: {
  entityType: EntityTypeWithMetadata;
  /** `null` for a draft type, which nothing can refer to yet */
  entityTypeBaseUrl: BaseUrl | null;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => {
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const hidden = !entityTypeBaseUrl || isTypeArchived(entityType);

  const { data, error } = useDependentTypes(hidden ? null : entityTypeBaseUrl);

  const dependentTypes = useMemo(
    () =>
      data && entityTypeBaseUrl
        ? getDependentTypes({ parentBaseUrl: entityTypeBaseUrl, ...data })
        : undefined,
    [data, entityTypeBaseUrl],
  );

  const dependentTypeRows = useMemo(
    () => (dependentTypes ? getDependentTypeRows(dependentTypes) : undefined),
    [dependentTypes],
  );

  if (hidden) {
    return null;
  }

  return (
    <DependentTypesSection
      entityType={entityType}
      rows={dependentTypeRows}
      incomplete={dependentTypes?.incomplete ?? false}
      error={error}
      isLinkType={(type) =>
        // A type created after the lookup loaded is missing from it. A type
        // that extends a link type is a link type, so the parent's entry
        // answers for it.
        isSpecialEntityTypeLookup?.[type.schema.$id]?.isLink ??
        isSpecialEntityTypeLookup?.[entityType.schema.$id]?.isLink ??
        false
      }
      onOpenType={onOpenType}
    />
  );
};
