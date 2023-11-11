import { EntityType } from "@blockprotocol/graph";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { EntityTypeEditor } from "@hashintel/type-editor";
import { OwnedById, PropertyTypeWithMetadata } from "@local/hash-subgraph";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { usePropertyTypes } from "../../../../../shared/property-types-context";
import { useEditorOntologyFunctions } from "./definition-tab/use-editor-ontology-functions";
import { getTypesWithoutMetadata } from "./shared/get-types-without-metadata";

type DefinitionTabProps = {
  ownedById: OwnedById | null;
  entityTypeAndPropertyTypes: {
    entityType: EntityType;
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

  const [propertyTypeOptionsWithMetadata, propertyTypeOptions] = useMemo(() => {
    const propertyTypesWithMetadata = {
      ...possiblyIncompletePropertyTypeOptions,
      ...entityTypeAndPropertyTypes.propertyTypes,
    };

    return [
      propertyTypesWithMetadata,
      getTypesWithoutMetadata(propertyTypesWithMetadata),
    ];
  }, [entityTypeAndPropertyTypes, possiblyIncompletePropertyTypeOptions]);

  const [entityTypeOptionsWithMetadata, entityTypeOptions] = useMemo(() => {
    if (!entityTypesContext.entityTypes) {
      return [];
    }

    const entityTypesWithMetadata = Object.fromEntries(
      entityTypesContext.entityTypes.map((entityType) => [
        entityType.schema.$id,
        entityType,
      ]),
    );

    return [
      entityTypesWithMetadata,
      getTypesWithoutMetadata(entityTypesWithMetadata),
    ];
  }, [entityTypesContext.entityTypes]);

  const typesWithMetadata = useMemo(
    () => ({
      ...entityTypeOptionsWithMetadata,
      ...propertyTypeOptionsWithMetadata,
    }),
    [entityTypeOptionsWithMetadata, propertyTypeOptionsWithMetadata],
  );

  const ontologyFunctions = useEditorOntologyFunctions(
    ownedById,
    typesWithMetadata,
  );

  if (!entityTypeOptions) {
    return null;
  }

  return (
    <EntityTypeEditor
      customization={{ onNavigateToType }}
      entityType={entityTypeAndPropertyTypes.entityType}
      entityTypeOptions={entityTypeOptions}
      key={entityTypeAndPropertyTypes.entityType.$id} // Reset state when switching entity types, helps avoid state mismatch issues
      ontologyFunctions={ontologyFunctions}
      propertyTypeOptions={propertyTypeOptions}
      readonly={readonly}
    />
  );
};
