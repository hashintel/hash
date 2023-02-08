import { faArrowUpAZ, faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  TextField,
} from "@hashintel/design-system";
import {
  Box,
  Collapse,
  Fade,
  outlinedInputClasses,
  Tooltip,
} from "@mui/material";
import { orderBy } from "lodash";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import {
  FunctionComponent,
  Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TransitionGroup } from "react-transition-group";

import { useEntityTypesOptional } from "../../entity-types-context/hooks";
import { EntityTypeItem } from "./account-entity-type-list/entity-type-item";
import {
  SortActionsDropdown,
  SortType,
} from "./account-entity-type-list/sort-actions-dropdown";
import { NavLink } from "./nav-link";

type SearchInputProps = {
  searchVisible: boolean;
  searchInputRef: Ref<HTMLInputElement>;
  showSearchInput: () => void;
  // eslint-disable-next-line react/no-unused-prop-types -- @todo remove prop or use it in the component body
  hideSearchInput: () => void;
  onChangeText: (text: string) => void;
};

const SearchInput: FunctionComponent<SearchInputProps> = ({
  searchVisible,
  searchInputRef,
  showSearchInput,
  // hideSearchInput,
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
        inputRef={searchInputRef}
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

          // Commented this out because "View All Types" is commented out
          // Ideally the textfield is meant to appear on top of "View All Types"
          // when the search icon is clicked, and should close when
          // close search icon is clicked.
          // Since "View All Types" isn't displayed at the moment, this
          // text field will always be visible and as a result there is no need
          // to show the close search icon.
          // @todo uncomment when "View All Types" has been implemented
          // endAdornment: (
          //   <Tooltip title="Clear Search">
          //     <IconButton onClick={hideSearchInput} size="small" unpadded>
          //       <FontAwesomeIcon icon={faXmark} />
          //     </IconButton>
          //   </Tooltip>
          // ),
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
  const [searchVisible, setSearchVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sortActionsPopupState = usePopupState({
    variant: "popover",
    popupId: "type-sort-actions-menu",
  });

  useEffect(() => {
    if (searchVisible) {
      searchInputRef.current?.focus();
    }
  }, [searchVisible]);

  const allEntityTypes = useEntityTypesOptional();

  const accountEntityTypes = useMemo(() => {
    if (allEntityTypes) {
      return allEntityTypes.filter(
        (root) => root.metadata.ownedById === ownedById,
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
              {/*
                Commented this out because the functionality is not present yet
                ("View All Pages" screen hasn't been designed/built)

                @todo uncomment when this has been done
              */}

              {/* <Link
                href="/"
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
                    fontWeight: 600,
                    color: palette.gray[80],
                  })}
                >
                  View All Types
                </Typography>
              </Link> */}

              <SearchInput
                searchVisible={searchVisible}
                searchInputRef={searchInputRef}
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
