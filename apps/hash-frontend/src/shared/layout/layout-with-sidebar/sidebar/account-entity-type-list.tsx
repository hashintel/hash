import { isOwnedOntologyElementMetadata } from "@blockprotocol/type-system";
import { IconButton } from "@hashintel/design-system";
import { Box, Collapse, Fade, Tooltip, Typography } from "@mui/material";
import { orderBy } from "lodash";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";
import { TransitionGroup } from "react-transition-group";

import { useUpdateAuthenticatedUser } from "../../../../components/hooks/use-update-authenticated-user";
import { useLatestEntityTypesOptional } from "../../../entity-types-context/hooks";
import { ArrowDownAZRegularIcon } from "../../../icons/arrow-down-a-z-regular-icon";
import { ArrowUpZARegularIcon } from "../../../icons/arrow-up-a-z-regular-icon";
import { PlusRegularIcon } from "../../../icons/plus-regular";
import { Link } from "../../../ui";
import { useUserPreferences } from "../../../use-user-preferences";
import { LoadingSkeleton } from "../shared/loading-skeleton";
import { SearchInput } from "./account-entity-type-list/search-input";
import { EntityOrTypeSidebarItem } from "./shared/entity-or-type-sidebar-item";
import { NavLink } from "./shared/nav-link";
import type { SortType } from "./shared/sort-actions-dropdown";
import { SortActionsDropdown } from "./shared/sort-actions-dropdown";
import { ViewAllLink } from "./shared/view-all-link";

type AccountEntityTypeListProps = {
  webId: string;
};

export const AccountEntityTypeList: FunctionComponent<
  AccountEntityTypeListProps
> = ({ webId }) => {
  const preferences = useUserPreferences();

  const [expanded, setExpanded] = useState<boolean>(
    preferences.sidebarSections.entityTypes.expanded,
  );

  const [updateUser] = useUpdateAuthenticatedUser();

  const toggleTypesExpanded = () => {
    setExpanded(!expanded);

    void updateUser({
      preferences: {
        ...preferences,
        sidebarSections: {
          ...preferences.sidebarSections,
          entityTypes: {
            ...preferences.sidebarSections.entityTypes,
            expanded: !expanded,
          },
        },
      },
    });
  };

  const [sortType, setSortType] = useState<SortType>("asc");
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const sortActionsPopupState = usePopupState({
    variant: "popover",
    popupId: "type-sort-actions-menu",
  });

  const { latestEntityTypes, loading } = useLatestEntityTypesOptional();

  const accountEntityTypes = useMemo(() => {
    if (latestEntityTypes) {
      return latestEntityTypes.filter(
        (root) =>
          isOwnedOntologyElementMetadata(root.metadata) &&
          root.metadata.webId === webId,
      );
    }

    return null;
  }, [latestEntityTypes, webId]);

  // todo: handle search server side
  const filteredEntityTypes = useMemo(() => {
    // let allEntityTypes = data?.deprecatedGetAccountEntityTypes ?? [];
    let entityTypes = accountEntityTypes;

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      entityTypes =
        entityTypes?.filter((root) => {
          return root.schema.title.toLowerCase().includes(lowerQuery);
        }) ?? null;
    }

    // Right now we just handle ascending/descending and default to ascending
    // for other sort types
    return orderBy(entityTypes, (root) => root.schema.title.toLowerCase(), [
      sortType === "asc" || sortType === "desc" ? sortType : "asc",
    ]);
  }, [accountEntityTypes, searchQuery, sortType]);

  return (
    <Box>
      <NavLink
        expanded={expanded}
        toggleExpanded={toggleTypesExpanded}
        title="Types"
        endAdornment={
          <Box display="flex" gap={1}>
            <Fade in={expanded}>
              <Tooltip title="Sort types" placement="top">
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
            <Link tabIndex={-1} href="/new/types/entity-type" noLinkStyle>
              <Tooltip title="Create new entity type" sx={{ left: 5 }}>
                <IconButton
                  data-testid="create-entity-type-btn"
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
          {loading && filteredEntityTypes.length === 0 ? (
            <LoadingSkeleton />
          ) : filteredEntityTypes.length > 0 ? (
            <TransitionGroup>
              {filteredEntityTypes.map((root) => (
                <Collapse key={root.schema.$id}>
                  <EntityOrTypeSidebarItem
                    entityType={root.schema}
                    variant="entity-type"
                  />
                </Collapse>
              ))}
            </TransitionGroup>
          ) : (
            <Typography
              component="li"
              sx={{
                pl: 2.5,
                color: ({ palette }) => palette.gray[50],
                fontSize: 13,
              }}
            >
              No types in this workspace
            </Typography>
          )}
          <Box
            tabIndex={0}
            component="li"
            sx={({ palette }) => ({
              display: "flex",
              alignItems: "center",
              mx: 0.5,
              minHeight: 36,
              borderRadius: "4px",
              // "&:hover": {
              //   backgroundColor: palette.gray[20],
              // },
              "&:focus-visible": {
                backgroundColor: "red",
              },
              ...(sortActionsPopupState.isOpen && {
                backgroundColor: palette.gray[20],
              }),
            })}
          >
            <Box
              display="flex"
              alignItems="center"
              flex={1}
              mr={0.25}
              pl={2}
              position="relative"
            >
              <ViewAllLink
                href="/types"
                sx={{
                  mr: "auto",
                  marginLeft: -1.5,
                  flex: 1,
                  opacity: searchVisible ? 0 : 1,
                  transition: ({ transitions }) =>
                    transitions.create("opacity"),
                }}
              >
                View all types
              </ViewAllLink>
              <SearchInput
                searchVisible={searchVisible}
                showSearchInput={() => setSearchVisible(true)}
                hideSearchInput={() => {
                  setSearchQuery("");
                  setSearchVisible(false);
                }}
                onChangeText={(query) => setSearchQuery(query)}
              />
            </Box>
          </Box>
        </Box>
      </NavLink>
    </Box>
  );
};
