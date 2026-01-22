import { Chip, TextField } from "@hashintel/design-system";
import { AutoAwesome as AiIcon } from "@mui/icons-material";
import { Box, Paper, Stack, Typography } from "@mui/material";

import { Button } from "../../../shared/ui/button";

type GoalInputStepProps = {
  userGoal: string;
  onGoalChange: (goal: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  error: string | null;
};

const EXAMPLE_GOALS = [
  "Show top 10 flights by scheduled departure time",
  "Compare revenue across product categories",
  "Display monthly user signups over the last year",
  "Show distribution of order statuses",
  "Track task completion rates by team",
];

export const GoalInputStep = ({
  userGoal,
  onGoalChange,
  onSubmit,
  isLoading,
  error,
}: GoalInputStepProps) => {
  const handleExampleClick = (example: string) => {
    onGoalChange(example);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        What would you like to visualize?
      </Typography>

      <Typography
        variant="smallTextParagraphs"
        sx={{ mb: 3, color: ({ palette }) => palette.gray[70] }}
      >
        Describe your visualization goal in natural language. Our AI will help
        generate the appropriate query and chart configuration.
      </Typography>

      <TextField
        fullWidth
        multiline
        rows={3}
        value={userGoal}
        onChange={(event) => onGoalChange(event.target.value)}
        placeholder="e.g., Show the top 10 flights by scheduled departure time"
        variant="outlined"
        error={!!error}
        helperText={error}
        disabled={isLoading}
        sx={{ mb: 3 }}
      />

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography
          variant="microText"
          sx={{
            mb: 1,
            display: "block",
            color: ({ palette }) => palette.gray[70],
          }}
        >
          Example goals:
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {EXAMPLE_GOALS.map((example) => (
            <Chip
              key={example}
              label={example}
              onClick={() => handleExampleClick(example)}
              variant="outlined"
              size="small"
              sx={{ mb: 1 }}
            />
          ))}
        </Stack>
      </Paper>

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={!userGoal.trim() || isLoading}
          startIcon={<AiIcon />}
        >
          {isLoading ? "Generating Query..." : "Generate Query"}
        </Button>
      </Box>
    </Box>
  );
};
