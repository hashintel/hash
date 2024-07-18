import { useMutation } from "@apollo/client";
import type { MultiFilter } from "@blockprotocol/graph";
import type { ModalProps } from "@hashintel/design-system";
import { IconButton, Modal } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId, PropertyObject } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  blockProtocolEntityTypes,
  blockProtocolLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  Query,
  QueryProperties,
  QueryPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/blockprotocol/query";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";

import { useFetchBlockSubgraph } from "../../../../blocks/use-fetch-block-subgraph";
import { useBlockProtocolCreateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
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

  const existingQuery = useMemo(() => {
    if (!blockDataEntity || !blockSubgraph) {
      return undefined;
    }

    const existingQueries = getOutgoingLinkAndTargetEntities(
      blockSubgraph,
      blockDataEntity.metadata.recordId.entityId,
    )
      .filter(
        ({ linkEntity: linkEntityRevisions }) =>
          linkEntityRevisions[0]?.metadata.entityTypeId ===
          blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
      )
      .map(({ rightEntity }) => rightEntity[0] as Entity<Query>);

    return existingQueries[0];
  }, [blockSubgraph, blockDataEntity]);

  const [initialQueryEntityId, setInitialQueryEntityId] = useState<EntityId>();

  if (!initialQueryEntityId && existingQuery) {
    setInitialQueryEntityId(existingQuery.metadata.recordId.entityId);
  }

  const { authenticatedUser } = useAuthenticatedUser();

  const { createEntity } = useBlockProtocolCreateEntity(
    authenticatedUser.accountId as OwnedById,
  );

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const handleSave = useCallback(
    async (query: MultiFilter) => {
      if (existingQuery) {
        await updateEntity({
          variables: {
            entityUpdate: {
              entityId: existingQuery.metadata.recordId.entityId,
              propertyPatches: [
                {
                  op: "add",
                  path: [
                    "https://blockprotocol.org/@hash/types/property-type/query/" satisfies keyof Query["properties"] as BaseUrl,
                  ],
                  property: {
                    value: query,
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                    },
                  } satisfies QueryPropertyValueWithMetadata,
                },
              ],
            },
          },
        });
      } else {
        if (!blockDataEntity) {
          return;
        }

        const { data: queryEntity } = await createEntity({
          data: {
            entityTypeId: blockProtocolEntityTypes.query.entityTypeId,
            properties: {
              "https://blockprotocol.org/@hash/types/property-type/query/":
                query,
            } satisfies QueryProperties as PropertyObject,
          },
        });

        /** @todo: improve error handling */
        if (!queryEntity) {
          throw new Error("Failed to create query entity");
        }

        await createEntity({
          data: {
            entityTypeId:
              blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
            linkData: {
              leftEntityId: blockDataEntity.metadata.recordId.entityId,
              rightEntityId: queryEntity.metadata.recordId.entityId,
            },
            properties: {},
          },
        });
      }

      await refetchBlockSubgraph();

      onClose();
    },
    [
      updateEntity,
      refetchBlockSubgraph,
      blockDataEntity,
      existingQuery,
      createEntity,
      onClose,
    ],
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
      contentStyle={{
        overflow: "hidden",
        p: { xs: 0, md: 0 },
        width: { xs: "fit-content", sm: "fit-content" },
        maxWidth: "90vw",
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
        <EntityQueryEditor
          sx={{ marginBottom: 2 }}
          entityTypes={entityTypeSchemas}
          propertyTypes={propertyTypeSchemas}
          /**
           * This ensures the query editor is initialized with the query
           * incase it isn't available in the first render.
           */
          key={initialQueryEntityId ?? "new-query"}
          defaultValue={
            existingQuery
              ? (simplifyProperties(existingQuery.properties)
                  .query as MultiFilter)
              : undefined
          }
          onSave={handleSave}
          saveTitle={`${existingQuery ? "Update" : "Create"} query`}
          discardTitle={existingQuery ? "Discard changes" : "Reset query"}
        />
      </Box>
    </Modal>
  );
};
