import { Box, Typography, Container } from "@mui/material";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { useAuthenticatedUser } from "../../components/hooks/useAuthenticatedUser";
import { useOrgs } from "../../components/hooks/useOrgs";
import { Link } from "../../shared/ui";
import { useRouteAccountInfo } from "../../shared/routing";
import { ProfilePage } from "./profile-page";

const Page: NextPageWithLayout = () => {
  const { loading, authenticatedUser } = useAuthenticatedUser();
  const { orgs } = useOrgs();

  /**
   * @todo: this will need to be reworked once pages can't rely on the `accountId` being
   * in the URL.
   */
  const { routeAccountSlug: routeAccountIdOrShortname } = useRouteAccountInfo();

  const isRouteAccountSlugShortname = routeAccountIdOrShortname.startsWith("@");

  if (isRouteAccountSlugShortname) {
    const shortname = routeAccountIdOrShortname.slice(1);
    return <ProfilePage shortname={shortname} />;
  }

  const routeAccountId = routeAccountIdOrShortname;

  if (loading) {
    return null;
  }

  if (!authenticatedUser) {
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

  const ownWorkspace = routeAccountId === authenticatedUser.userAccountId;

  const thisOrg = ownWorkspace
    ? undefined
    : orgs?.find((org) => org.orgAccountId === routeAccountId);

  return (
    <Container sx={{ pt: 7 }}>
      {!ownWorkspace && !thisOrg ? (
        <h2>This workspace does not exist or you do not have access to it.</h2>
      ) : (
        <>
          <Typography mb={3} variant="h2">
            Welcome to HASH
          </Typography>
          <Box maxWidth="75ch">
            <Typography mb={3}>
              HASH is an open-source, data-centric, all-in-one workspace built
              atop the open{" "}
              <Link href="https://blockprotocol.org">Block Protocol</Link>.
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
      )}
    </Container>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
