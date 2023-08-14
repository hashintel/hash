import {
  faCheck,
  faFile,
  faPencilRuler,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import {
  Box,
  FormControlLabel,
  Switch,
  SxProps,
  Theme,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { ReactNode } from "react";

import { useSidebarContext } from "../../shared/layout/layout-with-sidebar";
import { Breadcrumbs, BreadcrumbsProps } from "./breadcrumbs";

const pageRestoredMessage = (
  <Box
    sx={({ palette }) => ({
      "@keyframes fadeInOut": {
        "0%": {
          opacity: 0,
          background: palette.green[80],
          borderColor: palette.green[80],
          color: palette.common.white,
        },
        "5%": {
          opacity: 1,
          background: palette.green[80],
          borderColor: palette.green[80],
          color: palette.common.white,
        },
        "10%": {
          background: palette.green[10],
          borderColor: palette.green[50],
          color: palette.common.black,
        },
        "80%": { opacity: 1 },
        "100%": { opacity: 0 },
      },
      background: palette.green[10],
      borderColor: palette.green[50],
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
            color: palette.green[70],
          },
          "80%": {},
          "100%": { color: palette.green[70] },
        },
        animationName: "svgFadeInOut",
        animationTimingFunction: "linear",
        animationDuration: "5s",
        animationFillMode: "forwards",
      })}
    />
    <Typography variant="smallTextParagraphs" sx={{ fontWeight: 500 }}>
      Page restored
    </Typography>
  </Box>
);

type TopContextBarProps = {
  crumbs: BreadcrumbsProps["crumbs"];
  defaultCrumbIcon?: ReactNode;
  isBlockPage?: boolean;
  scrollToTop: () => void;
  displayPageRestoredMessage?: boolean;
  sx?: SxProps<Theme>;
};

export const TOP_CONTEXT_BAR_HEIGHT = 50;

export const TopContextBar = ({
  crumbs,
  defaultCrumbIcon = <FontAwesomeIcon icon={faFile} />,
  isBlockPage = false,
  scrollToTop = () => {},
  displayPageRestoredMessage = false,
  sx = [],
}: TopContextBarProps) => {
  const { sidebarOpen } = useSidebarContext();

  const { replace, query } = useRouter();

  const setPageMode = (type: "canvas" | "document", lockCanvas?: boolean) => {
    if (!isBlockPage) {
      return;
    }

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

  return (
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
        {displayPageRestoredMessage ? pageRestoredMessage : null}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center" }}>
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
  );
};
