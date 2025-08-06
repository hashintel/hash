import type { OntologyTypeVersion } from "@blockprotocol/type-system";
import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Collapse,
  type SxProps,
  type Theme,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ElementType } from "react";
import { useState } from "react";

import { EntityOrTypeIcon } from "./entity-or-type-icon.js";
import { FontAwesomeIcon } from "./fontawesome-icon.js";
import { ArrowsRotateRegularIcon } from "./icon-arrows-rotate-regular.js";
import { IconButton } from "./icon-button.js";
import { CloseIcon } from "./icon-close.js";
import { WhiteCard } from "./white-card.js";

const deleteButtonSx: SxProps<Theme> = ({ palette }) => ({
  width: 11,
  height: 11,
  "&:hover": {
    fill: palette.error.main,
  },
});

interface TypeCardProps {
  disableClick?: boolean;
  icon?: string | null;
  isLink: boolean;
  onClick?: () => void;
  LinkComponent?: ElementType;
  newVersionConfig?: {
    newVersion: OntologyTypeVersion;
    onUpdateVersion: () => void;
  };
  onDelete?: () => void;
  swappableOnly?: boolean;
  title: string;
  url: string;
  version: OntologyTypeVersion;
}

export const TypeCard = ({
  disableClick,
  icon,
  isLink,
  LinkComponent,
  newVersionConfig,
  onClick,
  onDelete,
  swappableOnly,
  title,
  url,
  version,
}: TypeCardProps) => {
  const { newVersion, onUpdateVersion } = newVersionConfig ?? {};

  const [hovered, setHovered] = useState(false);

  return (
    <WhiteCard
      href={disableClick ? undefined : url}
      LinkComponent={LinkComponent}
      onClick={
        onClick
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onClick();
            }
          : undefined
      }
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
          whiteSpace: "nowrap",
        }}
      >
        <EntityOrTypeIcon
          entity={null}
          fontSize={14}
          fill={({ palette }) => palette.blue[70]}
          isLink={isLink}
          icon={icon}
        />
        <Typography variant="smallTextLabels" fontWeight={600} ml={1}>
          {title}
          <Typography variant="microText" color="gray.50" ml={0.5}>
            {` v${version.toString()}`}
          </Typography>
        </Typography>

        {newVersionConfig && newVersion !== undefined && (
          <Tooltip
            title={
              <>
                Update to <b>v{newVersion.toString()}</b> available
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
              sx={({ palette }) => ({
                color: palette.yellow[80],
                "&:hover": {
                  color: palette.blue[70],
                  backgroundColor: palette.blue[20],
                },
                ml: 1,
              })}
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
              {swappableOnly ? (
                <ArrowsRotateRegularIcon sx={deleteButtonSx} />
              ) : (
                <CloseIcon sx={deleteButtonSx} />
              )}
            </IconButton>
          </Collapse>
        )}
      </Box>
    </WhiteCard>
  );
};
