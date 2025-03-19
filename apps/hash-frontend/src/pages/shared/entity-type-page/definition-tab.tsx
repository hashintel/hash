import type {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { EntityTypeEditor } from "@hashintel/type-editor";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { usePropertyTypes } from "../../../shared/property-types-context";
import { useDataTypesContext } from "../data-types-context";
import { useNewTypeOwner } from "../shared/use-new-type-owner";
import { useEditorOntologyFunctions } from "./definition-tab/use-editor-ontology-functions";

type DefinitionTabProps = {
  entityTypeAndPropertyTypes: {
    entityType: EntityTypeWithMetadata;
    propertyTypes: Record<VersionedUrl, PropertyTypeWithMetadata>;
  };
  onNavigateToType: (
    kind: "entityType" | "dataType",
    url: VersionedUrl,
  ) => void;
  readonly: boolean;
};

export const DefinitionTab = ({
  entityTypeAndPropertyTypes,
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

  const newTypeOwnedById = useNewTypeOwner(
    entityTypeAndPropertyTypes.entityType.schema.$id,
  );

  const ontologyFunctions = useEditorOntologyFunctions(
    newTypeOwnedById ?? null,
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
    <EntityTypeEditor
      customization={{ onNavigateToType }}
      dataTypeOptions={dataTypeOptions}
      entityType={entityTypeAndPropertyTypes.entityType}
      entityTypeOptions={entityTypeOptions}
      key={entityTypeAndPropertyTypes.entityType.schema.$id} // Reset state when switching entity types, helps avoid state mismatch issues
      ontologyFunctions={ontologyFunctions}
      propertyTypeOptions={propertyTypeOptions}
      readonly={readonly}
    />
  );
};
