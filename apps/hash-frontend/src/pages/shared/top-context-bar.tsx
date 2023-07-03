import { faFile, faPencilRuler } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import {
  Box,
  FormControlLabel,
  Switch,
  SxProps,
  Theme,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { useRouter } from "next/router";
import { ReactNode } from "react";

import { useSidebarContext } from "../../shared/layout/layout-with-sidebar";
import { Breadcrumbs, BreadcrumbsProps } from "./breadcrumbs";

type Props = {
  crumbs: BreadcrumbsProps["crumbs"];
  defaultCrumbIcon?: ReactNode;
  isBlockPage?: boolean;
  scrollToTop: () => void;
  sx?: SxProps<Theme>;
};

export const TOP_CONTEXT_BAR_HEIGHT = 50;

export const TopContextBar = ({
  crumbs,
  defaultCrumbIcon = <FontAwesomeIcon icon={faFile} />,
  isBlockPage = false,
  scrollToTop = () => {},
  sx = [],
}: Props) => {
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
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: TOP_CONTEXT_BAR_HEIGHT,
          pl: sidebarOpen ? 3 : 8,
          pr: 4,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box>
        <Breadcrumbs
          crumbs={crumbs}
          defaultIcon={defaultCrumbIcon}
          scrollToTop={scrollToTop}
        />
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
