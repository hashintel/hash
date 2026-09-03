import { useLazyQuery } from "@apollo/client";
import { useCallback, useMemo, useRef, useState } from "react";

import { getEntityTypes } from "@blockprotocol/graph/stdlib";

import { useBlockProtocolQueryEntityTypes } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-entity-types";
import { checkUserPermissionsOnEntityTypesQuery } from "../../../graphql/queries/ontology/entity-type.queries";
import {
  getParentIds,
  isSpecialEntityType,
} from "../shared/is-special-entity-type";

import type {
  CheckUserPermissionsOnEntityTypesQuery,
  CheckUserPermissionsOnEntityTypesQueryVariables,
} from "../../../graphql/api-types.gen";
import type {
  EntityTypesContextValue,
  SpecialEntityTypeRecord,
} from "../shared/context-types";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { UserPermissionsOnEntityType } from "@local/hash-graph-sdk/authorization";

export const useEntityTypesContextValue = (): EntityTypesContextValue => {
  const [types, setTypes] = useState<
    Omit<
      EntityTypesContextValue,
      "refetch" | "ensureFetched" | "entityTypePermissions"
    >
  >({
    entityTypes: null,
    isSpecialEntityTypeLookup: null,
    includesSpecialEntityTypes: null,
    entityTypeParentIds: null,
    loading: true,
    subgraph: null,
  });

  const [entityTypePermissions, setEntityTypePermissions] = useState<Record<
    VersionedUrl,
    UserPermissionsOnEntityType
  > | null>(null);

  const { queryEntityTypes } = useBlockProtocolQueryEntityTypes();

  const [checkEntityTypePermissions] = useLazyQuery<
    CheckUserPermissionsOnEntityTypesQuery,
    CheckUserPermissionsOnEntityTypesQueryVariables
  >(checkUserPermissionsOnEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
  });

  const controllerRef = useRef<AbortController | null>(null);

  const fetched = useRef(false);

  const fetch = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    fetched.current = true;

    setTypes((currentTypes) => ({ ...currentTypes, loading: true }));

    const res = await queryEntityTypes({
      data: {
        latestOnly: false,
        includeArchived: true,
      },
    });

    if (controller.signal.aborted) {
      throw new Error("Request was aborted");
    }

    const subgraph = res.data;
    const entityTypes = subgraph ? getEntityTypes(subgraph) : [];

    const typesByVersion: Record<VersionedUrl, EntityTypeWithMetadata> =
      Object.fromEntries(entityTypes.map((type) => [type.schema.$id, type]));

    const isSpecialEntityTypeLookup = Object.fromEntries(
      entityTypes.map((type) => [
        type.schema.$id,
        isSpecialEntityType(type.schema, typesByVersion),
      ]),
    );

    const entityTypeParentIds = Object.fromEntries(
      entityTypes.map((type) => [
        type.schema.$id,
        getParentIds(type.schema, typesByVersion),
      ]),
    );

    const includesSpecialEntityTypes = (
      entityTypeIds: VersionedUrl[],
    ): SpecialEntityTypeRecord => {
      const specialTypeRecord: SpecialEntityTypeRecord = {
        isFile: false,
        isImage: false,
        isLink: false,
      };

      for (const entityTypeId of entityTypeIds) {
        const record = isSpecialEntityTypeLookup[entityTypeId];

        if (record) {
          specialTypeRecord.isFile = specialTypeRecord.isFile || record.isFile;
          specialTypeRecord.isImage =
            specialTypeRecord.isImage || record.isImage;
          specialTypeRecord.isLink = specialTypeRecord.isLink || record.isLink;
        }
      }

      return specialTypeRecord;
    };

    setTypes({
      entityTypes,
      entityTypeParentIds,
      isSpecialEntityTypeLookup,
      includesSpecialEntityTypes,
      subgraph: subgraph ?? null,
      loading: false,
    });

    // Fetch permissions separately so the types above aren't blocked on it
    const entityTypeIds = entityTypes.map((type) => type.schema.$id);
    if (entityTypeIds.length === 0) {
      setEntityTypePermissions({});
    } else {
      void checkEntityTypePermissions({
        variables: { entityTypeIds },
      }).then(({ data }) => {
        if (controller.signal.aborted || !data) {
          return;
        }
        setEntityTypePermissions(
          Object.fromEntries(
            data.checkUserPermissionsOnEntityTypes.map((record) => [
              record.entityTypeId,
              record.permissions,
            ]),
          ),
        );
      });
    }
  }, [checkEntityTypePermissions, queryEntityTypes]);

  const ensureFetched = useCallback(() => {
    if (!fetched.current) {
      fetched.current = true;
      void fetch();
    }
  }, [fetch]);

  return useMemo(
    () => ({ ...types, entityTypePermissions, refetch: fetch, ensureFetched }),
    [fetch, types, entityTypePermissions, ensureFetched],
  );
};
