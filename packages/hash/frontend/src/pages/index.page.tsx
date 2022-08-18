import { useEffect } from "react";
import { useRouter } from "next/router";

import { Box, Typography } from "@mui/material";
import { useUser } from "../components/hooks/useUser";
import { NextPageWithLayout } from "../shared/layout";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { user, loading } = useUser();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (user) {
      // Temporarily redirect logged in user to their account page
      void router.push(`/${user.accountId}`);
    } else {
      void router.push("/login");
    }
  }, [loading, router, user]);

  return (
    <Box component="main" pt="30vh" display="flex" justifyContent="center">
      <Typography
        variant="h1"
        sx={({ palette }) => ({ color: palette.gray[70], fontWeight: 400 })}
      >
        Loading...
      </Typography>
    </Box>
  );
};

export default Page;
