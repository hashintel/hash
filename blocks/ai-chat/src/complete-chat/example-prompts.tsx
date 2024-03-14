import { Button } from "@hashintel/design-system";
import { Box, buttonClasses, Typography } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

import { CodeIcon } from "../icons/code";
import { CommentsQuestionsCheckIcon } from "../icons/comments-questions-check";
import { PenFancyIcon } from "../icons/pen-fancy";

type ExamplePrompt = {
  icon: ReactNode;
  prompt: string;
};

export const examplePrompts: ExamplePrompt[] = [
  {
    icon: <CommentsQuestionsCheckIcon />,
    prompt: "Explain quantum computing in simple terms",
  },
  {
    icon: <PenFancyIcon />,
    prompt: "Write a haiku about the advent of artificial intelligence",
  },
  {
    icon: <CodeIcon />,
    prompt:
      "Provide the JavaScript code required to animate text sliding into a page",
  },
];

export const ExamplePrompts: FunctionComponent<{
  isMobile: boolean;
  submitPrompt: (prompt: string) => void;
}> = ({ submitPrompt, isMobile }) => {
  return (
    <>
      <Typography
        gutterBottom
        sx={{
          fontSize: 12,
          textTransform: "uppercase",
          fontWeight: 700,
          color: ({ palette }) => palette.gray[80],
        }}
      >
        Or try an example prompt
      </Typography>
      <Box display="flex" flexDirection="column" alignItems="flex-start">
        {examplePrompts.map(({ icon, prompt }) => (
          <Button
            key={prompt}
            variant="tertiary_quiet"
            startIcon={icon}
            sx={{
              fontSize: 14,
              minHeight: "unset",
              padding: 0,
              background: "transparent",
              color: ({ palette }) => palette.gray[50],
              fontWeight: 500,
              ":hover": {
                background: "transparent",
              },
              [`& .${buttonClasses.startIcon}`]: {
                marginLeft: 0,
              },
              textAlign: "left",
              alignItems: isMobile ? "flex-start" : "center",
              [`& .${buttonClasses.startIcon}`]: {
                marginTop: isMobile ? 0.5 : 0,
              },
            }}
            onClick={() => submitPrompt(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </Box>
    </>
  );
};
