import { Box } from "@mui/material";
import React from "react";
import { LiveProvider, LiveEditor, LiveError, LivePreview } from "react-live";

type Props = {
  noInline?: boolean;
  scope?: any;
  code: string;
};

export const DemoLiveEditor = ({ noInline = false, code, scope }: Props) => {
  return (
    <LiveProvider code={code} noInline={noInline} scope={scope}>
      <Box
        sx={{
          display: "flex",
          overflow: "hidden",
          borderRadius: 5,
          border: ({ palette }) => `1px solid ${palette.gray[20]}`,
          gap: 3,
        }}
      >
        <Box sx={{ flex: 1, overflowY: "scroll" }}>
          <LiveEditor className="font-mono" />
        </Box>
        <Box sx={{ flex: 1, overflow: "scroll" }}>
          <LivePreview />
        </Box>
      </Box>
      <LiveError className="text-red-800 bg-red-100 mt-2" />
    </LiveProvider>
  );
};
