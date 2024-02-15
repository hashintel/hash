import {
  CheckIcon,
  CloseIcon,
  DashIcon,
  FeatherRegularIcon,
  IconButton,
} from "@hashintel/design-system";
import {
  Box,
  CircularProgress,
  Collapse,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import { MouseEvent, useState } from "react";

import {
  LocalStorage,
  PageEntityInference,
} from "../../../../../shared/storage";
import { sendMessageToBackground } from "../../../../shared/messages";
import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModePlaceholderColor,
} from "../../../../shared/style-values";
import { InferenceRequest } from "./inference-request";

const InferenceRequestContainer = ({
  expanded,
  request,
  toggleExpanded,
  user,
}: {
  expanded: boolean;
  toggleExpanded: () => void;
  request: PageEntityInference;
  user: NonNullable<LocalStorage["user"]>;
}) => {
  const [cancellationRequested, setCancellationRequested] = useState(false);

  const isUnproductiveSuccessfulRequest =
    (request.status === "complete" || request.status === "user-cancelled") &&
    (!request.data.contents[0]?.results?.length ||
      request.data.contents[0].results.every(
        (result) => result.operation === "already-exists-as-proposed",
      ));

  const cancelRequest = (event: MouseEvent) => {
    event.stopPropagation();
    void sendMessageToBackground({
      requestUuid: request.requestUuid,
      type: "cancel-infer-entities",
    });
    setCancellationRequested(true);
  };

  console.log({ request });

  return (
    <Box
      sx={{
        border: ({ palette }) => `1px solid ${palette.gray[40]}`,
        borderRadius: 1,
        mb: 0.4,
        "@media (prefers-color-scheme: dark)": {
          borderColor: darkModeBorderColor,
        },
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
          "@media (prefers-color-scheme: dark)": {
            background: darkModeInputBackgroundColor,
          },
        }}
      >
        <Stack direction="row" sx={{ maxWidth: "88%" }}>
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[90],
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
              "@media (prefers-color-scheme: dark)": {
                color: darkModePlaceholderColor,
              },
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
          <Stack alignItems="center" direction="row">
            {cancellationRequested ? (
              <Tooltip title="Cancellation pending...">
                <CircularProgress
                  variant="indeterminate"
                  size={13}
                  sx={{ mr: 1, color: ({ palette }) => palette.red[70] }}
                />
              </Tooltip>
            ) : (
              <Tooltip title="Cancel request">
                <IconButton
                  onClick={cancelRequest}
                  sx={{ p: 0, "&:hover": { background: "none" }, mr: 0.2 }}
                >
                  <CloseIcon
                    sx={({ palette, transitions }) => ({
                      fill: palette.gray[30],
                      fontSize: 12,
                      mr: 1,
                      transition: transitions.create("fill"),
                      "&:hover": {
                        fill: palette.red[70],
                      },
                    })}
                  />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Job in progress...">
              <CircularProgress
                data-testid="job-in-progress"
                variant="indeterminate"
                size={13}
                sx={{ mr: 1 }}
              />
            </Tooltip>
          </Stack>
        ) : request.status === "complete" ||
          request.status === "user-cancelled" ? (
          <Stack alignItems="center" direction="row">
            {isUnproductiveSuccessfulRequest ? (
              <Tooltip title="No entities created or updated">
                <Box sx={{ height: 16 }}>
                  <DashIcon
                    sx={{ height: 16, fill: ({ palette }) => palette.gray[40] }}
                  />
                </Box>
              </Tooltip>
            ) : (
              <>
                {request.createAs === "draft" && (
                  <Tooltip title="Draft">
                    <Box sx={{ height: 16 }}>
                      <FeatherRegularIcon
                        aria-label="Draft"
                        sx={{
                          fontSize: 16,
                          color: ({ palette }) => palette.gray[40],
                          mr: 0.3,
                        }}
                      />
                    </Box>
                  </Tooltip>
                )}
                <Tooltip title="Entities successfully inferred">
                  <Box sx={{ height: 16 }}>
                    <CheckIcon
                      aria-label="Entities successfully inferred"
                      sx={{
                        height: 16,
                        fill: ({ palette }) => palette.green[80],
                      }}
                    />
                  </Box>
                </Tooltip>
              </>
            )}
          </Stack>
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
          <Box>
            <InferenceRequest request={request} user={user} />
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
};

export const InferenceRequests = ({
  inferenceRequests,
  user,
}: {
  inferenceRequests: LocalStorage["inferenceRequests"];
  user: NonNullable<LocalStorage["user"]>;
}) => {
  const [expandedStatusUuid, setExpandedStatusUuid] = useState<string | null>(
    null,
  );

  const toggleExpanded = (statusUuid: string) => {
    setExpandedStatusUuid((currentExpanded) =>
      statusUuid === currentExpanded ? null : statusUuid,
    );
  };

  if (inferenceRequests.length === 0) {
    return (
      <Typography
        sx={({ palette }) => ({
          fontSize: 14,
          color: palette.gray[90],
          "@media (prefers-color-scheme: dark)": {
            color: palette.gray[30],
          },
        })}
      >
        Nothing here yet – a record of entities created or updated will appear
        here as you use the plugin.
      </Typography>
    );
  }

  return (
    <Box mt={2}>
      {inferenceRequests.map((request) => {
        const requestId = request.requestUuid;

        return (
          <InferenceRequestContainer
            key={requestId}
            expanded={expandedStatusUuid === requestId}
            toggleExpanded={() => toggleExpanded(requestId)}
            request={request}
            user={user}
          />
        );
      })}
    </Box>
  );
};
