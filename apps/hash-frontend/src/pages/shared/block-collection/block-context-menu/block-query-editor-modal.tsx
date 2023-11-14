import { MultiFilter } from "@blockprotocol/graph";
import { Modal, ModalProps } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { QueryProperties } from "@local/hash-isomorphic-utils/system-types/blockprotocol/query";
import { Entity, OwnedById } from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { Box } from "@mui/material";
import { FunctionComponent, useCallback, useMemo } from "react";

import { useFetchBlockSubgraph } from "../../../../blocks/use-fetch-block-subgraph";
import { useBlockProtocolCreateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolQueryEntities } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import { useBlockProtocolUpdateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useLatestEntityTypesOptional } from "../../../../shared/entity-types-context/hooks";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { useAuthenticatedUser } from "../../auth-info-context";
import { useBlockContext } from "../block-context";

export const BlockQueryEditorModal: FunctionComponent<
  Omit<ModalProps, "children" | "onClose"> & {
    onClose: () => void;
  }
> = ({ onClose, ...modalProps }) => {
  const { propertyTypes } = usePropertyTypes({ latestOnly: true });
  const entityTypes = useLatestEntityTypesOptional();

  const { blockSubgraph, setBlockSubgraph } = useBlockContext();
  const fetchBlockSubgraph = useFetchBlockSubgraph();

  const blockDataEntity = useMemo(
    () => (blockSubgraph ? getRoots(blockSubgraph)[0] : undefined),
    [blockSubgraph],
  );

  const refetchBlockSubgraph = useCallback(async () => {
    if (!blockDataEntity) {
      return;
    }
    const { recordId, entityTypeId } = blockDataEntity.metadata;

    const { subgraph } = await fetchBlockSubgraph(
      entityTypeId,
      recordId.entityId,
    );

    setBlockSubgraph(subgraph);
  }, [blockDataEntity, fetchBlockSubgraph, setBlockSubgraph]);

  const existingQueries = useMemo(() => {
    if (!blockDataEntity || !blockSubgraph) {
      return undefined;
    }

    return getOutgoingLinkAndTargetEntities(
      blockSubgraph,
      blockDataEntity.metadata.recordId.entityId,
    )
      .filter(
        ({ linkEntity: linkEntityRevisions }) =>
          linkEntityRevisions[0]?.metadata.entityTypeId ===
          blockProtocolEntityTypes.hasQuery.entityTypeId,
      )
      .sort(
        (
          { linkEntity: aLinkEntityRevisions },
          { linkEntity: bLinkEntityRevisions },
        ) =>
          bLinkEntityRevisions[0]!.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
            aLinkEntityRevisions[0]!.metadata.temporalVersioning.decisionTime
              .start.limit,
          ),
      )
      .map(({ rightEntity }) => rightEntity[0] as Entity<QueryProperties>);
  }, [blockSubgraph, blockDataEntity]);

  const { updateEntity } = useBlockProtocolUpdateEntity();

  const updateQueryEntityQuery = useCallback(
    (currentQueryEntity: Entity) => async (updatedQuery: MultiFilter) => {
      await updateEntity({
        data: {
          entityId: currentQueryEntity.metadata.recordId.entityId,
          entityTypeId: currentQueryEntity.metadata.entityTypeId,
          properties: {
            ...currentQueryEntity.properties,
            "https://blockprotocol.org/@hash/types/property-type/query/":
              updatedQuery,
          } as QueryProperties,
        },
      });

      await refetchBlockSubgraph();
    },
    [updateEntity, refetchBlockSubgraph],
  );

  const { authenticatedUser } = useAuthenticatedUser();

  const { createEntity } = useBlockProtocolCreateEntity(
    authenticatedUser.accountId as OwnedById,
  );

  const handleSaveNewQuery = useCallback(
    async (query: MultiFilter) => {
      if (!blockDataEntity) {
        return;
      }

      const { data: queryEntity } = await createEntity({
        data: {
          entityTypeId: blockProtocolEntityTypes.query.entityTypeId,
          properties: {
            "https://blockprotocol.org/@hash/types/property-type/query/": query,
          } as QueryProperties,
        },
      });

      /** @todo: improve error handling */
      if (!queryEntity) {
        throw new Error("Failed to create query entity");
      }

      await createEntity({
        data: {
          entityTypeId: blockProtocolEntityTypes.hasQuery.entityTypeId,
          linkData: {
            leftEntityId: blockDataEntity.metadata.recordId.entityId,
            rightEntityId: queryEntity.metadata.recordId.entityId,
          },
          properties: {},
        },
      });

      await refetchBlockSubgraph();
    },
    [createEntity, blockDataEntity, refetchBlockSubgraph],
  );

  const handleDiscardQuery = useCallback(() => {}, []);

  const { queryEntities } = useBlockProtocolQueryEntities();

  const handleQueryEntities = useCallback(
    async (multiFilter: MultiFilter) => {
      const res = await queryEntities({
        data: {
          operation: { multiFilter },
          graphResolveDepths: zeroedGraphResolveDepths,
        },
      });

      if (!res.data) {
        throw new Error(res.errors?.[0]?.message ?? "Unknown error");
      }

      return getRoots(res.data);
    },
    [queryEntities],
  );

  const entityTypeSchemas = useMemo(
    () => entityTypes?.map((type) => type.schema) ?? [],
    [entityTypes],
  );

  const propertyTypeSchemas = useMemo(
    () => Object.values(propertyTypes ?? {}).map((type) => type.schema),
    [propertyTypes],
  );

  return (
    <Modal
      {...modalProps}
      sx={{
        "> div": {
          overflow: "hidden",
          padding: 0,
        },
      }}
      onClose={onClose}
    >
      <Box>
        {existingQueries?.map((queryEntity) => (
          <EntityQueryEditor
            key={queryEntity.metadata.recordId.entityId}
            entityTypes={entityTypeSchemas}
            propertyTypes={propertyTypeSchemas}
            defaultValue={
              simplifyProperties(queryEntity.properties).query as MultiFilter
            }
            onSave={updateQueryEntityQuery(queryEntity)}
            /** @todo: figure out what to put here */
            onDiscard={() => {}}
            queryEntities={handleQueryEntities}
          />
        ))}
        {/* @todo: allow for creation of multiple queries */}
        {existingQueries && existingQueries.length === 0 ? (
          <EntityQueryEditor
            entityTypes={entityTypeSchemas}
            propertyTypes={propertyTypeSchemas}
            onSave={handleSaveNewQuery}
            onDiscard={handleDiscardQuery}
            queryEntities={handleQueryEntities}
          />
        ) : null}
      </Box>
    </Modal>
  );
};
