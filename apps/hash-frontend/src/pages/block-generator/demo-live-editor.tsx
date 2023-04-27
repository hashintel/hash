import { LoadingSpinner } from "@hashintel/design-system";
import { Box, Button } from "@mui/material";
import React from "react";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs/components/prism-core";
import "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/themes/prism.css";

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
  code,
  iframeKey,
  onChange,
  loading,
  refreshIframe,
}: Props) => {
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          overflow: "hidden",
          border: ({ palette }) => `1px solid ${palette.gray[20]}`,
          gap: 3,
        }}
      >
        <Box sx={{ flex: 1, overflowY: "scroll" }}>
          <Editor
            value={code}
            onValueChange={onChange}
            highlight={(code) => highlight(code, languages.js)}
            padding={10}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 12,
            }}
          />
        </Box>
        <Box
          sx={{
            flex: 1,
            overflow: "scroll",
            position: "relative",
          }}
        >
          {loading ? (
            <Box sx={{ position: "absolute", top: 8, left: 8 }}>
              <LoadingSpinner />
            </Box>
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
    </Box>
  );
};
