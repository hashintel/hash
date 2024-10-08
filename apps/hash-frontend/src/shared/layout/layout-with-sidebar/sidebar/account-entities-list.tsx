import { IconButton } from "@hashintel/design-system";
import type { OwnedById } from "@local/hash-graph-types/web";
import { blockProtocolHubOrigin } from "@local/hash-isomorphic-utils/blocks";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { isOwnedOntologyElementMetadata } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Collapse, Fade, Tooltip } from "@mui/material";
import { orderBy } from "lodash";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";
import { TransitionGroup } from "react-transition-group";

import { useUpdateAuthenticatedUser } from "../../../../components/hooks/use-update-authenticated-user";
import { hiddenEntityTypeIds } from "../../../../pages/shared/hidden-types";
import { useActiveWorkspace } from "../../../../pages/shared/workspace-context";
import { useLatestEntityTypesOptional } from "../../../entity-types-context/hooks";
import { ArrowDownAZRegularIcon } from "../../../icons/arrow-down-a-z-regular-icon";
import { ArrowUpZARegularIcon } from "../../../icons/arrow-up-a-z-regular-icon";
import { PlusRegularIcon } from "../../../icons/plus-regular";
import { Link } from "../../../ui";
import { useEntityTypeEntities } from "../../../use-entity-type-entities";
import { useUserPreferences } from "../../../use-user-preferences";
import { LoadingSkeleton } from "../shared/loading-skeleton";
import { EntityOrTypeSidebarItem } from "./shared/entity-or-type-sidebar-item";
import { NavLink } from "./shared/nav-link";
import type { SortType } from "./shared/sort-actions-dropdown";
import { SortActionsDropdown } from "./shared/sort-actions-dropdown";
import { ViewAllLink } from "./shared/view-all-link";

type AccountEntitiesListProps = {
  ownedById: OwnedById;
};

export const AccountEntitiesList: FunctionComponent<
  AccountEntitiesListProps
> = ({ ownedById }) => {
  const preferences = useUserPreferences();

  const [expanded, setExpanded] = useState<boolean>(
    preferences.sidebarSections.entities.expanded,
  );

  const [updateUser] = useUpdateAuthenticatedUser();

  const toggleEntitiesExpanded = () => {
    setExpanded(!expanded);

    void updateUser({
      preferences: {
        ...preferences,
        sidebarSections: {
          ...preferences.sidebarSections,
          entities: {
            ...preferences.sidebarSections.entities,
            expanded: !expanded,
          },
        },
      },
    });
  };

  const [sortType, setSortType] = useState<SortType>("asc");
  const sortActionsPopupState = usePopupState({
    variant: "popover",
    popupId: "type-sort-actions-menu",
  });

  const { activeWorkspace } = useActiveWorkspace();

  const {
    latestEntityTypes,
    loading: entityTypesLoading,
    isSpecialEntityTypeLookup,
  } = useLatestEntityTypesOptional();

  const { entities: userEntities, loading: entityTypeEntitiesLoading } =
    useEntityTypeEntities({ ownedById });

  const loading = entityTypesLoading || entityTypeEntitiesLoading;

  const pinnedEntityTypes = useMemo(() => {
    const { pinnedEntityTypeBaseUrls } = activeWorkspace ?? {};

    return pinnedEntityTypeBaseUrls
      ? latestEntityTypes?.filter(({ metadata }) =>
          pinnedEntityTypeBaseUrls.includes(metadata.recordId.baseUrl),
        )
      : [];
  }, [activeWorkspace, latestEntityTypes]);

  const accountEntityTypes = useMemo(() => {
    if (latestEntityTypes) {
      return latestEntityTypes.filter(
        (root) =>
          ((isOwnedOntologyElementMetadata(root.metadata) &&
            root.metadata.ownedById === ownedById) ||
            userEntities?.find((entity) =>
              entity.metadata.entityTypeIds.includes(root.schema.$id),
            )) &&
          // Filter out external types from blockprotocol.org, except the Address type.
          (!root.schema.$id.startsWith(blockProtocolHubOrigin) ||
            root.schema.$id.includes("/address/")) &&
          // Filter out link types and some system types
          !isSpecialEntityTypeLookup?.[root.schema.$id]?.isLink &&
          !hiddenEntityTypeIds.includes(root.schema.$id) &&
          root.schema.$id !== systemEntityTypes.user.entityTypeId,
      );
    }

    return null;
  }, [latestEntityTypes, ownedById, userEntities, isSpecialEntityTypeLookup]);

  const sidebarEntityTypes = useMemo(
    () => [...(pinnedEntityTypes ?? []), ...(accountEntityTypes ?? [])],
    [pinnedEntityTypes, accountEntityTypes],
  );

  const sortedEntityTypes = useMemo(
    () =>
      orderBy(sidebarEntityTypes, (root) => root.schema.title.toLowerCase(), [
        sortType === "asc" || sortType === "desc" ? sortType : "asc",
      ]),
    [sidebarEntityTypes, sortType],
  );

  return (
    <Box>
      <NavLink
        expanded={expanded}
        toggleExpanded={toggleEntitiesExpanded}
        title="Entities"
        endAdornment={
          <Box display="flex" gap={1}>
            <Fade in={expanded}>
              <Tooltip title="Sort types of entities" placement="top">
                <IconButton
                  {...bindTrigger(sortActionsPopupState)}
                  size="small"
                  unpadded
                  rounded
                  sx={({ palette }) => ({
                    color: palette.gray[80],
                    ...(sortActionsPopupState.isOpen && {
                      backgroundColor: palette.gray[30],
                    }),
                    svg: {
                      fontSize: 13,
                    },
                  })}
                >
                  {sortType === "asc" ? (
                    <ArrowDownAZRegularIcon />
                  ) : (
                    <ArrowUpZARegularIcon />
                  )}
                </IconButton>
              </Tooltip>
            </Fade>
            <SortActionsDropdown
              popupState={sortActionsPopupState}
              setSortType={setSortType}
              activeSortType={sortType}
            />
            <Link tabIndex={-1} href="/new/entity" noLinkStyle>
              <Tooltip title="Create new entity " sx={{ left: 5 }}>
                <IconButton
                  data-testid="create-entity-btn"
                  size="small"
                  unpadded
                  rounded
                  className="end-adornment-button"
                  sx={({ palette }) => ({
                    color: palette.gray[80],
                  })}
                >
                  <PlusRegularIcon />
                </IconButton>
              </Tooltip>
            </Link>
          </Box>
        }
      >
        <Box component="ul">
          {loading && sortedEntityTypes.length === 0 ? (
            <LoadingSkeleton />
          ) : (
            <TransitionGroup>
              {sortedEntityTypes.map((root) => (
                <Collapse key={root.schema.$id}>
                  <EntityOrTypeSidebarItem
                    entityType={root}
                    href={`/entities?entityTypeIdOrBaseUrl=${extractBaseUrl(
                      root.schema.$id,
                    )}`}
                    variant="entity"
                  />
                </Collapse>
              ))}
            </TransitionGroup>
          )}

          <Box marginLeft={1} marginTop={0.5}>
            <ViewAllLink href="/entities">View all entities</ViewAllLink>
          </Box>
        </Box>
      </NavLink>
    </Box>
  );
};
