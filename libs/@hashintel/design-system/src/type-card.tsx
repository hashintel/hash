import { faArrowsRotate, faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { CloseIcon } from "@hashintel/type-editor/src/entity-type-editor/shared/close-icon";
import { Box, Collapse, Tooltip, Typography } from "@mui/material";
import { ElementType, useState } from "react";

import { FontAwesomeIcon } from "./fontawesome-icon";
import { IconButton } from "./icon-button";
import { WhiteCard } from "./white-card";

interface TypeCardProps {
  onDelete?: () => void;
  LinkComponent?: ElementType;
  url: string;
  title: string;
  version: number;
  newVersionConfig?: {
    onUpdateVersion: () => void;
    newVersion: number;
  };
}

export const TypeCard = ({
  onDelete,
  LinkComponent,
  url,
  title,
  version,
  newVersionConfig,
}: TypeCardProps) => {
  const { newVersion, onUpdateVersion } = newVersionConfig ?? {};

  const [hovered, setHovered] = useState(false);

  return (
    <WhiteCard
      href={url}
      LinkComponent={LinkComponent}
      onMouseEnter={() => (onDelete ? setHovered(true) : null)}
      onMouseLeave={() => (onDelete ? setHovered(false) : null)}
    >
      <Box
        sx={{
          height: 40,
          display: "flex",
          alignItems: "center",
          px: 1.5,
          py: 1.25,
          gap: 1.25,
          color: ({ palette }) => palette.black,
          backgroundColor: newVersionConfig ? "yellow.10" : "white",
          "&:hover": {
            backgroundColor: "blue.5",
          },
        }}
      >
        <FontAwesomeIcon icon={faAsterisk} />
        <Typography variant="smallTextLabels" fontWeight={600}>
          {title}
          <Typography variant="microText" color="gray.50">
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
              }}
            >
              <FontAwesomeIcon icon={faArrowsRotate} />
            </IconButton>
          </Tooltip>
        )}
        {onDelete && (
          <Collapse in={hovered} orientation="horizontal">
            <IconButton
              onClick={onDelete}
              sx={{ "&:hover": { background: "none" }, padding: 0 }}
            >
              <CloseIcon
                onClick={onDelete}
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
