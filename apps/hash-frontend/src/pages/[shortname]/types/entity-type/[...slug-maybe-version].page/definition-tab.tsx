import { EntityType } from "@blockprotocol/graph";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { EntityTypeEditor } from "@hashintel/type-editor";
import {
  EntityTypeWithMetadata,
  OwnedById,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { isHrefExternal } from "../../../../../shared/is-href-external";
import { useEditorOntologyFunctions } from "./definition-tab/use-editor-ontology-functions";
import { useLatestPropertyTypes } from "./shared/latest-property-types-context";

const getTypesWithoutMetadata = <
  T extends EntityTypeWithMetadata | PropertyTypeWithMetadata,
>(
  typesWithMetadata: Record<VersionedUrl, T>,
): Record<VersionedUrl, T["schema"]> => {
  return Object.fromEntries(
    Object.entries(typesWithMetadata).map(([$id, typeWithMetadata]) => [
      $id,
      typeWithMetadata.schema,
    ]),
  );
};

type DefinitionTabProps = {
  ownedById?: OwnedById;
  entityTypeAndPropertyTypes: {
    entityType: EntityType;
    propertyTypes: Record<VersionedUrl, PropertyTypeWithMetadata>;
  };
  readonly: boolean;
};

export const DefinitionTab = ({
  entityTypeAndPropertyTypes,
  ownedById,
  readonly,
}: DefinitionTabProps) => {
  const router = useRouter();

  const entityTypesContext = useEntityTypesContextRequired();
  const possiblyIncompletePropertyTypeOptions = useLatestPropertyTypes();

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
    const entityTypesWithMetadata = Object.fromEntries(
      (entityTypesContext.entityTypes ?? []).map((entityType) => [
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
    ownedById ?? null,
    typesWithMetadata,
  );

  const onNavigateToType = (url: string) => {
    if (isHrefExternal(url)) {
      window.open(url);
    } else {
      void router.push(url);
    }
  };

  const onTypePreview = (entityType: EntityType) => {
    console.log(entityType);
  };

  return (
    <EntityTypeEditor
      customization={{ onNavigateToType, onTypePreview }}
      entityType={entityTypeAndPropertyTypes.entityType}
      entityTypeOptions={entityTypeOptions}
      ontologyFunctions={ontologyFunctions}
      propertyTypeOptions={propertyTypeOptions}
      readonly={readonly}
    />
  );
};
