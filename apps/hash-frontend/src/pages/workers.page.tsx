import { TerminalLightIcon } from "@hashintel/design-system";
import { Box } from "@mui/material";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { WorkersHeader } from "../shared/workers-header";

const WorkersPageContent = () => {
  return (
    <Box>
      <WorkersHeader
        crumbs={[
          {
            icon: null,
            id: "goals",
            title: "Workers",
          },
        ]}
        title={{ text: "Activity Log", Icon: TerminalLightIcon }}
        subtitle="A complete record of all worker activity in your webs"
      />
    </Box>
  );
};

const WorkersPage: NextPageWithLayout = () => {
  return <WorkersPageContent />;
};

WorkersPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default WorkersPage;
