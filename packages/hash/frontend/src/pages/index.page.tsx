import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@local/design-system";
import { Box, Container, Typography } from "@mui/material";

import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { Link } from "../shared/ui";

const Page: NextPageWithLayout = () => {
  return (
    <Container sx={{ pt: 7 }}>
      <Typography mb={3} variant="h2">
        Welcome to HASH
      </Typography>
      <Box maxWidth="75ch">
        <Typography mb={3}>
          HASH is an open-source, data-centric, all-in-one workspace built atop
          the open <Link href="https://blockprotocol.org">Block Protocol</Link>.
        </Typography>
        <Typography mb={3}>
          <strong>
            <FontAwesomeIcon
              icon={faWarning}
              sx={({ palette }) => ({
                color: palette.orange[50],
                mr: 0.5,
              })}
            />{" "}
            HASH is not ready for production use.
          </strong>{" "}
          It is not secure or optimized and is missing key features. Please
          visit the{" "}
          <Link href="https://github.com/hashintel/hash/tree/main/packages/hash">
            GitHub repository
          </Link>{" "}
          for the latest updates, or learn about the long-term{" "}
          <Link href="https://hash.ai">here</Link>.
        </Typography>
        <Typography>
          This version of HASH is intended to be used as a test-harness for
          developers building Block Protocol-compliant blocks. Please{" "}
          <Link href="https://github.com/hashintel/hash/tree/main/packages/hash#integration-with-the-block-protocol">
            read the documentation to get started
          </Link>
          .
        </Typography>
      </Box>
    </Container>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
