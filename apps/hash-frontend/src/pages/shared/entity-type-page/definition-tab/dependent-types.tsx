import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { isTypeArchived } from "../../../../shared/is-archived";
import { getDependentTypeRows } from "./dependent-types/dependent-type-rows";
import { DependentTypesSection } from "./dependent-types/dependent-types-section";
import { useDependentTypes } from "./dependent-types/use-dependent-types";

import type {
  BaseUrl,
  EntityTypeWithMetadata,
  OntologyTypeVersion,
  VersionedUrl,
} from "@blockprotocol/type-system";

export const DependentTypes = ({
  entityType,
  entityTypeBaseUrl,
  latestVersion,
  onOpenType,
}: {
  entityType: EntityTypeWithMetadata;
  /** `null` for a draft type, which nothing can refer to yet */
  entityTypeBaseUrl: BaseUrl | null;
  /** The type's latest version, if known */
  latestVersion: OntologyTypeVersion | null;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => {
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const hidden = !entityTypeBaseUrl || isTypeArchived(entityType);

  const { data, error } = useDependentTypes(hidden ? null : entityTypeBaseUrl);

  const dependentTypeRows = useMemo(
    () =>
      data && entityTypeBaseUrl
        ? getDependentTypeRows({ parentBaseUrl: entityTypeBaseUrl, ...data })
        : undefined,
    [data, entityTypeBaseUrl],
  );

  if (hidden) {
    return null;
  }

  return (
    <DependentTypesSection
      entityType={entityType}
      parentLatestVersion={
        latestVersion ? Number.parseInt(latestVersion.toString(), 10) : null
      }
      rows={dependentTypeRows?.rows}
      incomplete={dependentTypeRows?.incomplete ?? false}
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
