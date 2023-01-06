import { faArrowsRotate, faAsterisk } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  LoadingSpinner,
} from "@hashintel/hash-design-system";
import { Box, Tooltip, Typography } from "@mui/material";

import { WhiteCard } from "../../../../shared/white-card";

interface TypeCardProps {
  url: string;
  title: string;
  version: number;
  newVersionConfig?: {
    updatingVersion: boolean;
    onUpdateVersion: () => Promise<void>;
    newVersion: number;
  };
}

export const TypeCard = ({
  url,
  title,
  version,
  newVersionConfig,
}: TypeCardProps) => {
  const { newVersion, onUpdateVersion, updatingVersion } =
    newVersionConfig ?? {};

  return (
    <WhiteCard href={url}>
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
                void onUpdateVersion?.();
              }}
              disabled={updatingVersion}
              sx={{ color: "yellow.80" }}
            >
              {updatingVersion ? (
                <LoadingSpinner />
              ) : (
                <FontAwesomeIcon icon={faArrowsRotate} />
              )}
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </WhiteCard>
  );
};
