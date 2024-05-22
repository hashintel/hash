import { Skeleton } from "@hashintel/design-system";
import { Box, Link, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";

import { AutomaticallyTriggered } from "./history/automatically-triggered";
import { ManuallyTriggered } from "./history/manually-triggered";
import { useFlowRuns } from "./shared/use-flow-runs";

const HistorySection = ({ children }: PropsWithChildren) => (
  <Box
    sx={{
      p: 2,
      "&:not(:last-of-type)": {
        borderBottom: ({ palette }) => `1px solid ${palette.gray[30]}`,
        "@media (prefers-color-scheme: dark)": {
          borderBottom: ({ palette }) => `1px solid ${palette.gray[70]}`,
        },
      },
    }}
  >
    {children}
  </Box>
);

export const History = () => {
  const { browserFlowRuns, loading } = useFlowRuns();

  if (loading) {
    return (
      <Box p={2}>
        <Skeleton height={20} width={150} style={{ marginBottom: 10 }} />
        <Skeleton height={130} style={{ marginBottom: 20 }} />
        <Skeleton height={20} width={150} style={{ marginBottom: 10 }} />
        <Skeleton height={130} />
      </Box>
    );
  }

  return (
    <Box>
      <HistorySection>
        <ManuallyTriggered browserFlowRuns={browserFlowRuns} />
      </HistorySection>
      <HistorySection>
        <AutomaticallyTriggered browserFlowRuns={browserFlowRuns} />
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
