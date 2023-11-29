import { MultiFilter } from "@blockprotocol/graph";
import { IconButton, Modal, ModalProps } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import {
  blockProtocolEntityTypes,
  blockProtocolLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { QueryProperties } from "@local/hash-isomorphic-utils/system-types/blockprotocol/query";
import { Entity, OwnedById } from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { Box, Typography } from "@mui/material";
import { FunctionComponent, useCallback, useMemo } from "react";

import { useFetchBlockSubgraph } from "../../../../blocks/use-fetch-block-subgraph";
import { useBlockProtocolCreateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolUpdateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useLatestEntityTypesOptional } from "../../../../shared/entity-types-context/hooks";
import { XMarkRegularIcon } from "../../../../shared/icons/x-mark-regular-icon";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { useAuthenticatedUser } from "../../auth-info-context";
import { useBlockContext } from "../block-context";

export const BlockSelectDataModal: FunctionComponent<
  Omit<ModalProps, "children" | "onClose"> & {
    onClose: () => void;
  }
> = ({ onClose, ...modalProps }) => {
  const { propertyTypes } = usePropertyTypes({ latestOnly: true });
  const { latestEntityTypes } = useLatestEntityTypesOptional();

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
          blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
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
          entityTypeId: blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
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

  /** @todo: consider bringing back ability to query entities */
  // const { queryEntities } = useBlockProtocolQueryEntities();

  // const handleQueryEntities = useCallback(
  //   async (multiFilter: MultiFilter) => {
  //     const res = await queryEntities({
  //       data: {
  //         operation: { multiFilter },
  //         graphResolveDepths: zeroedGraphResolveDepths,
  //       },
  //     });

  //     if (!res.data) {
  //       throw new Error(res.errors?.[0]?.message ?? "Unknown error");
  //     }

  //     return getRoots(res.data);
  //   },
  //   [queryEntities],
  // );

  const entityTypeSchemas = useMemo(
    () => latestEntityTypes?.map((type) => type.schema) ?? [],
    [latestEntityTypes],
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
      <Box paddingX={3} paddingY={2}>
        <Box display="flex" justifyContent="space-between" marginBottom={2}>
          <Box>
            <Typography
              gutterBottom
              sx={{
                fontSize: 16,
                fontWeight: 500,
                color: ({ palette }) => palette.gray[80],
              }}
            >
              Select display data
            </Typography>
            <Typography
              sx={{ fontSize: 14, color: ({ palette }) => palette.gray[80] }}
            >
              Define a query to select the data for the block
            </Typography>
          </Box>
          <Box>
            <IconButton
              onClick={onClose}
              sx={{ marginRight: -2, marginTop: -1 }}
            >
              <XMarkRegularIcon />
            </IconButton>
          </Box>
        </Box>
        {existingQueries?.map((queryEntity) => (
          <EntityQueryEditor
            key={queryEntity.metadata.recordId.entityId}
            entityTypes={entityTypeSchemas}
            propertyTypes={propertyTypeSchemas}
            defaultValue={
              simplifyProperties(queryEntity.properties).query as MultiFilter
            }
            onSave={updateQueryEntityQuery(queryEntity)}
            saveTitle="Update Query"
            discardTitle="Discard changes"
          />
        ))}
        {/* @todo: allow for creation of multiple queries */}
        {existingQueries && existingQueries.length === 0 ? (
          <EntityQueryEditor
            entityTypes={entityTypeSchemas}
            propertyTypes={propertyTypeSchemas}
            onSave={handleSaveNewQuery}
            saveTitle="Create Query"
            discardTitle="Reset Query"
          />
        ) : null}
      </Box>
    </Modal>
  );
};
