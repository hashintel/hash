import { Box, Typography } from "@mui/material";

import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { Link } from "../shared/ui";
import { useAuthInfo } from "./shared/auth-info-context";

const Page: NextPageWithLayout = () => {
  const { hasAccessToHash } = useAuthInfo();

  return hasAccessToHash ? (
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
          HASH is stil pre-v1. As such, your feedback is greatly appreciated.
          Join our{" "}
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
  ) : (
    <Box>
      <Typography mb={3} variant="h2">
        Welcome to HASH
      </Typography>
      <Typography mb={3}>
        <strong>You are currently signed up and on the waitlist.</strong> You'll
        receive an email from us when it's your turn to access HASH. If you'd
        like to jump ahead,{" "}
        <Link href="https://hash.ai/contact">tell us about your use case</Link>{" "}
        and we'll move you up the list.
      </Typography>
      <Typography mb={3}>
        In the meantime,{" "}
        <Link href="https://x.com/hashintel">follow us on X</Link> for preview
        videos and updates.
      </Typography>
    </Box>
  );
};

Page.getLayout = (page) => getLayoutWithSidebar(page);

export default Page;
