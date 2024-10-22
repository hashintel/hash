import { faArrowsRotate, faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { Box, Collapse, Tooltip, Typography } from "@mui/material";
import type { ElementType } from "react";
import { useState } from "react";

import { FontAwesomeIcon } from "./fontawesome-icon";
import { IconButton } from "./icon-button";
import { CloseIcon } from "./icon-close";
import { WhiteCard } from "./white-card";
import { AsteriskRegularIcon } from "./icon-asterisk-regular";

interface TypeCardProps {
  disableClick?: boolean;
  onDelete?: () => void;
  LinkComponent?: ElementType;
  icon?: string | null;
  url: string;
  title: string;
  version: number;
  newVersionConfig?: {
    onUpdateVersion: () => void;
    newVersion: number;
  };
}

const TypeIcon = ({ icon }: { icon?: string | null }) => {
  if (!icon) {
    return <AsteriskRegularIcon sx={{ fontSize: 16 }} />;
  }
  if (
    icon.startsWith("http://") ||
    icon.startsWith("https://") ||
    icon.startsWith("/")
  ) {
    return <img alt="" src={icon} style={{ width: 16, height: 16 }} />;
  }

  return icon;
};

export const TypeCard = ({
  disableClick,
  onDelete,
  LinkComponent,
  icon,
  url,
  title,
  version,
  newVersionConfig,
}: TypeCardProps) => {
  const { newVersion, onUpdateVersion } = newVersionConfig ?? {};

  const [hovered, setHovered] = useState(false);

  return (
    <WhiteCard
      href={disableClick ? undefined : url}
      LinkComponent={LinkComponent}
      onMouseEnter={() => (onDelete ? setHovered(true) : null)}
      onMouseLeave={() => (onDelete ? setHovered(false) : null)}
    >
      <Box
        sx={{
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          px: 1.5,
          py: 1.25,
          color: ({ palette }) => palette.black,
          backgroundColor: newVersionConfig ? "yellow.10" : "white",
          "&:hover": {
            backgroundColor: "blue.5",
          },
        }}
      >
        <TypeIcon icon={icon} />
        <Typography variant="smallTextLabels" fontWeight={600} ml={1.5}>
          {title}
          <Typography variant="microText" color="gray.50" ml={0.5}>
            {` v${version}`}
          </Typography>
        </Typography>

        {newVersionConfig && (
          <Tooltip
            title={
              <>
                Update to <b>v{newVersion}</b> available
              </>
            }
            disableInteractive
            placement="top"
          >
            <IconButton
              unpadded
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onUpdateVersion?.();
              }}
              sx={{
                color: "yellow.80",
                "&:hover": {
                  color: "blue.70",
                  backgroundColor: "blue.20",
                },
                ml: 1,
              }}
            >
              <FontAwesomeIcon icon={faArrowsRotate} />
            </IconButton>
          </Tooltip>
        )}
        {onDelete && (
          <Collapse in={hovered} orientation="horizontal">
            <IconButton
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete();
              }}
              sx={{ "&:hover": { background: "none" }, ml: 1, padding: 0 }}
            >
              <CloseIcon
                sx={({ palette }) => ({
                  width: 11,
                  height: 11,
                  "&:hover": {
                    fill: palette.error.main,
                  },
                })}
              />
            </IconButton>
          </Collapse>
        )}
      </Box>
    </WhiteCard>
  );
};
