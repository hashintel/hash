import { VersionedUrl } from "@blockprotocol/type-system";
import { EntityTypeEditorProps } from "@hashintel/type-editor";
import {
  EntityTypeWithMetadata,
  OwnedById,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypeById,
} from "@local/hash-subgraph/stdlib";
import { useCallback } from "react";

import { useBlockProtocolCreateEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-entity-type";
import { useBlockProtocolCreatePropertyType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-property-type";
import { useBlockProtocolGetEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { useBlockProtocolGetPropertyType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-property-type";
import { useBlockProtocolUpdateEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-update-entity-type";
import { useBlockProtocolUpdatePropertyType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-update-property-type";
import { useFetchEntityTypes } from "../../../../../../shared/entity-types-context/hooks";
import { canUserEditResource } from "../../../../../../shared/readonly-mode";
import { useAuthInfo } from "../../../../../shared/auth-info-context";
import { useGenerateTypeUrlsForUser } from "../../../../../shared/use-generate-type-urls-for-user";
import { useFetchLatestPropertyTypes } from "../shared/latest-property-types-context";

type OntologyFunctions = EntityTypeEditorProps["ontologyFunctions"];

export const useEditorOntologyFunctions = (
  ownedById: OwnedById | null,
  typesWithMetadata: Record<
    VersionedUrl,
    EntityTypeWithMetadata | PropertyTypeWithMetadata
  >,
): EntityTypeEditorProps["ontologyFunctions"] => {
  const { authenticatedUser } = useAuthInfo();

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
      return createEntityType(args as any).then(async (res) => {
        await refetchEntityTypes();
        return res;
      });
    },
    [createEntityType, refetchEntityTypes],
  );

  const wrappedUpdateEntityType = useCallback<
    OntologyFunctions["updateEntityType"]
  >(
    (args) => {
      return updateEntityType(args as any).then(async (res) => {
        await refetchEntityTypes();
        return res;
      });
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
      });
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
      });
    },
    [updatePropertyType, refetchPropertyTypes],
  );

  const generateTypeUrlsForUser = useGenerateTypeUrlsForUser();

  const validateTitle = useCallback<OntologyFunctions["validateTitle"]>(
    async ({ kind, title }) => {
      const { versionedUrl } = generateTypeUrlsForUser({
        kind,
        title,
        version: 1,
      });

      const res = await (kind === "entity-type"
        ? getEntityType({ data: { entityTypeId: versionedUrl } })
        : getPropertyType({ data: { propertyTypeId: versionedUrl } }));

      if (!res.data) {
        return {
          allowed: false,
          message: "Error checking whether title exists",
        };
      }

      const typeIsPresent =
        kind === "entity-type"
          ? getEntityTypeById(res.data, versionedUrl)
          : getPropertyTypeById(res.data, versionedUrl);

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
    [generateTypeUrlsForUser, getEntityType, getPropertyType],
  );

  const canEditResource = useCallback<OntologyFunctions["canEditResource"]>(
    ({ kind, resource }) => {
      if (!authenticatedUser) {
        return {
          allowed: false,
          message: `Sign in to edit ${
            kind === "link-type" ? "link" : "property"
          } type.`,
        };
      }

      const resourceMetadata = typesWithMetadata[resource.$id]?.metadata;
      const resourceAccountId =
        resourceMetadata &&
        "ownedById" in resourceMetadata &&
        resourceMetadata.ownedById;

      return resourceAccountId &&
        canUserEditResource(resourceAccountId, authenticatedUser)
        ? {
            allowed: true,
            message: "ok",
          }
        : {
            allowed: false,
            message: `Can't edit ${
              kind === "link-type" ? "link entity" : "property"
            } types that belong to other users or organizations you aren't a member of`,
          };
    },
    [typesWithMetadata, authenticatedUser],
  );

  return {
    createEntityType: wrappedCreateEntityType,
    updateEntityType: wrappedUpdateEntityType,
    createPropertyType: wrappedCreatePropertyType,
    updatePropertyType: wrappedUpdatePropertyType,
    validateTitle,
    canEditResource,
  };
};
