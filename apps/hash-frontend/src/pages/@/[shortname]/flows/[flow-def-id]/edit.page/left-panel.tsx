import { Box, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { Button, SegmentedControl } from "@hashintel/ds-components";

import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

type LeftPanelTab = "steps" | "add";

/**
 * The flow editor's left panel: the flow's steps, and the steps that can be added to it. Both lists come in later
 * issues; until then, each tab says what it will hold.
 */
export const LeftPanel = ({ steps }: { steps: StepDefinition<string>[] }) => {
  const [tab, setTab] = useState<LeftPanelTab>("steps");

  return (
    <Stack
      sx={{
        flexShrink: 0,
        width: 248,
        borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
      }}
    >
      <Box sx={{ p: 1 }}>
        {/* The design system has no tabs yet (a gap logged in Notion), so a segmented control stands in for them. */}
        <SegmentedControl
          size="sm"
          aria-label="Left panel"
          value={tab}
          onChange={setTab}
          items={[
            { value: "steps", label: "Steps" },
            { value: "add", label: "Add" },
          ]}
        />
      </Box>
      {tab === "steps" ? (
        <Stack gap={1} sx={{ px: 1.5, py: 1 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Typography
              sx={{ fontSize: 12, color: ({ palette }) => palette.gray[50] }}
            >
              {steps.length} {steps.length === 1 ? "step" : "steps"}
            </Typography>
            <Button variant="link" size="sm" disabled>
              Collapse all
            </Button>
          </Stack>
          {steps.length === 0 && (
            <Typography
              sx={{ fontSize: 14, color: ({ palette }) => palette.gray[60] }}
            >
              Steps you add appear here.
            </Typography>
          )}
        </Stack>
      ) : (
        <Typography
          sx={{
            px: 1.5,
            py: 1,
            fontSize: 14,
            color: ({ palette }) => palette.gray[60],
          }}
        >
          Steps you can add will be listed here.
        </Typography>
      )}
    </Stack>
  );
};
