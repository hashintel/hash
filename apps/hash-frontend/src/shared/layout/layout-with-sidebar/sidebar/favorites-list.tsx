import { IconButton } from "@hashintel/design-system";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Collapse, Fade, Tooltip } from "@mui/material";
import { orderBy } from "lodash";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { useMemo, useState } from "react";
import { TransitionGroup } from "react-transition-group";

import { useUpdateAuthenticatedUser } from "../../../../components/hooks/use-update-authenticated-user";
import { useLatestEntityTypesOptional } from "../../../entity-types-context/hooks";
import { ArrowDownAZRegularIcon } from "../../../icons/arrow-down-a-z-regular-icon";
import { ArrowUpZARegularIcon } from "../../../icons/arrow-up-a-z-regular-icon";
import { useUserPreferences } from "../../../use-user-preferences";
import { LoadingSkeleton } from "../shared/loading-skeleton";
import { EntityOrTypeSidebarItem } from "./shared/entity-or-type-sidebar-item";
import { NavLink } from "./shared/nav-link";
import type { SortType } from "./shared/sort-actions-dropdown";
import { SortActionsDropdown } from "./shared/sort-actions-dropdown";

export const FavoritesList = () => {
  const preferences = useUserPreferences();

  const [expanded, setExpanded] = useState<boolean>(
    preferences.sidebarSections.favorites.expanded,
  );

  const [updateUser] = useUpdateAuthenticatedUser();

  const toggleFavoritesExpanded = () => {
    setExpanded(!expanded);

    void updateUser({
      preferences: {
        ...preferences,
        sidebarSections: {
          ...preferences.sidebarSections,
          favorites: {
            ...preferences.sidebarSections.favorites,
            expanded: !expanded,
          },
        },
      },
    });
  };

  const [sortType, setSortType] = useState<SortType>("asc");
  const sortActionsPopupState = usePopupState({
    variant: "popover",
    popupId: "favorites-sort-actions-menu",
  });

  const { latestEntityTypes, loading } = useLatestEntityTypesOptional();

  const favoriteEntityTypes = useMemo(() => {
    if (latestEntityTypes) {
      return latestEntityTypes.filter((root) =>
        preferences.favorites.find(
          (favorite) =>
            favorite.type === "entityType" &&
            favorite.entityTypeId === root.schema.$id,
        ),
      );
    }

    return null;
  }, [latestEntityTypes, preferences.favorites]);

  const sortedFavorites = useMemo(
    () =>
      orderBy(favoriteEntityTypes, (root) => root.schema.title.toLowerCase(), [
        sortType === "asc" || sortType === "desc" ? sortType : "asc",
      ]),
    [favoriteEntityTypes, sortType],
  );

  return (
    <Box>
      <NavLink
        expanded={expanded}
        toggleExpanded={toggleFavoritesExpanded}
        title="Favorites"
        endAdornment={
          <Box display="flex" gap={1}>
            <Fade in={expanded}>
              <Tooltip title="Sort favorites" placement="top">
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
          </Box>
        }
      >
        <Box component="ul">
          {loading && sortedFavorites.length === 0 ? (
            <LoadingSkeleton />
          ) : (
            <TransitionGroup>
              {sortedFavorites.map((root) => (
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
        </Box>
      </NavLink>
    </Box>
  );
};
