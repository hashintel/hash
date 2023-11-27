import { Box, Collapse, Tooltip, Typography } from "@mui/material";
import { FallbackRender } from "@sentry/react";
import { useState } from "react";

import { Button } from "../../shared/ui/button";
import { Link } from "../../shared/ui/link";

const CopyableMonospace = ({ text }: { text: string }) => {
  const [tooltipTitle, setTooltipTitle] = useState("Copy to clipboard");

  return (
    <Box>
      <Tooltip title={tooltipTitle}>
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setTooltipTitle("Copied!");
            } catch {
              setTooltipTitle("Not allowed to copy to clipboard");
            } finally {
              setTimeout(() => setTooltipTitle("Copy to clipboard"), 3_000);
            }
          }}
          variant="tertiary"
          sx={({ palette }) => ({
            background: palette.gray[20],
            border: `1px solid ${palette.gray[50]}`,
            maxWidth: "100%",
            minHeight: 0,
            py: 0.5,
            px: 1.5,
            "&:hover": {
              background: palette.gray[40],
            },
          })}
        >
          <Typography
            component="span"
            sx={({ palette }) => ({
              color: palette.gray[90],
              fontFamily: "monospace",
              fontSize: "0.8rem",
              maxWidth: "100%",
              textAlign: "left",
              whiteSpace: "pre-wrap",
            })}
          >
            {text}
          </Typography>
        </Button>
      </Tooltip>
    </Box>
  );
};

export const ErrorFallback: FallbackRender = ({
  error,
  eventId,
  resetError,
}) => {
  const [showMessage, setShowMessage] = useState(false);

  return (
    <Box
      sx={({ palette }) => ({
        background: palette.common.white,
        margin: "0 auto",
        padding: 6,
        border: `1px solid ${palette.gray[20]}`,
        borderRadius: 2,
      })}
    >
      <Typography variant="h3" mb={2}>
        Something went wrong...
      </Typography>
      <Typography mb={2}>
        We've been notified and will investigate — please click the button below
        to reset the page to its initial state.
      </Typography>
      <Box sx={{ textAlign: "center" }}>
        <Button onClick={resetError} size="small">
          Reset the page
        </Button>
      </Box>
      <Typography mt={2}>
        You can also <Link href="https://hash.ai/contact">contact us</Link>. If
        you do, please include the details below.
      </Typography>
      <Button
        onClick={() => setShowMessage(!showMessage)}
        variant="tertiary"
        size="xs"
        sx={{ mt: 2 }}
      >
        {showMessage ? "Hide details" : "Show details"}
      </Button>
      <Collapse in={showMessage}>
        <Box sx={{ mt: 2 }}>
          <Box>
            <Typography variant="smallCaps">Event ID</Typography>
            <CopyableMonospace text={eventId} />
          </Box>
          <Box mt={2}>
            <Typography variant="smallCaps">Error message</Typography>
            <CopyableMonospace text={error.message} />
          </Box>
          <Box mt={2}>
            <Typography variant="smallCaps">Stack trace</Typography>
            <CopyableMonospace text={error.stack ?? ""} />
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};
