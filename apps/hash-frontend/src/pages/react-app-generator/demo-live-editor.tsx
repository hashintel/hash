import { LoadingSpinner } from "@hashintel/design-system";
import { Box, Button } from "@mui/material";
import React from "react";
import { LiveProvider, LiveEditor } from "react-live";

type Props = {
  noInline?: boolean;
  scope?: any;
  code: string;
  iframeKey: number;
  loading: boolean;
  onChange: (value: string) => void;
  refreshIframe: () => void;
};

export const DemoLiveEditor = ({
  noInline = false,
  code,
  iframeKey,
  onChange,
  loading,
  refreshIframe,
}: Props) => {
  return (
    <LiveProvider code={code} noInline={noInline}>
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
          <LiveEditor className="font-mono" onChange={onChange} />
        </Box>
        <Box sx={{ flex: 1, overflow: "scroll", position: "relative" }}>
          {loading ? (
            <LoadingSpinner />
          ) : (
            <iframe
              style={{ borderWidth: 0, width: "100%", height: "100%" }}
              key={iframeKey}
              src="http://localhost:3001"
            />
          )}

          <Button
            variant="tertiary"
            onClick={refreshIframe}
            sx={{ position: "absolute", top: 8, right: 8 }}
          >
            Refresh
          </Button>
        </Box>
      </Box>
    </LiveProvider>
  );
};
