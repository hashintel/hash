import { Box, Container, Typography } from "@mui/material";

import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { CreateOrgForm } from "./organization.page/create-org-form";

const Page: NextPageWithLayout = () => {
  return (
    <Container>
      <Box sx={{ paddingLeft: 4 }}>
        <Typography variant="h1" mt={10} mb={4} fontWeight="bold">
          Create new organization
        </Typography>
        <CreateOrgForm />
      </Box>
    </Container>
  );
};

Page.getLayout = (page) => getLayoutWithSidebar(page, { fullWidth: true });

export default Page;
