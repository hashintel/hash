import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  SpreadsheetFileIconRegular,
  SpreadsheetFileIconSolid,
} from "@hashintel/design-system";
import { googleEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Box, Stack, Typography } from "@mui/material";

import { Link } from "../../../../../shared/ui/link";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

export type DeliverableData = {
  displayName?: string;
  entityTypeId: VersionedUrl;
  fileName?: string;
  fileUrl: string;
  type: "file";
};

const Deliverable = ({ deliverable }: { deliverable: DeliverableData }) => {
  const { displayName, entityTypeId, fileName, fileUrl } = deliverable;

  const appName =
    entityTypeId === googleEntityTypes.googleSheetsFile.entityTypeId
      ? "Google Sheets"
      : "Unknown";

  return (
    <Stack
      direction="row"
      gap={1.5}
      sx={{ alignItems: "flex-start", textAlign: "left" }}
    >
      <SpreadsheetFileIconSolid
        sx={{ fill: ({ palette }) => palette.gray[30], fontSize: 36, mt: 0.5 }}
      />
      <Box>
        <Typography
          component="div"
          variant="smallTextParagraphs"
          sx={{ fontWeight: 600, lineHeight: 1.3, mb: 1 }}
        >
          {displayName ?? fileName ?? "Untitled"}
        </Typography>
        <Stack alignItems="center" direction="row" gap={1}>
          <Typography
            sx={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 600,
              color: ({ palette }) => palette.gray[60],
              textTransform: "uppercase",
            }}
          >
            Open in
          </Typography>
          <Link
            href={fileUrl}
            sx={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 600,
              "&:hover": {
                opacity: 0.8,
              },
              transition: ({ transitions }) => transitions.create("opacity"),
            }}
          >
            <SpreadsheetFileIconRegular
              sx={{
                fill: ({ palette }) => palette.blue[70],
                fontSize: 14,
                lineHeight: 1,
                mr: 0.5,
              }}
            />
            {appName}
          </Link>
        </Stack>
      </Box>
    </Stack>
  );
};

export const Deliverables = ({
  deliverables,
}: {
  deliverables: DeliverableData[];
}) => {
  const hasDeliverables = deliverables.length > 0;
  return (
    <OutputContainer
      sx={{
        flex: 1,
        minWidth: 275,
      }}
    >
      {hasDeliverables ? (
        <Box sx={{ p: 3 }}>
          {deliverables.map((deliverable, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Box key={index} mb={2}>
              <Deliverable deliverable={deliverable} />
            </Box>
          ))}
        </Box>
      ) : (
        <EmptyOutputBox
          Icon={outputIcons.deliverables}
          label="The outputs of this flow marked as deliverables will appear here when ready"
        />
      )}
    </OutputContainer>
  );
};
