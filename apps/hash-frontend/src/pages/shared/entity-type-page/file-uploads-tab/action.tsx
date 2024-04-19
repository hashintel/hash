import {
  ArrowRotateLeftIcon,
  ArrowUpRightIcon,
  DashIcon,
} from "@hashintel/design-system";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import type { SxProps, Theme } from "@mui/material";
import { Box, Stack, Tooltip } from "@mui/material";

import { useUserOrOrgShortnameByOwnedById } from "../../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import type { FileUpload } from "../../../../shared/file-upload-context";
import { Link } from "../../../../shared/ui/link";

const buttonSx: SxProps<Theme> = {
  color: "blue.70",
  fontSize: 14,
  "&:hover": {
    opacity: 0.7,
  },
  transition: ({ transitions }) => transitions.create("opacity"),
};

const actionHeight = 33;

export const Action = ({
  onRetry,
  upload,
}: {
  onRetry: () => void;
  upload: FileUpload;
}) => {
  const { shortname } = useUserOrOrgShortnameByOwnedById({
    ownedById: upload.ownedById,
  });

  switch (upload.status) {
    case "complete":
      return (
        <Tooltip title="View entity">
          <Link
            href={
              shortname
                ? generateEntityPath({
                    shortname,
                    entityId:
                      upload.createdEntities.fileEntity.metadata.recordId
                        .entityId,
                    includeDraftId: false,
                  })
                : "#"
            }
            sx={{
              display: "block",
              height: actionHeight,
              p: 1,
            }}
          >
            <ArrowUpRightIcon sx={buttonSx} />
          </Link>
        </Tooltip>
      );
    case "error":
      return (
        <Tooltip title="Retry upload">
          <Box
            component="button"
            onClick={onRetry}
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              p: 1,
              height: actionHeight,
            }}
          >
            <ArrowRotateLeftIcon sx={buttonSx} />
          </Box>
        </Tooltip>
      );
    default:
      return (
        <Stack
          alignItems="center"
          height={actionHeight}
          justifyContent="center"
        >
          <DashIcon
            sx={{ fontSize: 14, fill: ({ palette }) => palette.gray[50] }}
          />
        </Stack>
      );
  }
};
