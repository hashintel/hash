import {
  faArrowUpAZ,
  faSearch,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  TextField,
} from "@hashintel/design-system";
import { isOwnedOntologyElementMetadata } from "@local/hash-subgraph";
import {
  Box,
  Collapse,
  Fade,
  outlinedInputClasses,
  Tooltip,
  Typography,
} from "@mui/material";
import { orderBy } from "lodash";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { FunctionComponent, useMemo, useState } from "react";
import { TransitionGroup } from "react-transition-group";

import { useLatestEntityTypesOptional } from "../../entity-types-context/hooks";
import { ArrowRightIcon } from "../../icons/arrow-right";
import { Link } from "../../ui";
import { EntityTypeItem } from "./account-entity-type-list/entity-type-item";
import {
  SortActionsDropdown,
  SortType,
} from "./account-entity-type-list/sort-actions-dropdown";
import { NavLink } from "./nav-link";

type SearchInputProps = {
  searchVisible: boolean;
  showSearchInput: () => void;
  hideSearchInput: () => void;
  onChangeText: (text: string) => void;
};

const SearchInput: FunctionComponent<SearchInputProps> = ({
  searchVisible,
  showSearchInput,
  hideSearchInput,
  onChangeText,
}) => (
  <>
    <Tooltip title="Search for types">
      <IconButton
        size="medium"
        sx={({ palette }) => ({ color: palette.gray[50] })}
        onClick={() => showSearchInput()}
      >
        {/* @todo-mui get a free icon that matches the design closely */}
        <FontAwesomeIcon icon={faSearch} />
      </IconButton>
    </Tooltip>
    <Fade in={searchVisible}>
      <TextField
        variant="outlined"
        size="small"
        placeholder="Search for types"
        onChange={(evt) => onChangeText(evt.target.value)}
        sx={({ palette }) => ({
          position: "absolute",
          right: 0,
          width: "204px",
          height: "100%",
          borderRadius: "4px",
          backgroundColor: palette.white,
          [`.${outlinedInputClasses.notchedOutline}`]: {
            borderRadius: "4px",
          },
          [`.${outlinedInputClasses.focused} .${outlinedInputClasses.notchedOutline}`]:
            {
              borderColor: palette.blue[60],
            },
        })}
        InputProps={{
          sx: ({ typography, palette }) => ({
            ...typography.smallTextLabels,
            color: palette.gray[80],
            fontWeight: 500,
            pl: 1.5,
            pr: 1,
            boxShadow: "none",
            [`& .${outlinedInputClasses.input}`]: {
              px: 0,
              py: 0.875,
              "&::placeholder": {
                color: palette.gray[50],
                opacity: 1,
              },
            },
          }),

          endAdornment: (
            <Tooltip title="Clear Search">
              <IconButton onClick={hideSearchInput} size="small" unpadded>
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </Tooltip>
          ),
        }}
      />
    </Fade>
  </>
);

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
        endAdornmentProps={{
          tooltipTitle: "Create new entity type",
          href: `/new/types/entity-type`,
          "data-testid": "create-entity-type-btn",
        }}
      >
        <Box component="ul">
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
              pl={3.5}
              position="relative"
            >
              <Link
                href="/types"
                noLinkStyle
                tabIndex={-1}
                sx={{
                  mr: "auto",
                  flex: 1,
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
                hideSearchInput={() => setSearchVisible(false)}
                onChangeText={(query) => setSearchQuery(query)}
              />
            </Box>
            <Tooltip title="Sort types">
              <IconButton
                {...bindTrigger(sortActionsPopupState)}
                sx={({ palette }) => ({
                  color: palette.gray[50],
                  ...(sortActionsPopupState.isOpen && {
                    backgroundColor: palette.gray[30],
                    color: palette.gray[80],
                  }),
                })}
              >
                {/* @todo-mui get a free icon that matches the design closely */}
                <FontAwesomeIcon icon={faArrowUpAZ} />
              </IconButton>
            </Tooltip>
            <SortActionsDropdown
              popupState={sortActionsPopupState}
              setSortType={setSortType}
              activeSortType={sortType}
            />
          </Box>
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
        </Box>
      </NavLink>
    </Box>
  );
};
