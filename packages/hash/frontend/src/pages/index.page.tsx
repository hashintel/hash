import { useEffect } from "react";
import { useRouter } from "next/router";

import { Box, Container, Typography } from "@mui/material";
import { useUser } from "../components/hooks/useUser";
import { NextPageWithLayout } from "../shared/layout";
import { Button } from "../shared/ui";
import { useLogoutFlow } from "../components/hooks/useLogoutFlow";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { user, loading, kratosSession } = useUser();

  const { logout } = useLogoutFlow();

  useEffect(() => {
    if (user) {
      void router.push(`/${user.entityId}`);
    }
  }, [router, user]);

  useEffect(() => {
    if (!loading && !kratosSession) {
      void router.push("/login");
    }
  }, [loading, router, kratosSession]);

  /** @todo: remove session developer information */
  return (
    <Container sx={{ pt: 10 }}>
      {user && <Typography variant="h1">Hi {user.preferredName}!</Typography>}
      <Typography variant="h2" gutterBottom>
        {kratosSession
          ? "You have a kratos session"
          : "You don't have a kratos session"}
      </Typography>
      <Button onClick={logout}>Log out</Button>
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
