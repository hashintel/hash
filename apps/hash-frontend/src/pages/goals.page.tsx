import { BullseyeLightIcon } from "@hashintel/design-system";
import { Box, Container } from "@mui/material";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { WorkersHeader } from "../shared/workers-header";

const GoalsPageContent = () => {
  return (
    <Box>
      <WorkersHeader
        crumbs={[
          {
            icon: null,
            id: "goals",
            title: "Goals",
          },
        ]}
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
        />
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
