import { EntityType } from "@blockprotocol/graph";
import { PropertyType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { EntityTypeEditor } from "@hashintel/type-editor";
import { OwnedById } from "@local/hash-subgraph";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { isHrefExternal } from "../../../../../shared/is-href-external";
import { useEditorOntologyFunctions } from "./definition-tab/use-editor-ontology-functions";
import { useLatestPropertyTypes } from "./shared/latest-property-types-context";

type DefinitionTabProps = {
  ownedById?: OwnedById;
  entityTypeAndPropertyTypes: {
    entityType: EntityType;
    propertyTypes: Record<VersionedUrl, PropertyType>;
  };
  readonly: boolean;
};

export const DefinitionTab = ({
  entityTypeAndPropertyTypes,
  ownedById,
  readonly,
}: DefinitionTabProps) => {
  const ontologyFunctions = useEditorOntologyFunctions(ownedById ?? null);

  const router = useRouter();

  const entityTypesContext = useEntityTypesContextRequired();
  const possiblyIncompletePropertyTypeOptions = useLatestPropertyTypes();

  const propertyTypeOptions = useMemo(() => {
    return {
      ...possiblyIncompletePropertyTypeOptions,
      ...entityTypeAndPropertyTypes.propertyTypes,
    };
  }, [entityTypeAndPropertyTypes, possiblyIncompletePropertyTypeOptions]);

  const entityTypeOptions = useMemo<Record<VersionedUrl, EntityType>>(() => {
    return Object.fromEntries(
      (entityTypesContext.entityTypes ?? []).map((entityType) => [
        entityType.schema.$id,
        entityType.schema,
      ]),
    );
  }, [entityTypesContext.entityTypes]);

  const onNavigateToType = (url: string) => {
    if (isHrefExternal(url)) {
      window.open(url);
    } else {
      void router.push(url);
    }
  };

  return (
    <EntityTypeEditor
      customization={{ onNavigateToType }}
      entityType={entityTypeAndPropertyTypes.entityType}
      entityTypeOptions={entityTypeOptions}
      ontologyFunctions={ontologyFunctions}
      propertyTypeOptions={propertyTypeOptions}
      readonly={readonly}
    />
  );
};
