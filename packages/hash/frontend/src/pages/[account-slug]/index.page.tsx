import { Box, Typography } from "@mui/material";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { useUser } from "../../components/hooks/useUser";
import { useOrgs } from "../../components/hooks/useOrgs";
import { Link } from "../../shared/ui";
import { useRouteAccountInfo } from "../../shared/routing";
import { FontAwesomeIcon } from "../../shared/icons";

const Page: NextPageWithLayout = () => {
  const { user } = useUser();
  const { data: orgs } = useOrgs();
  const { accountId } = useRouteAccountInfo();

  if (!user) {
    return (
      <h2>
        You must be{" "}
        <Link href="/login" noLinkStyle>
          <Box
            component="strong"
            sx={{
              paddingBottom: "3px",
              borderBottom: `3px solid transparent`,

              "&:hover": {
                borderBottom: ({ palette }) => `3px solid ${palette.blue[70]}`,
              },
            }}
          >
            logged in
          </Box>
        </Link>{" "}
        to access this workspace.
      </h2>
    );
  }

  const ownWorkspace = accountId === user.accountId;

  const thisOrg = ownWorkspace
    ? undefined
    : orgs.find((org) => org.entityId === accountId);

  if (!ownWorkspace && !thisOrg) {
    return (
      <h2>This workspace does not exist or you do not have access to it.</h2>
    );
  }

  return (
    <>
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
    </>
  );
};

Page.getLayout = getLayoutWithSidebar;

export default Page;
