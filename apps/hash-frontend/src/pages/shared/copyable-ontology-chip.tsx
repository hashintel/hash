import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  ArrowUpRightFromSquareRegularIcon,
  IconButton,
  OntologyChip,
  parseUrlForOntologyChip,
} from "@hashintel/design-system";
import { Box, ButtonBase, Tooltip } from "@mui/material";
import { type FunctionComponent, useCallback, useState } from "react";

import { Link } from "../../shared/ui/link";

export const CopyableOntologyChip: FunctionComponent<{
  versionedUrl: VersionedUrl;
  hideOpenInNew?: boolean;
}> = ({ versionedUrl, hideOpenInNew }) => {
  const [tooltipTitle, setTooltipTitle] = useState("Copy type URL");

  const [copyTooltipIsOpen, setCopyTooltipIsOpen] = useState(false);

  const ontology = parseUrlForOntologyChip(versionedUrl);

  const handleCopyTypeUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(versionedUrl);
      setTooltipTitle("Copied type URL!");
    } catch {
      setTooltipTitle("Not allowed to copy to clipboard");
    } finally {
      setTimeout(() => {
        setCopyTooltipIsOpen(false);

        setTimeout(() => {
          setTooltipTitle("Copy type URL");
        }, 300);
      }, 500);
    }
  }, [versionedUrl]);

  return (
    <Box
      display="flex"
      alignItems="center"
      columnGap={1}
      sx={({ palette }) => ({
        border: `1px solid ${palette.gray[30]}`,
        borderRadius: "13px",
      })}
    >
      <Tooltip
        open={copyTooltipIsOpen}
        title={tooltipTitle}
        placement="top"
        slotProps={{
          tooltip: {
            sx: {
              maxWidth: "unset",
              textWrap: "no-wrap",
            },
          },
        }}
      >
        <ButtonBase
          onClick={handleCopyTypeUrl}
          onMouseEnter={() => setCopyTooltipIsOpen(true)}
          onMouseLeave={() => setCopyTooltipIsOpen(false)}
        >
          <OntologyChip {...ontology} />
        </ButtonBase>
      </Tooltip>
      {!hideOpenInNew && (
        <Link href={versionedUrl} target="_blank">
          <IconButton
            sx={{
              padding: 0,
              transition: ({ transitions }) => transitions.create("color"),
              "&:hover": {
                background: "transparent",
                color: ({ palette }) => palette.blue[70],
              },
              svg: {
                fontSize: 14,
              },
            }}
          >
            <ArrowUpRightFromSquareRegularIcon />
          </IconButton>
        </Link>
      )}
    </Box>
  );
};
