import type { EntityTypeWithMetadata } from "@blockprotocol/graph";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { EntityTypeEditor } from "@hashintel/type-editor";
import type { OwnedById, PropertyTypeWithMetadata } from "@local/hash-subgraph";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { usePropertyTypes } from "../../../shared/property-types-context";
import { useDataTypesContext } from "../data-types-context";
import { useEditorOntologyFunctions } from "./definition-tab/use-editor-ontology-functions";

type DefinitionTabProps = {
  ownedById: OwnedById | null;
  entityTypeAndPropertyTypes: {
    entityType: EntityTypeWithMetadata;
    propertyTypes: Record<VersionedUrl, PropertyTypeWithMetadata>;
  };
  onNavigateToType: (url: VersionedUrl) => void;
  readonly: boolean;
};

export const DefinitionTab = ({
  entityTypeAndPropertyTypes,
  ownedById,
  onNavigateToType,
  readonly,
}: DefinitionTabProps) => {
  const entityTypesContext = useEntityTypesContextRequired();

  const { propertyTypes: possiblyIncompletePropertyTypeOptions } =
    usePropertyTypes();

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

  const ontologyFunctions = useEditorOntologyFunctions(
    ownedById,
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
