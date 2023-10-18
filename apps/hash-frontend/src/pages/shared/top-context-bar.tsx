import {
  faCheck,
  faFile,
  faPencilRuler,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Entity, EntityTypeWithMetadata } from "@local/hash-subgraph";
import {
  Box,
  Collapse,
  FormControlLabel,
  Switch,
  SxProps,
  Theme,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import {
  FunctionComponent,
  ReactElement,
  ReactNode,
  useMemo,
  useState,
} from "react";

import { isItemArchived } from "../../shared/is-archived";
import { isEntityPageEntity } from "../../shared/is-of-type";
import { useSidebarContext } from "../../shared/layout/layout-with-sidebar";
import { Breadcrumbs, BreadcrumbsProps } from "./breadcrumbs";
import { ArchivedItemBanner } from "./top-context-bar/archived-item-banner";
import { ContextBarActionsDropdown } from "./top-context-bar/context-bar-actions-dropdown";
import { ShareDropdownMenu } from "./top-context-bar/share-dropdown-menu";
import { isItemEntityType } from "./top-context-bar/util";

export { isItemEntityType };
export { useContextBarActionsContext } from "./top-context-bar/context-bar-actions-context";

const PageRestoredMessageWrapper: FunctionComponent<{
  children: ReactNode;
}> = ({ children }) => (
  <Box
    sx={({ palette }) => ({
      "@keyframes fadeInOut": {
        "0%": {
          opacity: 0,
          background: palette.lime[80],
          borderColor: palette.lime[80],
          color: palette.common.white,
        },
        "5%": {
          opacity: 1,
          background: palette.lime[80],
          borderColor: palette.lime[80],
          color: palette.common.white,
        },
        "10%": {
          background: palette.lime[10],
          borderColor: palette.lime[50],
          color: palette.common.black,
        },
        "80%": { opacity: 1 },
        "100%": { opacity: 0 },
      },
      background: palette.lime[10],
      borderColor: palette.lime[50],
      display: "flex",
      alignItems: "center",
      gap: 1,
      borderWidth: 1,
      borderStyle: "solid",
      borderRadius: "4px",
      paddingY: 0.5,
      paddingX: 1.5,
      animationName: "fadeInOut",
      animationTimingFunction: "linear",
      animationDuration: "5s",
      animationFillMode: "forwards",
    })}
  >
    <FontAwesomeIcon
      icon={faCheck}
      sx={({ palette }) => ({
        fontSize: 14,
        "@keyframes svgFadeInOut": {
          "0%": {
            color: palette.common.white,
          },
          "5%": {
            color: palette.common.white,
          },
          "10%": {
            color: palette.lime[70],
          },
          "80%": {},
          "100%": { color: palette.lime[70] },
        },
        animationName: "svgFadeInOut",
        animationTimingFunction: "linear",
        animationDuration: "5s",
        animationFillMode: "forwards",
      })}
    />
    <Typography variant="smallTextParagraphs" sx={{ fontWeight: 500 }}>
      {children}
    </Typography>
  </Box>
);

export const TOP_CONTEXT_BAR_HEIGHT = 50;

type TopContextBarProps = {
  actionMenuItems?: ReactElement[];
  crumbs: BreadcrumbsProps["crumbs"];
  item?: Entity | EntityTypeWithMetadata;
  defaultCrumbIcon?: ReactNode;
  scrollToTop: () => void;
  sx?: SxProps<Theme>;
};

export const TopContextBar = ({
  actionMenuItems,
  crumbs,
  item,
  defaultCrumbIcon = <FontAwesomeIcon icon={faFile} />,
  scrollToTop = () => {},
  sx = [],
}: TopContextBarProps) => {
  const [displayRestoredMessage, setDisplayRestoredMessage] = useState(false);

  const { sidebarOpen } = useSidebarContext();

  const { replace, query } = useRouter();

  // @todo make 'additional buttons' a prop and move this to the page page
  const setPageMode = (type: "canvas" | "document", lockCanvas?: boolean) => {
    const newQuery: { canvas?: true; locked?: true } = {};
    if (type === "canvas") {
      newQuery.canvas = true;
      if (lockCanvas) {
        newQuery.locked = true;
      }
    }
    const { canvas: _, locked: __, ...otherParams } = query;
    void replace({ query: { ...otherParams, ...newQuery } }, undefined, {
      shallow: true,
    });
  };

  // @todo make 'additional banner' a prop and move this logic to the (1) page page and (2) entity type pages
  const archived = useMemo(() => {
    if (!item) {
      return false;
    }

    return isItemArchived(item);
  }, [item]);

  const isBlockPage = useMemo(
    () => item && !isItemEntityType(item) && isEntityPageEntity(item),
    [item],
  );

  return (
    <>
      <Box
        sx={[
          ({ palette }) => ({
            background: palette.common.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: TOP_CONTEXT_BAR_HEIGHT,
            pl: sidebarOpen ? 3 : 8,
            pr: 4,
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        <Box display="flex" gap={1}>
          <Breadcrumbs
            crumbs={crumbs}
            defaultIcon={defaultCrumbIcon}
            scrollToTop={scrollToTop}
          />
          {item && displayRestoredMessage ? (
            <PageRestoredMessageWrapper>{`${
              isItemEntityType(item)
                ? "Type"
                : isEntityPageEntity(item)
                ? "Page"
                : "Entity"
            } restored!`}</PageRestoredMessageWrapper>
          ) : null}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {item && !isItemEntityType(item) && (
            <ShareDropdownMenu entity={item} />
          )}

          {actionMenuItems?.length ? (
            <ContextBarActionsDropdown>
              {actionMenuItems}
            </ContextBarActionsDropdown>
          ) : null}
          {isBlockPage && query.canvas && (
            <FormControlLabel
              labelPlacement="start"
              slotProps={{
                typography: { fontSize: 14, fontWeight: 500, marginRight: 1 },
              }}
              sx={{
                mr: 2,
              }}
              control={
                <Switch
                  checked={!!query.locked}
                  onChange={() => setPageMode("canvas", !query.locked)}
                  inputProps={{ "aria-label": "controlled" }}
                  size="medium"
                />
              }
              label="Locked"
            />
          )}
          {isBlockPage && (
            <ToggleButtonGroup value={query.canvas ? "canvas" : "document"}>
              <ToggleButton
                value="document"
                aria-label="document"
                onClick={() => setPageMode("document")}
              >
                <FontAwesomeIcon
                  icon={faFile}
                  sx={(theme) => ({
                    color: theme.palette.gray[40],
                  })}
                />
              </ToggleButton>
              <ToggleButton
                value="canvas"
                aria-label="canvas"
                onClick={() => setPageMode("canvas", false)}
              >
                <FontAwesomeIcon
                  icon={faPencilRuler}
                  sx={(theme) => ({
                    color: theme.palette.gray[40],
                  })}
                />
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>
      </Box>
      {item && !(!isItemEntityType(item) && !isEntityPageEntity(item)) ? (
        <Collapse in={archived}>
          <ArchivedItemBanner
            item={item}
            onUnarchived={() => {
              setDisplayRestoredMessage(true);
              setTimeout(() => {
                setDisplayRestoredMessage(false);
              }, 5000);
            }}
          />
        </Collapse>
      ) : null}
    </>
  );
};
