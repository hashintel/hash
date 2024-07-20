import { BullseyeLightIcon } from "@hashintel/design-system";
import { Box, Container } from "@mui/material";

import { PlusRegularIcon } from "../shared/icons/plus-regular";
import type { getLayoutWithSidebar,NextPageWithLayout  } from "../shared/layout";
import { Button } from "../shared/ui/button";
import { WorkersHeader } from "../shared/workers-header";

import { GoalsList } from "./goals.page/goals-list";
import { FlowRunsContextProvider } from "./shared/flow-runs-context";

const GoalsPageContent = () => {
  return (
    <Box>
      <WorkersHeader
        hideDivider
        subtitle={"Workers conduct research and analysis for you"}
        crumbs={[
          {
            icon: null,
            id: "goals",
            title: "Goals",
          },
        ]}
        endElement={
          <Button href={"/goals/new"} size={"xs"} sx={{ py: 1.3 }}>
            Create goal <PlusRegularIcon sx={{ fontSize: 14, ml: 1 }} />
          </Button>
        }
        title={{
          text: "Goals",
          Icon: BullseyeLightIcon,
          iconSx: { fontSize: 32, my: 0.4 },
        }}
      />
      <Container>
        <GoalsList />
      </Container>
    </Box>
  );
};

const GoalsPage: NextPageWithLayout = () => {
  return (
    <FlowRunsContextProvider selectedFlowRunId={null}>
      <GoalsPageContent />
    </FlowRunsContextProvider>
  );
};

GoalsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default GoalsPage;
