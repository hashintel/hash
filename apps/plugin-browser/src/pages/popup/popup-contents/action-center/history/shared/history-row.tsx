import {
  ArrowUpRightFromSquareRegularIcon,
  CaretDownSolidIcon,
  IconButton,
  InfinityLightIcon,
  MemoCircleCheckRegularIcon,
  MicroscopeRegularIcon,
  PlugIconRegular,
} from "@hashintel/design-system";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import {
  Box,
  Collapse,
  Link,
  Stack,
  TableCell,
  TableRow,
  Tooltip,
} from "@mui/material";
import { useState } from "react";

import type { MinimalFlowRun } from "../../../../../../shared/storage";
import { CellWithHoverButton } from "./history-row/cell-with-hover-button";
import { Chip } from "./history-row/chip";
import { FlowMetadataCellContents } from "./history-row/flow-metadata-cell-contents";
import { FlowStatusCell } from "./history-row/flow-status-cell";
import { iconSx } from "./history-row/styles";

type RowType = "automatic" | "manual" | "external-page-request";

const UrlChip = ({ type, url }: { type: RowType; url: string }) => (
  <Tooltip title={url} placement="top">
    <Box>
      <Chip
        sx={{
          display: "block",
          fontFamily: "monospace",
          fontSize: 12,
          maxWidth: type === "manual" ? 210 : 125,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {url}
      </Chip>
    </Box>
  </Tooltip>
);

export const HistoryRow = ({
  flowRun,
  type,
}: {
  flowRun: MinimalFlowRun;
  type: RowType;
}) => {
  const [expanded, setExpanded] = useState(false);

  const openFlowButton = (
    <Link
      /** @todo get the correct shortname */
      href={`${FRONTEND_ORIGIN}${generateWorkerRunPath({ shortname: "hash", flowRunId: flowRun.flowRunId })}`}
      target="_blank"
    >
      <ArrowUpRightFromSquareRegularIcon />
    </Link>
  );

  return (
    <>
      <TableRow>
        {type === "external-page-request" ? (
          <TableCell>
            <Chip>
              <MemoCircleCheckRegularIcon sx={{ ...iconSx, mr: 1 }} />
              Load Page
            </Chip>
          </TableCell>
        ) : (
          <TableCell sx={{ pr: "3px !important" }}>
            <Stack direction="row" alignItems="center">
              <Chip>
                <MicroscopeRegularIcon
                  sx={{
                    ...iconSx,
                    mr: 0.6,
                  }}
                />
                Analyze
              </Chip>
              <IconButton
                onClick={() => setExpanded(!expanded)}
                sx={{
                  p: 0.4,
                  "& svg": { fontSize: 13 },
                  "@media (prefers-color-scheme: dark)": {
                    "&:hover": {
                      background: ({ palette }) => palette.gray[90],
                    },
                  },
                }}
              >
                <CaretDownSolidIcon
                  sx={{
                    ...iconSx,
                    transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: ({ transitions }) =>
                      transitions.create("transform"),
                  }}
                />
              </IconButton>
            </Stack>
          </TableCell>
        )}
        {type === "manual" ? (
          <CellWithHoverButton button={openFlowButton}>
            <UrlChip type={type} url={flowRun.webPage.url} />
          </CellWithHoverButton>
        ) : (
          <TableCell>
            <UrlChip type={type} url={flowRun.webPage.url} />
          </TableCell>
        )}
        {(type === "automatic" || type === "external-page-request") && (
          <CellWithHoverButton button={openFlowButton}>
            <Chip>
              {type === "automatic" ? (
                <>
                  <PlugIconRegular sx={{ ...iconSx, mr: 0.5 }} />
                  Plugin
                </>
              ) : (
                <>
                  <InfinityLightIcon sx={{ ...iconSx, mr: 0.5 }} />
                  Flow
                </>
              )}
            </Chip>
          </CellWithHoverButton>
        )}
        <FlowStatusCell flowRun={flowRun} />
      </TableRow>

      <TableRow
        sx={{
          background: ({ palette }) => palette.gray[20],
          borderTop: "none",
          opacity: expanded ? 1 : 0,
          transition: ({ transitions }) => transitions.create("opacity"),
          "@media (prefers-color-scheme: dark)": {
            background: ({ palette }) => palette.gray[90],
          },
        }}
      >
        <TableCell
          colSpan={type === "automatic" ? 4 : 3}
          sx={{ p: "0 !important" }}
        >
          <Collapse in={expanded} timeout={200}>
            <FlowMetadataCellContents flowRun={flowRun} visible={expanded} />
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};
