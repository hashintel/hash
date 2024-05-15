import { Collapse, Link, Stack, TableCell, TableRow } from "@mui/material";
import { useState } from "react";

import {
  ArrowUpRightFromSquareRegularIcon,
  CaretDownSolidIcon,
  IconButton,
  IconMicroscopeRegular,
} from "@hashintel/design-system";
import type { MinimalFlowRun } from "../../../../../../shared/storage";
import { Chip } from "./chip";
import { FlowMetadataCellContents } from "./browser-flow-row/flow-metadata-cell-contents";
import { CellWithHoverButton } from "./cell-with-hover-button";

export const BrowserFlowRow = ({
  flow,
  type,
}: {
  flow: MinimalFlowRun;
  type: "automatic" | "manual";
}) => {
  const [expanded, setExpanded] = useState(false);

  const { status } = flow;

  const openFlowButton = (
    <Link href={`${FRONTEND_ORIGIN}/workers/${flow.flowRunId}`}>
      <ArrowUpRightFromSquareRegularIcon />
    </Link>
  );

  return (
    <>
      <TableRow>
        <TableCell>
          <Stack direction="row" alignItems="center">
            <Chip>
              <IconMicroscopeRegular
                sx={{
                  fill: ({ palette }) => palette.gray[50],
                  fontSize: 12,
                  mr: 1,
                }}
              />
              Analyze
            </Chip>
            <IconButton
              onClick={() => setExpanded(!expanded)}
              sx={{ ml: 0.5, p: 0.5, "& svg": { fontSize: 13 } }}
            >
              <CaretDownSolidIcon
                sx={{
                  fill: ({ palette }) => palette.gray[50],
                  transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: ({ transitions }) =>
                    transitions.create("transform"),
                }}
              />
            </IconButton>
          </Stack>
        </TableCell>
        {type === "manual" ? (
          <CellWithHoverButton button={openFlowButton}>
            <Chip>{flow.webPage.url}</Chip>
          </CellWithHoverButton>
        ) : (
          <TableCell>
            <Chip sx={{ fontFamily: "monospace" }}>{flow.webPage.url}</Chip>
          </TableCell>
        )}
        {type === "automatic" && (
          <CellWithHoverButton button={openFlowButton}>
            <Chip>Plugin</Chip>
          </CellWithHoverButton>
        )}
        <TableCell>
          <Chip>{status}</Chip>
        </TableCell>
      </TableRow>

      <TableRow sx={{ background: ({ palette }) => palette.gray[20] }}>
        <TableCell
          colSpan={type === "automatic" ? 4 : 3}
          sx={{ p: "0 !important" }}
        >
          <Collapse in={expanded}>
            <FlowMetadataCellContents flow={flow} />
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};
