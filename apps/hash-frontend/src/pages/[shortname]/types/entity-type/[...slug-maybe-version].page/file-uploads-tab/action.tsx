import { ArrowRotateLeftIcon } from "@hashintel/design-system";
import { EntityId, extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { Box } from "@mui/material";

import { useWorkspaceShortnameByAccountId } from "../../../../../../components/hooks/use-workspace-shortname-by-account-id";
import { FileUpload } from "../../../../../../shared/file-upload-context";
import { ArrowUpRightIcon } from "../../../../../../shared/icons/arrow-up-right-icon";
import { DashIcon } from "../../../../../../shared/icons/dash-icon";
import { Link } from "../../../../../../shared/ui/link";

export const Action = ({
  onRetry,
  upload,
}: {
  onRetry: () => void;
  upload: FileUpload;
}) => {
  const { shortname } = useWorkspaceShortnameByAccountId({
    accountId: upload.ownedById,
  });

  switch (upload.status) {
    case "complete":
      return (
        <Link
          href={`/@${shortname}/entities/${extractEntityUuidFromEntityId(
            upload.createdEntities.fileEntity.metadata.recordId
              .entityId as EntityId,
          )}`}
          p={1}
        >
          <ArrowUpRightIcon sx={{ color: "blue.70", fontSize: 14 }} />
        </Link>
      );
    case "error":
      return (
        <Box
          component="button"
          onClick={onRetry}
          sx={{ background: "none", border: "none", cursor: "pointer", p: 1 }}
        >
          <ArrowRotateLeftIcon sx={{ color: "blue.70", fontSize: 14 }} />
        </Box>
      );
    default:
      return (
        <DashIcon
          sx={{ fontSize: 14, fill: ({ palette }) => `${palette.gray[50]}` }}
        />
      );
  }
};
