import { useQuery } from "@apollo/client";
import { PenRegularIcon } from "@hashintel/design-system";
import type { Filter } from "@local/hash-graph-client";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { EntityRootType } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
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
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../graphql/queries/knowledge/entity.queries";
import { useDraftEntities } from "../shared/draft-entities-context";
import { BarsSortRegularIcon } from "../shared/icons/bars-sort-regular-icon";
import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { MenuItem } from "../shared/ui";
import type { SortOrder } from "./actions.page/draft-entities";
import { DraftEntities } from "./actions.page/draft-entities";
import { DraftEntitiesBulkActionsDropdown } from "./actions.page/draft-entities-bulk-actions-dropdown";
import { InlineSelect } from "./shared/inline-select";
import { NotificationsWithLinksContextProvider } from "./shared/notifications-with-links-context";
import { TopContextBar } from "./shared/top-context-bar";

const sortOrderHumanReadable: Record<SortOrder, string> = {
  "created-at-asc": "creation date/time (oldest first)",
  "created-at-desc": "creation date/time (newest first)",
};

const ActionsPage: NextPageWithLayout = () => {
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
  ] = useState<GetEntitySubgraphQuery>();

  const { data: draftEntitiesWithLinkedDataResponse } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      request: {
        filter: getDraftEntitiesFilter,
        includeDrafts: true,
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: {
          isOfType: { outgoing: 1 },
          inheritsFrom: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsValuesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 255 },
          constrainsLinkDestinationsOn: { outgoing: 255 },
          hasLeftEntity: { outgoing: 1, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 1 },
        },
      },
      includePermissions: false,
    },
    skip: !draftEntities,
    onCompleted: (data) =>
      setPreviouslyFetchedDraftEntitiesWithLinkedDataResponse(data),
    fetchPolicy: "network-only",
  });

  const draftEntitiesWithLinkedDataSubgraph = useMemo(
    () =>
      (draftEntitiesWithLinkedDataResponse ??
      previouslyFetchedDraftEntitiesWithLinkedDataResponse)
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            (draftEntitiesWithLinkedDataResponse ??
              previouslyFetchedDraftEntitiesWithLinkedDataResponse)!
              .getEntitySubgraph.subgraph,
          )
        : undefined,
    [
      draftEntitiesWithLinkedDataResponse,
      previouslyFetchedDraftEntitiesWithLinkedDataResponse,
    ],
  );

  return (
    <NotificationsWithLinksContextProvider>
      <NextSeo title="Drafts" />
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Drafts",
            id: "drafts",
            icon: <PenRegularIcon />,
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
              columnGap={1}
              sx={{
                "> div": {
                  lineHeight: 0,
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
        sortOrder={sortOrder}
        selectedDraftEntityIds={selectedDraftEntityIds}
        setSelectedDraftEntityIds={setSelectedDraftEntityIds}
        draftEntitiesWithLinkedDataSubgraph={
          draftEntitiesWithLinkedDataSubgraph
        }
      />
    </NotificationsWithLinksContextProvider>
  );
};

ActionsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ActionsPage;
