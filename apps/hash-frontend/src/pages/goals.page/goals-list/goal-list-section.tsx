import { Box, Skeleton, Stack, Typography } from "@mui/material";

import type { GoalRow, goalRowSx,GoalSummary  } from "./goal-list-section/goal-row";

export const GoalListSection = ({
  loading,
  rows,
  type,
}: {
  loading: boolean;
  rows: GoalSummary[];
  type: "active" | "archived";
}) => {
  const totalOpenQuestions = rows.reduce(
    (accumulator, row) => accumulator + row.openInputRequests,
    0,
  );

  if (loading) {
    return (
      <Stack
        direction={"row"}
        gap={10}
        sx={{ "*": { transform: "none !important" } }}
      >
        <Box sx={{ mt: 4 }}>
          <Skeleton width={140} height={150} />
        </Box>
        <Box sx={{ width: "100%" }}>
          <Skeleton width={"100%"} height={200} />
        </Box>
      </Stack>
    );
  }

  return (
    <Stack direction={"row"} gap={2}>
      <Box sx={{ width: 250 }}>
        <Typography
          sx={{ fontSize: 42, fontWeight: 600, mt: 2, lineHeight: 1 }}
        >
          {rows.length}
        </Typography>
        <Typography sx={{ fontSize: 17, fontWeight: 600, mb: 2 }}>
          {type} goals
        </Typography>
        {type === "active" && (
          <Typography
            sx={{
              fontSize: 17,
              fontWeight: 400,
              color: ({ palette }) => palette.gray[80],
            }}
          >
            {totalOpenQuestions} open questions
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          borderRadius: 2,
          border: ({ palette }) => `1px solid ${palette.gray[30]}`,
          width: "100%",
        }}
      >
        <Box sx={{ ...goalRowSx }}>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {rows.length} {type} goals
          </Typography>
        </Box>
        {rows.map((row) => (
          <GoalRow key={row.flowRunId} goalSummary={row} />
        ))}
      </Box>
    </Stack>
  );
};
