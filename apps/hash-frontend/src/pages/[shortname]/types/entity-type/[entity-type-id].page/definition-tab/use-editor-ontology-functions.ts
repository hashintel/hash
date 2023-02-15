import { EntityTypeEditorProps } from "@hashintel/type-editor";
import { OwnedById } from "@local/hash-isomorphic-utils/types";
import { getEntityTypeById } from "@local/hash-subgraph/src/stdlib/element/entity-type";
import { getPropertyTypeById } from "@local/hash-subgraph/src/stdlib/element/property-type";
import { useCallback } from "react";

import { useBlockProtocolCreateEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-entity-type";
import { useBlockProtocolCreatePropertyType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-property-type";
import { useBlockProtocolGetEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { useBlockProtocolGetPropertyType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-property-type";
import { useBlockProtocolUpdateEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-update-entity-type";
import { useBlockProtocolUpdatePropertyType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-update-property-type";
import { useFetchEntityTypes } from "../../../../../../shared/entity-types-context/hooks";
import { useGenerateTypeUrisForUser } from "../../../../../shared/use-generate-type-uris-for-user";
import { useFetchLatestPropertyTypes } from "../shared/latest-property-types-context";

type OntologyFunctions = EntityTypeEditorProps["ontologyFunctions"];

export const useEditorOntologyFunctions = (
  ownedById: OwnedById | null,
): EntityTypeEditorProps["ontologyFunctions"] => {
  const { getEntityType } = useBlockProtocolGetEntityType();
  const { createEntityType } = useBlockProtocolCreateEntityType(ownedById);
  const { updateEntityType } = useBlockProtocolUpdateEntityType();

  const { getPropertyType } = useBlockProtocolGetPropertyType();
  const { createPropertyType } = useBlockProtocolCreatePropertyType(ownedById);
  const { updatePropertyType } = useBlockProtocolUpdatePropertyType();

  const refetchEntityTypes = useFetchEntityTypes();
  const refetchPropertyTypes = useFetchLatestPropertyTypes();

  const wrappedCreateEntityType = useCallback<
    OntologyFunctions["createEntityType"]
  >(
    (args) => {
      return createEntityType(args).then(async (res) => {
        await refetchEntityTypes();
        return res;
      }) as any; // @todo fix this when types consistent
    },
    [createEntityType, refetchEntityTypes],
  );

  const wrappedUpdateEntityType = useCallback<
    OntologyFunctions["updateEntityType"]
  >(
    (args) => {
      return updateEntityType(args).then(async (res) => {
        await refetchEntityTypes();
        return res;
      }) as any; // @todo fix this when types consistent;
    },
    [updateEntityType, refetchEntityTypes],
  );

  const wrappedCreatePropertyType = useCallback<
    OntologyFunctions["createPropertyType"]
  >(
    (args) => {
      return createPropertyType(args).then(async (res) => {
        await refetchPropertyTypes();
        return res;
      }) as any; // @todo fix this when types consistent;;
    },
    [createPropertyType, refetchPropertyTypes],
  );

  const wrappedUpdatePropertyType = useCallback<
    OntologyFunctions["updatePropertyType"]
  >(
    (args) => {
      return updatePropertyType(args).then(async (res) => {
        await refetchPropertyTypes();
        return res;
      }) as any; // @todo fix this when types consistent;;
    },
    [updatePropertyType, refetchPropertyTypes],
  );

  const generateTypeUrisForUser = useGenerateTypeUrisForUser();

  const validateTitle = useCallback<OntologyFunctions["validateTitle"]>(
    async ({ kind, title }) => {
      const { versionedUri } = generateTypeUrisForUser({
        kind,
        title,
        version: 1,
      });

      const res = await (kind === "entity-type"
        ? getEntityType({ data: { entityTypeId: versionedUri } })
        : getPropertyType({ data: { propertyTypeId: versionedUri } }));

      if (!res.data) {
        return {
          allowed: false,
          message: "Error checking whether title exists",
        };
      }

      const typeIsPresent =
        kind === "entity-type"
          ? getEntityTypeById(res.data, versionedUri)
          : getPropertyTypeById(res.data, versionedUri);

      if (typeIsPresent) {
        return {
          allowed: false,
          message: `${
            kind === "entity-type" ? "Entity" : "Property"
          } title must be unique`,
        };
      }

      return {
        allowed: true,
        message: "ok",
      };
    },
    [generateTypeUrisForUser, getEntityType, getPropertyType],
  );

  return {
    createEntityType: wrappedCreateEntityType,
    updateEntityType: wrappedUpdateEntityType,
    createPropertyType: wrappedCreatePropertyType,
    updatePropertyType: wrappedUpdatePropertyType,
    validateTitle,
  };
};
