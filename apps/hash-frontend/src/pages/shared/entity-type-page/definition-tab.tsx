import { Stack } from "@mui/material";
import { useMemo } from "react";

import { EntityTypeEditor } from "@hashintel/type-editor";

import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { usePropertyTypes } from "../../../shared/property-types-context";
import { useDataTypesContext } from "../data-types-context";
import { useNewTypeOwner } from "../shared/use-new-type-owner";
import { EntityTypeChildren } from "./definition-tab/entity-type-children";
import { useEditorOntologyFunctions } from "./definition-tab/use-editor-ontology-functions";

import type { OnNavigateToType } from "./shared/on-navigate-to-type";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

type DefinitionTabProps = {
  entityTypeAndPropertyTypes: {
    entityType: EntityTypeWithMetadata;
    propertyTypes: Record<VersionedUrl, PropertyTypeWithMetadata>;
  };
  entityTypeBaseUrl: BaseUrl | null;
  onNavigateToType: OnNavigateToType;
  readonly: boolean;
};

export const DefinitionTab = ({
  entityTypeAndPropertyTypes,
  entityTypeBaseUrl,
  onNavigateToType,
  readonly,
}: DefinitionTabProps) => {
  const entityTypesContext = useEntityTypesContextRequired();

  const { propertyTypes: possiblyIncompletePropertyTypeOptions } =
    usePropertyTypes({ latestOnly: true });

  const propertyTypeOptions = useMemo(() => {
    return {
      ...possiblyIncompletePropertyTypeOptions,
      ...entityTypeAndPropertyTypes.propertyTypes,
    };
  }, [entityTypeAndPropertyTypes, possiblyIncompletePropertyTypeOptions]);

  const entityTypeOptions = useMemo(() => {
    if (!entityTypesContext.entityTypes) {
      return null;
    }

    return Object.fromEntries(
      entityTypesContext.entityTypes.map((entityType) => [
        entityType.schema.$id,
        entityType,
      ]),
    );
  }, [entityTypesContext.entityTypes]);

  const typesWithMetadata = useMemo(
    () => ({
      ...entityTypeOptions,
      ...propertyTypeOptions,
    }),
    [entityTypeOptions, propertyTypeOptions],
  );

  const newTypeWebId = useNewTypeOwner(
    entityTypeAndPropertyTypes.entityType.schema.$id,
  );

  const ontologyFunctions = useEditorOntologyFunctions(
    newTypeWebId ?? null,
    typesWithMetadata,
  );

  const { dataTypes } = useDataTypesContext();
  const dataTypeOptions = useMemo(() => {
    if (!dataTypes) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(dataTypes).map(([key, value]) => [key, value.schema]),
    );
  }, [dataTypes]);

  if (!entityTypeOptions || !dataTypeOptions) {
    return null;
  }

  return (
    <Stack key={entityTypeAndPropertyTypes.entityType.schema.$id} spacing={6.5}>
      <EntityTypeEditor
        customization={{ onNavigateToType }}
        dataTypeOptions={dataTypeOptions}
        entityType={entityTypeAndPropertyTypes.entityType}
        entityTypeOptions={entityTypeOptions}
        entityTypePermissions={
          entityTypesContext.entityTypePermissions ?? undefined
        }
        ontologyFunctions={ontologyFunctions}
        propertyTypeOptions={propertyTypeOptions}
        readonly={readonly}
      />
      <EntityTypeChildren
        entityType={entityTypeAndPropertyTypes.entityType}
        entityTypeBaseUrl={entityTypeBaseUrl}
        onNavigateToType={onNavigateToType}
      />
    </Stack>
  );
};
