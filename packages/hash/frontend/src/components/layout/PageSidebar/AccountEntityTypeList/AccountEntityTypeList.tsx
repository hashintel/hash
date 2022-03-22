import { useState, useMemo, useRef, VFC, useEffect, Ref } from "react";
import {
  Typography,
  Box,
  Tooltip,
  TextField,
  outlinedInputClasses,
  Fade,
  Collapse,
} from "@mui/material";
import { TransitionGroup } from "react-transition-group";
import {
  faArrowUpAZ,
  faSearch,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { orderBy } from "lodash";
import { useRouter } from "next/router";
import { usePopupState, bindTrigger } from "material-ui-popup-state/hooks";
import { useAccountEntityTypes } from "../../../hooks/useAccountEntityTypes";
import { FontAwesomeIcon } from "../../../icons";
import { NavLink } from "../NavLink";
import { Link } from "../../../Link";
import { IconButton } from "../../../IconButton";
import { EntityTypeItem } from "./EntityTypeItem";
import { SortActionsDropdown, SortType } from "./SortActionsDropdown";

type SearchInputProps = {
  searchVisible: boolean;
  searchInputRef: Ref<HTMLInputElement>;
  showSearchInput: () => void;
  hideSearchInput: () => void;
  onChangeText: (text: string) => void;
};

const SearchInput: VFC<SearchInputProps> = ({
  searchVisible,
  searchInputRef,
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
        sx={{
          position: "absolute",
          right: 0,
          width: 200,
          backgroundColor: "white",
          [`.${outlinedInputClasses.focused} .${outlinedInputClasses.notchedOutline}`]:
            {
              borderColor: ({ palette }) => palette.blue[60],
            },
        }}
        InputProps={{
          sx: ({ typography, palette }) => ({
            ...typography.smallTextLabels,
            color: palette.gray[80],
            fontWeight: 500,
            pl: "12px",
            pr: "8px",
            [`& .${outlinedInputClasses.input}`]: {
              px: 0,
              py: "7px",
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
  accountId: string;
};

export const AccountEntityTypeList: VFC<AccountEntityTypeListProps> = ({
  accountId,
}) => {
  const { data } = useAccountEntityTypes(accountId);
  const router = useRouter();

  const [sortType, setSortType] = useState<SortType>("asc");
  const [searchVisible, setSearchVisible] = useState(false);
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

  // todo: handle search server side
  const filteredData = useMemo(() => {
    let entityTypes = data?.getAccountEntityTypes ?? [];

    if (searchQuery) {
      entityTypes = entityTypes.filter(({ properties }) =>
        properties.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    // Right now we just handle ascending/descending
    if (sortType === "asc" || sortType === "desc") {
      return orderBy(entityTypes, ["properties.title"], [sortType]);
    }

    return entityTypes;
  }, [sortType, data, searchQuery]);

  return (
    <Box>
      <NavLink
        title="Types"
        endAdornmentProps={{
          tooltipTitle: "Create new type",
          onClick: () => router.push(`/${accountId}/types/new`),
          "data-testid": "create-entity-btn",
        }}
      >
        <Box component="ul">
          <Box
            component="li"
            sx={({ palette }) => ({
              display: "flex",
              alignItems: "center",
              mx: 0.5,
              minHeight: 36,
              borderRadius: "4px",
              "&:hover": {
                backgroundColor: palette.gray[20],
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
              mr={1.25}
              pl={3.75}
              position="relative"
            >
              <Link
                href="/"
                noLinkStyle
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
              </Link>

              <SearchInput
                searchVisible={searchVisible}
                searchInputRef={searchInputRef}
                showSearchInput={() => setSearchVisible(true)}
                hideSearchInput={() => setSearchVisible(false)}
                onChangeText={(query: string) => setSearchQuery(query)}
              />
            </Box>
            <Tooltip title="Sort types">
              <IconButton
                {...bindTrigger(sortActionsPopupState)}
                sx={({ palette }) => ({
                  ...(sortActionsPopupState.isOpen && {
                    backgroundColor: palette.gray[30],
                    color: palette.gray[80],
                  }),
                })}
              >
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
            {filteredData.map((entityType) => {
              return (
                <Collapse key={entityType.entityId}>
                  <EntityTypeItem
                    title={entityType.properties.title}
                    entityId={entityType.entityId}
                    accountId={accountId}
                    selected={router.query.typeId === entityType.entityId}
                  />
                </Collapse>
              );
            })}
          </TransitionGroup>
        </Box>
      </NavLink>
    </Box>
  );
};
