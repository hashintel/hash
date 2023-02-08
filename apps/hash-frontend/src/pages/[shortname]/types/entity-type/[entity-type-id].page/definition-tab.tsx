import { EntityType } from "@blockprotocol/graph";
import { PropertyType, VersionedUri } from "@blockprotocol/type-system/slim";
import { EntityTypeEditor } from "@hashintel/type-editor";
import { useEntityTypesOptions } from "@hashintel/type-editor/src/shared/entity-types-options-context";
import { usePropertyTypesOptions } from "@hashintel/type-editor/src/shared/property-types-options-context";
import { OwnedById } from "@local/hash-isomorphic-utils/types";
import { useMemo } from "react";

import { useEditorOntologyFunctions } from "./definition-tab/use-editor-ontology-functions";

type DefinitionTabProps = {
  ownedById?: OwnedById;
  entityTypeAndPropertyTypes: {
    entityType: EntityType;
    propertyTypes: Record<VersionedUri, PropertyType>;
  };
};

export const DefinitionTab = ({
  entityTypeAndPropertyTypes,
  ownedById,
}: DefinitionTabProps) => {
  const ontologyFunctions = useEditorOntologyFunctions(ownedById ?? null);

  const entityTypeOptions = useEntityTypesOptions();
  const possiblyIncompletePropertyTypeOptions = usePropertyTypesOptions();

  const propertyTypeOptions = useMemo(() => {
    return {
      ...possiblyIncompletePropertyTypeOptions,
      ...entityTypeAndPropertyTypes.propertyTypes,
    };
  }, [entityTypeAndPropertyTypes, possiblyIncompletePropertyTypeOptions]);

  return (
    <EntityTypeEditor
      entityType={entityTypeAndPropertyTypes.entityType}
      entityTypeOptions={entityTypeOptions}
      ontologyFunctions={ontologyFunctions}
      propertyTypeOptions={propertyTypeOptions}
    />
  );
};
