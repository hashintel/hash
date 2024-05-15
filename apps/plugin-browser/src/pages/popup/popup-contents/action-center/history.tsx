import { Box, Link, Typography } from "@mui/material";

import { ManuallyTriggered } from "./history/manually-triggered";
import { AutomaticallyTriggered } from "./history/automatically-triggered";
import { PropsWithChildren } from "react";

const HistorySection = ({ children }: PropsWithChildren) => (
  <Box
    sx={{
      p: 2,
      "&:not(:last-of-type)": {
        borderTop: ({ palette }) => `1px solid ${palette.gray[30]}`,
      },
    }}
  >
    {children}
  </Box>
);

export const History = () => {
  return (
    <Box>
      <HistorySection>
        <ManuallyTriggered />
      </HistorySection>
      <HistorySection>
        <AutomaticallyTriggered />
      </HistorySection>
      <HistorySection>
        <Typography
          component="h4"
          variant="smallCaps"
          sx={{ fontSize: 12, mb: 1 }}
        >
          Other activity
        </Typography>
        <Typography
          component="p"
          variant="microText"
          sx={{ fontSize: 13, mb: 1 }}
        >
          The above tables show worker activity triggered from or using this
          browser.
        </Typography>
        <Typography component="p" variant="microText" sx={{ fontSize: 13 }}>
          To inspect non-browser events, visit your{" "}
          <Link
            href={`${FRONTEND_ORIGIN}/workers`}
            sx={{ textDecoration: "none", fontWeight: 600 }}
            target="_blank"
          >
            workers
          </Link>{" "}
          page.
        </Typography>
      </HistorySection>
    </Box>
  );
};
