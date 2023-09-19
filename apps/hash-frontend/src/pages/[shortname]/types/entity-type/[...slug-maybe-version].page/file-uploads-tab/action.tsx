import { ArrowRotateLeftIcon } from "@hashintel/design-system";
import { EntityId, extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { Box, Stack, SxProps, Theme, Tooltip } from "@mui/material";

import { useWorkspaceShortnameByOwnedById } from "../../../../../../components/hooks/use-workspace-shortname-by-owned-by-id";
import { FileUpload } from "../../../../../../shared/file-upload-context";
import { ArrowUpRightIcon } from "../../../../../../shared/icons/arrow-up-right-icon";
import { DashIcon } from "../../../../../../shared/icons/dash-icon";
import { Link } from "../../../../../../shared/ui/link";

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
  const { shortname } = useWorkspaceShortnameByOwnedById({
    ownedById: upload.ownedById,
  });

  switch (upload.status) {
    case "complete":
      return (
        <Tooltip title="View entity">
          <Link
            href={`/@${shortname}/entities/${extractEntityUuidFromEntityId(
              upload.createdEntities.fileEntity.metadata.recordId
                .entityId as EntityId,
            )}`}
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
