import { useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { EntityId } from "@blockprotocol/type-system";
import {
  compareOntologyTypeVersions,
  componentsFromVersionedUrl,
  extractEntityUuidFromEntityId,
} from "@blockprotocol/type-system";
import { CheckRegularIcon } from "@hashintel/design-system";
import { linkEntityTypeUrl } from "@hashintel/type-editor/src/shared/urls";
import type { Filter } from "@local/hash-graph-client";
import {
  getClosedMultiEntityTypeFromMap,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  Box,
  breadcrumbsClasses,
  buttonClasses,
  inputBaseClasses,
  selectClasses,
  Typography,
} from "@mui/material";
import { NextSeo } from "next-seo";
import { useMemo, useState } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../graphql/queries/knowledge/entity.queries";
import { BarsSortRegularIcon } from "../shared/icons/bars-sort-regular-icon";
import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { MenuItem } from "../shared/ui";
import type { SortOrder } from "./actions.page/draft-entities";
import { DraftEntities } from "./actions.page/draft-entities";
import type { EntityTypeDisplayInfoByBaseUrl } from "./actions.page/draft-entities/types";
import { DraftEntitiesBulkActionsDropdown } from "./actions.page/draft-entities-bulk-actions-dropdown";
import {
  DraftEntitiesContextProvider,
  useDraftEntities,
} from "./actions.page/draft-entities-context";
import { InlineSelect } from "./shared/inline-select";
import { TopContextBar } from "./shared/top-context-bar";

const sortOrderHumanReadable: Record<SortOrder, string> = {
  "created-at-asc": "creation date/time (oldest first)",
  "created-at-desc": "creation date/time (newest first)",
};

const ActionsPage = () => {
  const [selectedDraftEntityIds, setSelectedDraftEntityIds] = useState<
    EntityId[]
  >([]);

  const [sortOrder, setSortOrder] = useState<SortOrder>("created-at-desc");

  const { draftEntities } = useDraftEntities();

  const getDraftEntitiesFilter = useMemo<Filter>(
    () => ({
      any:
        draftEntities?.map((draftEntity) => ({
          equal: [
            { path: ["uuid"] },
            {
              parameter: extractEntityUuidFromEntityId(
                draftEntity.metadata.recordId.entityId,
              ),
            },
          ],
        })) ?? [],
    }),
    [draftEntities],
  );

  const [
    previouslyFetchedDraftEntitiesWithLinkedDataResponse,
    setPreviouslyFetchedDraftEntitiesWithLinkedDataResponse,
  ] = useState<QueryEntitySubgraphQuery>();

  const { data: draftEntitiesWithLinkedDataResponse } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: getDraftEntitiesFilter,
        includeDrafts: true,
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: { outgoing: 1, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 1 },
        },
        includeEntityTypes: "resolved",
        includePermissions: false,
      },
    },
    skip: !draftEntities,
    onCompleted: (data) =>
      setPreviouslyFetchedDraftEntitiesWithLinkedDataResponse(data),
    fetchPolicy: "network-only",
  });

  const {
    draftEntitiesWithLinkedDataSubgraph,
    entities,
    closedMultiEntityTypesRootMap,
  } = useMemo(() => {
    if (
      !draftEntitiesWithLinkedDataResponse &&
      !previouslyFetchedDraftEntitiesWithLinkedDataResponse
    ) {
      return {
        draftEntitiesWithLinkedDataSubgraph: undefined,
        entities: undefined,
        closedMultiEntityTypesRootMap: undefined,
      };
    }

    const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<
      EntityRootType<HashEntity>
    >(
      (draftEntitiesWithLinkedDataResponse ??
        previouslyFetchedDraftEntitiesWithLinkedDataResponse)!
        .queryEntitySubgraph.subgraph,
    );

    const roots = getRoots(subgraph);

    const closedTypeMap = (draftEntitiesWithLinkedDataResponse ??
      previouslyFetchedDraftEntitiesWithLinkedDataResponse)!.queryEntitySubgraph
      .closedMultiEntityTypes;

    return {
      draftEntitiesWithLinkedDataSubgraph: subgraph,
      entities: roots,
      closedMultiEntityTypesRootMap: closedTypeMap,
    };
  }, [
    draftEntitiesWithLinkedDataResponse,
    previouslyFetchedDraftEntitiesWithLinkedDataResponse,
  ]);

  const entityTypeDisplayInfoByBaseUrl = useMemo(() => {
    if (!entities || !closedMultiEntityTypesRootMap) {
      return undefined;
    }

    const displayInfoByBaseUrl: EntityTypeDisplayInfoByBaseUrl = {};

    for (const entity of entities) {
      const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
        closedMultiEntityTypesRootMap,
        entity.metadata.entityTypeIds,
      );

      for (const displayMetadata of closedMultiEntityType.allOf) {
        const { baseUrl, version } = componentsFromVersionedUrl(
          displayMetadata.$id,
        );

        const existingEntry = displayInfoByBaseUrl[baseUrl];

        if (
          existingEntry &&
          compareOntologyTypeVersions(existingEntry.version, version) >= 0
        ) {
          continue;
        }

        const { title } = displayMetadata;

        let icon: string | undefined;
        let isLink = false;
        for (const selfOrAncestor of displayMetadata.allOf) {
          if (selfOrAncestor.icon) {
            icon = selfOrAncestor.icon;
          }

          if (selfOrAncestor.$id === linkEntityTypeUrl) {
            isLink = true;
          }

          if (icon && isLink) {
            break;
          }
        }

        displayInfoByBaseUrl[baseUrl] = {
          baseUrl,
          icon,
          isLink,
          title,
          version,
        };
      }
    }

    return displayInfoByBaseUrl;
  }, [entities, closedMultiEntityTypesRootMap]);

  return (
    <>
      <NextSeo title="Actions" />
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Actions",
            id: "actions",
            icon: <CheckRegularIcon />,
          },
        ]}
        sx={{
          background: "transparent",
          [`.${breadcrumbsClasses.ol} .${buttonClasses.root}`]: {
            background: "transparent",
            borderColor: "transparent",
          },
        }}
        breadcrumbsEndAdornment={
          <Box display="flex" alignItems="center">
            <Box
              display="flex"
              alignItems="center"
              columnGap={0.5}
              sx={{
                "> div": {
                  [`.${selectClasses.select}.${inputBaseClasses.input}`]: {
                    fontSize: 14,
                    height: 14,
                  },
                },
              }}
            >
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: ({ palette }) => palette.gray[70],
                  lineHeight: 1,
                }}
              >
                <BarsSortRegularIcon
                  sx={{
                    fontSize: 14,
                    marginRight: 0.5,
                    position: "relative",
                    top: 2,
                  }}
                />
                Sort by
              </Typography>
              <InlineSelect
                value={sortOrder}
                onChange={({ target }) =>
                  setSortOrder(target.value as SortOrder)
                }
              >
                {Object.entries(sortOrderHumanReadable).map(
                  ([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ),
                )}
              </InlineSelect>
            </Box>
            <DraftEntitiesBulkActionsDropdown
              deselectAllDraftEntities={() => setSelectedDraftEntityIds([])}
              draftEntitiesWithLinkedDataSubgraph={
                draftEntitiesWithLinkedDataSubgraph
              }
              selectedDraftEntityIds={selectedDraftEntityIds}
            />
          </Box>
        }
      />
      <DraftEntities
        closedMultiEntityTypesRootMap={
          closedMultiEntityTypesRootMap ?? undefined
        }
        entityTypeDisplayInfoByBaseUrl={entityTypeDisplayInfoByBaseUrl}
        sortOrder={sortOrder}
        selectedDraftEntityIds={selectedDraftEntityIds}
        setSelectedDraftEntityIds={setSelectedDraftEntityIds}
        draftEntitiesWithLinkedDataSubgraph={
          draftEntitiesWithLinkedDataSubgraph
        }
      />
    </>
  );
};

const ActionsPageOuter: NextPageWithLayout = () => {
  return (
    <DraftEntitiesContextProvider>
      <ActionsPage />
    </DraftEntitiesContextProvider>
  );
};

ActionsPageOuter.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ActionsPageOuter;
