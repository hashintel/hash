import { useEffect } from "react";
import { useRouter } from "next/router";

import { Box, Container, Typography } from "@mui/material";
import { useUser } from "../components/hooks/useUser";
import { NextPageWithLayout } from "../shared/layout";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { user, loading, kratosSession } = useUser();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (user) {
      // Temporarily redirect logged in user to their account page
      void router.push(`/${user.accountId}`);
    }

    if (!kratosSession) {
      void router.push("/login");
    }
  }, [loading, router, user, kratosSession]);

  return (
    <Container sx={{ pt: 10 }}>
      <Typography variant="h1" gutterBottom>
        {kratosSession
          ? "You have a kratos session"
          : "You don't have a kratos session"}
      </Typography>
      <Typography gutterBottom>
        This is what your kratos session looks like:
      </Typography>
      {kratosSession ? (
        <Box component="pre">{JSON.stringify(kratosSession, null, 2)}</Box>
      ) : null}
    </Container>
  );
};

export default Page;
