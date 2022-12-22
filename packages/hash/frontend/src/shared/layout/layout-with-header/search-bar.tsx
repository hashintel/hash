// import { useQuery } from "@apollo/client";
// import { PageSearchResult } from "../../../../../graphql/api-types.gen";
import { IconButton } from "@hashintel/hash-design-system";
import { Box, SxProps, Theme, useMediaQuery, useTheme } from "@mui/material";
import { escapeRegExp } from "lodash";
import {
  FunctionComponent,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useDebounce, useKey, useOutsideClickRef } from "rooks";

import { getBlockDomId } from "../../../blocks/page/block-view";
import { HASH_OPENSEARCH_ENABLED } from "../../../lib/public-env";
import { useAuthenticatedUser } from "../../../pages/shared/auth-info-context";
import { SearchIcon } from "../../icons";
import { Button, Link } from "../../ui";
import { SearchInput } from "./search-bar/search-input";

/** finds the query's words in the result and chops it into parts at the words' boundaries */
const splitByMatches = (result: string, query: string) => {
  const separator = query
    .split(/\s+/g)
    .sort((a, b) => b.length - a.length) // match longer words first
    .map(escapeRegExp)
    .join("|");

  /** @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/split#splitting_with_a_regexp_to_include_parts_of_the_separator_in_the_result */
  return result.split(new RegExp(`(${separator})`, "gi"));
};

const toBlockUrl = (searchPage: any): string => {
  const segments = [
    "/",
    searchPage.page.accountId,
    "/",
    searchPage.page.entityId,
  ];

  if (searchPage.block) {
    segments.push("#", getBlockDomId(searchPage.block.entityId));
  }

  return segments.join("");
};

const ResultList: FunctionComponent<{
  isMobile: boolean;
  children?: ReactNode;
}> = ({ isMobile, ...props }) => (
  <Box
    component="ul"
    sx={(theme) => ({
      position: !isMobile ? "absolute" : "unset",
      top: !isMobile ? "calc(100% + 1px)" : "unset",
      zIndex: 10,
      width: "100%",
      maxHeight: "15rem",
      overflow: "auto",
      border: `1px solid ${theme.palette.gray[20]}`,
      borderRadius: "0.5rem",
      boxShadow: theme.shadows[1],
    })}
  >
    {props.children}
  </Box>
);

const ResultItem: FunctionComponent<{
  sx?: SxProps<Theme>;
  children?: ReactNode;
}> = ({ sx = [], ...props }) => {
  const theme = useTheme();

  return (
    <Box
      component="li"
      sx={[
        {
          display: "flex",
          backgroundColor: theme.palette.gray[10],
          border: "none",
          padding: 1,
          cursor: "pointer",
          textOverflow: "ellipsis",
          overflow: "hidden",
          "&:hover": {
            backgroundColor: theme.palette.gray[20],
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    />
  );
};

/** extends react's useState by returning an additional value updated after a short delay (debounce) */
const useQueryText = (): [string, string, (queryText: string) => void] => {
  const [displayedQuery, setDisplayedQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const setSubmittedQuerySoon = useDebounce(setSubmittedQuery, 300);

  const setQuery = useCallback(
    (query: string) => {
      setDisplayedQuery(query);
      setSubmittedQuerySoon(query);
    },
    [setDisplayedQuery, setSubmittedQuerySoon],
  );

  return [displayedQuery, submittedQuery, setQuery];
};

const getSearchBarResponsiveStyles = (
  isMobile: boolean,
  displaySearchInput: boolean,
): SxProps<Theme> => {
  if (isMobile) {
    if (displaySearchInput) {
      return {
        position: "absolute",
        width: "100%",
        zIndex: 1,
        left: 0,
        top: "12px",
        px: 2,
      };
    } else {
      return {
        mr: 1,
      };
    }
  }

  return {};
};

const SearchBarWhenSearchIsEnabled: FunctionComponent = () => {
  const theme = useTheme();

  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [isResultListVisible, setResultListVisible] = useState(false);
  const [displayedQuery, submittedQuery, setQueryText] = useQueryText();

  const [displaySearchInput, setDisplaySearchInput] = useState<boolean>(false);

  useEffect(() => {
    if (displayedQuery.trim() && !displaySearchInput) {
      setDisplaySearchInput(true);
    }
  }, [displayedQuery, displaySearchInput]);

  const { authenticatedUser: _ } = useAuthenticatedUser();

  const data: any = [];
  const loading = false;
  /**
   * @todo: We currently do not support search, see https://app.asana.com/0/1201095311341924/1202681411010022/f
   */
  // const { data, loading } = useQuery<
  //   SearchPagesQuery,
  //   SearchPagesQueryVariables
  // >(searchPages, {
  //   variables: {
  //     accountId: authenticatedUser!.entityId,
  //     query: submittedQuery,
  //   },
  //   skip: !authenticatedUser?.entityId || !submittedQuery,
  //   fetchPolicy: "network-only",
  // });

  useKey(["Escape"], () => setResultListVisible(false));

  const [rootRef] = useOutsideClickRef(() => setResultListVisible(false));

  // present loading screen while waiting for the user to stop typing
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  const isLoading = loading || displayedQuery !== submittedQuery;

  return (
    <Box
      sx={{
        marginLeft: 0,
        [theme.breakpoints.up("md")]: {
          marginLeft: theme.spacing(3),
        },
        position: "relative",
        height: "100%",
        ...getSearchBarResponsiveStyles(isMobile, displaySearchInput),
      }}
      ref={rootRef}
    >
      {/* If the user is in mobile view and the search icon isn't clicked, display the icon */}
      {isMobile && !displaySearchInput ? (
        <IconButton size="medium" onClick={() => setDisplaySearchInput(true)}>
          <SearchIcon />
        </IconButton>
      ) : (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            background: "white",
            zIndex: 1,
          }}
        >
          <SearchInput
            displayedQuery={displayedQuery}
            isMobile={isMobile}
            setQueryText={setQueryText}
            setResultListVisible={setResultListVisible}
          />

          {isMobile && (
            <Button
              onClick={() => {
                setQueryText("");
                setDisplaySearchInput(false);
              }}
              variant="tertiary_quiet"
              size="xs"
              sx={{ ml: 1 }}
            >
              Cancel
            </Button>
          )}
        </Box>
      )}

      {isResultListVisible && displayedQuery && (
        <ResultList isMobile={isMobile}>
          {isLoading ? (
            <ResultItem sx={{ display: "block" }}>
              Loading results for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : !data?.searchPages.length ? (
            <ResultItem sx={{ display: "block" }}>
              No results found for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            data.searchPages.map((searchPage: any) => (
              <ResultItem
                key={searchPage.block?.entityId ?? searchPage.page.entityId}
              >
                <Link noLinkStyle href={toBlockUrl(searchPage)}>
                  <a>
                    {splitByMatches(searchPage.content, submittedQuery).map(
                      // eslint-disable-next-line react/no-array-index-key
                      (str, i) => (i % 2 === 1 ? <b key={i}>{str}</b> : str),
                    )}
                  </a>
                </Link>
              </ResultItem>
            ))
          )}
        </ResultList>
      )}
    </Box>
  );
};

const SearchBarWhenSearchIsDisabled: FunctionComponent = () => {
  return <div />;
};

// Note: This component becomes empty is opensearch is disabled
export const SearchBar =
  HASH_OPENSEARCH_ENABLED === "true"
    ? SearchBarWhenSearchIsEnabled
    : SearchBarWhenSearchIsDisabled;
