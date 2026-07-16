import { useMutation } from "@apollo/client";
import { Box, Typography } from "@mui/material";
import { useCallback, useMemo, useState } from "react";

import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import { IconButton, Modal, XMarkRegularIcon } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import {
  blockProtocolEntityTypes,
  blockProtocolLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { useFetchBlockSubgraph } from "../../../../blocks/use-fetch-block-subgraph";
import { useBlockProtocolCreateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { updateEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { useLatestEntityTypesOptional } from "../../../../shared/entity-types-context/hooks";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { useAuthenticatedUser } from "../../auth-info-context";
import { useBlockContext } from "../block-context";

import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import type { MultiFilter } from "@blockprotocol/graph";
import type {
  BaseUrl,
  EntityId,
  PropertyObject,
  WebId,
} from "@blockprotocol/type-system";
import type { ModalProps } from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  Query,
  QueryProperties,
  QueryPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/blockprotocol/query";
import type { FunctionComponent } from "react";

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
    const { recordId, entityTypeIds } = blockDataEntity.metadata;

    const { subgraph } = await fetchBlockSubgraph(
      entityTypeIds,
      recordId.entityId,
    );

    setBlockSubgraph(subgraph);
  }, [blockDataEntity, fetchBlockSubgraph, setBlockSubgraph]);

  const { existingQueryLinkEntity, existingQuery } = useMemo(() => {
    if (!blockDataEntity || !blockSubgraph) {
      return { existingQueryLinkEntity: undefined, existingQuery: undefined };
    }

    const existingQueries = getOutgoingLinkAndTargetEntities(
      blockSubgraph,
      blockDataEntity.metadata.recordId.entityId,
    ).flatMap(({ linkEntity: linkEntityRevisions, rightEntity }) => {
      const linkEntity = linkEntityRevisions[0];

      if (
        !linkEntity?.metadata.entityTypeIds.includes(
          blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
        )
      ) {
        return [];
      }

      /**
       * The query entity may live in a different web to the block (it is
       * created in the web of whichever user configured the block), so the
       * viewer may be able to see the link but not its target. Track the
       * link separately from the target – whether a query already exists
       * must be decided on the link's presence, otherwise saving would
       * create a duplicate query entity and link.
       */
      const targetEntity = rightEntity?.[0] as HashEntity<Query> | undefined;

      return [{ linkEntity, targetEntity }];
    });

    return {
      existingQueryLinkEntity: existingQueries[0]?.linkEntity,
      existingQuery: existingQueries[0]?.targetEntity,
    };
  }, [blockSubgraph, blockDataEntity]);

  const [initialQueryEntityId, setInitialQueryEntityId] = useState<EntityId>();

  if (!initialQueryEntityId && existingQuery) {
    setInitialQueryEntityId(existingQuery.metadata.recordId.entityId);
  }

  const { authenticatedUser } = useAuthenticatedUser();

  const { createEntity } = useBlockProtocolCreateEntity(
    authenticatedUser.accountId as WebId,
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

        if (existingQueryLinkEntity) {
          // the editor is not rendered in this state – guard against creating a duplicate query anyway
          throw new Error(
            `Cannot create a new query for block ${blockDataEntity.metadata.recordId.entityId}: its existing has-query link ${existingQueryLinkEntity.metadata.recordId.entityId} has a target which could not be resolved`,
          );
        }

        const { data: queryEntity } = await createEntity({
          data: {
            entityTypeIds: [blockProtocolEntityTypes.query.entityTypeId],
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
            entityTypeIds: [
              blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
            ],
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
      existingQueryLinkEntity,
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
        {existingQueryLinkEntity && !existingQuery ? (
          /**
           * A query is linked to the block but its entity isn't visible to
           * this user – offering the editor here would create a duplicate
           * query on save.
           */
          <Typography
            sx={{
              fontSize: 14,
              marginBottom: 2,
              color: ({ palette }) => palette.red[70],
            }}
          >
            This block already has a query attached, but it could not be loaded
            – you may not have permission to view it. The query cannot be edited
            or replaced here.
          </Typography>
        ) : (
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
        )}
      </Box>
    </Modal>
  );
};
