import { BullseyeLightIcon, TextField } from "@hashintel/design-system";
import {
  Box,
  Container,
  Divider,
  outlinedInputClasses,
  Typography,
} from "@mui/material";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { WorkersHeader } from "../shared/workers-header";
import { useState } from "react";

const Question = ({ number, text }: { number: number; text: string }) => (
  <Typography sx={{ fontSize: 17, fontWeight: 600, mb: 1.5 }}>
    <Typography
      component="span"
      sx={{
        color: ({ palette }) => palette.gray[50],
        fontSize: 17,
        fontWeight: 600,
        mr: 2,
      }}
    >
      {number}.
    </Typography>
    {text}
  </Typography>
);

const GoalsPageContent = () => {
  const [goal, setGoal] = useState("");

  return (
    <Box>
      <WorkersHeader
        crumbs={[
          {
            icon: null,
            id: "goals",
            title: "Goals",
          },
          {
            icon: null,
            id: "new",
            title: "New",
          },
        ]}
        sideTitle="New research goal"
        title={{
          text: "Goals",
          Icon: BullseyeLightIcon,
          iconSx: { fontSize: 32, my: 0.4 },
        }}
      />
      <Container>
        <Box
          sx={({ palette }) => ({
            background: palette.common.white,
            borderRadius: 2,
            border: `1px solid ${palette.gray[30]}`,
            p: 4,
          })}
        >
          <Question number={1} text="What do you want to research?" />
          <TextField
            inputProps={{
              px: 2.5,
              py: 2,
            }}
            onChange={(event) => setGoal(event.target.value)}
            placeholder={"Enter your goal"}
            sx={{
              [`.${outlinedInputClasses.root}`]: {
                boxShadow: "none",
              },
              [`.${outlinedInputClasses.root} input`]: {
                fontSize: 15,
              },
              mb: 4,
              width: 390,
            }}
            value={goal}
          />
          <Question number={2} text="What should happen to the outputs?" />
        </Box>
      </Container>
    </Box>
  );
};

const GoalsPage: NextPageWithLayout = () => {
  return <GoalsPageContent />;
};

GoalsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default GoalsPage;
