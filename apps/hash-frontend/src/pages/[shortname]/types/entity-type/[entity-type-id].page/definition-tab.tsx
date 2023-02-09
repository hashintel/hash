import { EntityType } from "@blockprotocol/graph";
import { PropertyType, VersionedUri } from "@blockprotocol/type-system/slim";
import { EntityTypeEditor } from "@hashintel/type-editor";
import { OwnedById } from "@local/hash-isomorphic-utils/types";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useEditorOntologyFunctions } from "./definition-tab/use-editor-ontology-functions";
import { useLatestPropertyTypes } from "./latest-property-types-context";

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

  const entityTypesContext = useEntityTypesContextRequired();
  const possiblyIncompletePropertyTypeOptions = useLatestPropertyTypes();

  const propertyTypeOptions = useMemo(() => {
    return {
      ...possiblyIncompletePropertyTypeOptions,
      ...entityTypeAndPropertyTypes.propertyTypes,
    };
  }, [entityTypeAndPropertyTypes, possiblyIncompletePropertyTypeOptions]);

  const entityTypeOptions = useMemo<Record<VersionedUri, EntityType>>(() => {
    return Object.fromEntries(
      (entityTypesContext.entityTypes ?? []).map((entityType) => [
        entityType.schema.$id,
        entityType.schema,
      ]),
    );
  }, [entityTypesContext.entityTypes]);

  return (
    <EntityTypeEditor
      entityType={entityTypeAndPropertyTypes.entityType}
      entityTypeOptions={entityTypeOptions}
      ontologyFunctions={ontologyFunctions}
      propertyTypeOptions={propertyTypeOptions}
    />
  );
};
