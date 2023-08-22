import { Box, Typography } from "@mui/material";

import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { Link } from "../shared/ui";

const Page: NextPageWithLayout = () => {
  return (
    <Box sx={{ pt: 7 }}>
      <Typography mb={3} variant="h2">
        Welcome to HASH
      </Typography>
      <Box maxWidth="75ch">
        <Typography mb={3}>
          HASH is an open-source, data-centric, all-in-one workspace.
        </Typography>
        <Typography mb={3}>
          Please visit the{" "}
          <Link href="https://github.com/hashintel/hash">
            GitHub repository
          </Link>{" "}
          for the latest updates, or check out our{" "}
          <Link href="https://hash.dev/roadmap?utm_medium=organic&utm_source=hash-app_home-page">
            development roadmap
          </Link>{" "}
          to see what lies ahead.
        </Typography>
        <Typography>
          HASH is stil pre-v1. As such, your feedback is greatly appreciated. Join our{" "}
          <Link href="https://hash.ai/discord?utm_medium=organic&utm_source=hash-app_home-page">
            community forum
          </Link>{" "}
          or{" "}
          <Link href="https://hash.ai/contact?utm_medium=organic&utm_source=hash-app_home-page">
            contact us
          </Link>{" "}
          directly at any time.
        </Typography>
      </Box>
    </Box>
  );
};

Page.getLayout = (page) => getLayoutWithSidebar(page);

export default Page;
