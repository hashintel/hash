import { CheckIcon } from "@hashintel/block-design-system";
import { CloseIcon } from "@hashintel/design-system";
import {
  Box,
  CircularProgress,
  Collapse,
  Stack,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import { useState } from "react";

import { PageEntityInference } from "../../../../../shared/storage";
import { useSessionStorage } from "../../../../shared/use-storage-sync";
import { InferenceRequest } from "./inference-request";

const InferenceRequestContainer = ({
  expanded,
  request,
  toggleExpanded,
}: {
  expanded: boolean;
  toggleExpanded: () => void;
  request: PageEntityInference;
}) => {
  return (
    <Box
      sx={{
        border: ({ palette }) => `1px solid ${palette.gray[40]}`,
        borderRadius: 1,
        mb: 0.4,
      }}
    >
      <Box
        component="button"
        onClick={toggleExpanded}
        sx={{
          alignItems: "center",
          background: ({ palette }) => palette.gray[5],
          border: "none",
          borderRadius: 1,
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          px: 1.5,
          py: 0.5,
          width: "100%",
        }}
      >
        <Stack direction="row" sx={{ maxWidth: "90%" }}>
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[90],
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
            }}
          >
            {request.sourceTitle}
          </Typography>
          <Typography
            component="span"
            sx={{
              color: ({ palette }) => palette.gray[60],
              ml: 0.6,
              whiteSpace: "nowrap",
            }}
          >
            at {format(new Date(request.createdAt), "HH:mm")}
          </Typography>
        </Stack>
        {request.status === "pending" ? (
          <CircularProgress variant="indeterminate" size={13} sx={{ mr: 1 }} />
        ) : request.status === "complete" ? (
          <CheckIcon
            sx={{ height: 16, fill: ({ palette }) => palette.green[80] }}
          />
        ) : (
          <CloseIcon
            sx={{
              fill: ({ palette }) => palette.pink[80],
              fontSize: 12,
              mr: 1,
            }}
          />
        )}
      </Box>
      <Box>
        <Collapse in={expanded}>
          <Box
            sx={({ palette }) => ({
              background: palette.common.white,
              borderTop: `1px solid ${palette.gray[40]}`,
            })}
          >
            <InferenceRequest request={request} />
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
};

export const InferenceRequests = () => {
  const [expandedStatusUuid, setExpandedStatusUuid] = useState<string | null>(
    null,
  );
  const [inferenceStatus] = useSessionStorage("inferenceRequests", []);

  const toggleExpanded = (statusUuid: string) => {
    setExpandedStatusUuid((currentExpanded) =>
      statusUuid === currentExpanded ? null : statusUuid,
    );
  };

  return (
    <Box mt={2}>
      {inferenceStatus.map((request) => {
        const requestId = request.localRequestUuid;

        return (
          <InferenceRequestContainer
            key={requestId}
            expanded={expandedStatusUuid === requestId}
            toggleExpanded={() => toggleExpanded(requestId)}
            request={request}
          />
        );
      })}
    </Box>
  );
};
