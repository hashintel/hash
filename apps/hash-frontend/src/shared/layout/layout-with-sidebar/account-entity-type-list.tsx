import { IconButton } from "@hashintel/design-system";
import { isOwnedOntologyElementMetadata } from "@local/hash-subgraph";
import { Box, Collapse, Tooltip, Typography } from "@mui/material";
import { orderBy } from "lodash";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { FunctionComponent, useMemo, useState } from "react";
import { TransitionGroup } from "react-transition-group";

import { useLatestEntityTypesOptional } from "../../entity-types-context/hooks";
import { ArrowDownAZRegularIcon } from "../../icons/arrow-down-a-z-regular-icon";
import { ArrowRightIcon } from "../../icons/arrow-right";
import { ArrowUpZARegularIcon } from "../../icons/arrow-up-a-z-regular-icon";
import { PlusRegularIcon } from "../../icons/plus-regular";
import { Link } from "../../ui";
import { EntityTypeItem } from "./account-entity-type-list/entity-type-item";
import { SearchInput } from "./account-entity-type-list/search-input";
import {
  SortActionsDropdown,
  SortType,
} from "./account-entity-type-list/sort-actions-dropdown";
import { NavLink } from "./nav-link";

type AccountEntityTypeListProps = {
  ownedById: string;
};

export const AccountEntityTypeList: FunctionComponent<
  AccountEntityTypeListProps
> = ({ ownedById }) => {
  const [sortType, setSortType] = useState<SortType>("asc");
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const sortActionsPopupState = usePopupState({
    variant: "popover",
    popupId: "type-sort-actions-menu",
  });

  const allEntityTypes = useLatestEntityTypesOptional();

  const accountEntityTypes = useMemo(() => {
    if (allEntityTypes) {
      return allEntityTypes.filter(
        (root) =>
          isOwnedOntologyElementMetadata(root.metadata) &&
          root.metadata.custom.ownedById === ownedById,
      );
    }

    return null;
  }, [allEntityTypes, ownedById]);

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
        title="Types"
        endAdornment={
          <Box display="flex" gap={1}>
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
            <SortActionsDropdown
              popupState={sortActionsPopupState}
              setSortType={setSortType}
              activeSortType={sortType}
            />
            <Link tabIndex={-1} href="/new/types/entity-type" noLinkStyle>
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
            </Link>
          </Box>
        }
      >
        <Box component="ul">
          <TransitionGroup>
            {filteredEntityTypes.map((root) => (
              <Collapse key={root.schema.$id}>
                <EntityTypeItem
                  title={root.schema.title}
                  entityTypeId={root.schema.$id}
                />
              </Collapse>
            ))}
          </TransitionGroup>
          <Box
            tabIndex={0}
            component="li"
            sx={({ palette }) => ({
              display: "flex",
              alignItems: "center",
              mx: 0.5,
              minHeight: 36,
              my: 0.25,
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
              <Link
                href="/types"
                noLinkStyle
                tabIndex={-1}
                sx={{
                  mr: "auto",
                  flex: 1,
                  opacity: searchVisible ? 0 : 1,
                  transition: ({ transitions }) =>
                    transitions.create("opacity"),
                }}
              >
                <Typography
                  variant="smallTextLabels"
                  sx={({ palette }) => ({
                    fontWeight: 500,
                    color: palette.gray[80],
                    fontSize: 14,
                    marginLeft: -1.5,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: "100px",
                    ":hover": {
                      color: palette.gray[90],
                      background: palette.gray[15],
                      "> svg": {
                        color: palette.gray[90],
                        marginLeft: 1.5,
                      },
                    },
                  })}
                >
                  View All Types
                  <ArrowRightIcon
                    sx={{
                      marginLeft: 0.75,
                      fontSize: 10,
                      color: ({ palette }) => palette.gray[80],
                      transition: ({ transitions }) =>
                        transitions.create(["color", "margin-left"]),
                    }}
                  />
                </Typography>
              </Link>
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
