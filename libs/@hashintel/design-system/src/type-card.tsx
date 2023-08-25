import { faArrowsRotate, faAsterisk } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Collapse,
  SvgIcon,
  SvgIconProps,
  Tooltip,
  Typography,
} from "@mui/material";
import { ElementType, FunctionComponent, useState } from "react";

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

const CloseIcon: FunctionComponent<SvgIconProps> = ({ sx, ...props }) => {
  return (
    <SvgIcon
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      {...props}
      sx={[
        ({ palette }) => ({ fill: palette.gray[50], fontSize: 12 }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <path d="M10.7812 2.28125L7.03125 6.03125L10.75 9.75C11.0625 10.0312 11.0625 10.5 10.75 10.7812C10.4688 11.0938 10 11.0938 9.71875 10.7812L5.96875 7.0625L2.25 10.7812C1.96875 11.0938 1.5 11.0938 1.21875 10.7812C0.90625 10.5 0.90625 10.0312 1.21875 9.71875L4.9375 6L1.21875 2.28125C0.90625 2 0.90625 1.53125 1.21875 1.21875C1.5 0.9375 1.96875 0.9375 2.28125 1.21875L6 4.96875L9.71875 1.25C10 0.9375 10.4688 0.9375 10.7812 1.25C11.0625 1.53125 11.0625 2 10.7812 2.28125Z" />
    </SvgIcon>
  );
};

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
        <FontAwesomeIcon icon={faAsterisk} />
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
