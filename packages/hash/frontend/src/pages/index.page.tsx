import { useEffect } from "react";
import { useRouter } from "next/router";

import { Container, Typography } from "@mui/material";
import { useLoggedInUser } from "../components/hooks/useAuthenticatedUser";
import { NextPageWithLayout } from "../shared/layout";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser, loading } = useLoggedInUser();

  useEffect(() => {
    if (authenticatedUser) {
      void router.push(`/${authenticatedUser.userAccountId}`);
    } else if (!loading && !authenticatedUser) {
      void router.push("/login");
    }
  }, [router, authenticatedUser, loading]);

  return (
    <Container sx={{ pt: 10 }}>
      <Typography variant="h1">Homepage</Typography>
    </Container>
  );
};

export default Page;
