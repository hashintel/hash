import { Box, Stack, Typography } from "@mui/material";
import { useState } from "react";

export const CopyableRequestId = ({ requestId }: { requestId: string }) => {
  const [label, setLabel] = useState("Event ID:");

  return (
    <Stack
      component="div"
      alignItems="center"
      direction="row"
      justifyContent="flex-end"
      mt={0.8}
    >
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 600,
          opacity: 0.5,
          mr: 0.5,
        }}
      >
        {label}
        {` `}
      </Typography>
      <Box
        component="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(requestId);
            setLabel("Copied!");
          } catch {
            setLabel("Not allowed to copy to clipboard");
          } finally {
            setTimeout(() => setLabel("Event ID:"), 3_000);
          }
        }}
        sx={({ palette, transitions }) => ({
          background: palette.gray[10],
          border: `1px solid ${palette.gray[30]}`,
          borderRadius: 1,
          cursor: "pointer",
          maxWidth: "100%",
          minHeight: 0,
          py: 0.2,
          px: 0.5,
          transition: transitions.create("background"),
          "&:hover": {
            background: palette.gray[20],
          },
        })}
      >
        <Typography
          component="span"
          sx={({ palette }) => ({
            color: palette.gray[90],
            fontFamily: "monospace",
            fontSize: 10,
            maxWidth: "100%",
            textAlign: "left",
            whiteSpace: "pre-wrap",
          })}
        >
          {requestId}
        </Typography>
      </Box>
    </Stack>
  );
};
