import { Box } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { useLogoutFlow } from "../components/hooks/use-logout-flow";
import type { NextPageWithLayout } from "../shared/layout";
import { getPlainLayout } from "../shared/layout";
import { Button } from "../shared/ui";
import { useAuthInfo } from "./shared/auth-info-context";
import { AuthLayout } from "./shared/auth-layout";
import { VerifyEmailStep } from "./shared/verify-email-step";

const VerifyEmailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { logout } = useLogoutFlow();
  const { authenticatedUser, emailVerificationStatusKnown, refetch } =
    useAuthInfo();

  const primaryEmailVerified =
    authenticatedUser?.emails.find(({ primary }) => primary)?.verified ?? false;

  useEffect(() => {
    if (emailVerificationStatusKnown && !authenticatedUser) {
      void router.replace("/signin");
    }
  }, [authenticatedUser, emailVerificationStatusKnown, router]);

  useEffect(() => {
    if (authenticatedUser && primaryEmailVerified) {
      void router.replace("/");
    }
  }, [authenticatedUser, primaryEmailVerified, router]);

  if (!authenticatedUser || primaryEmailVerified) {
    return null;
  }

  return (
    <AuthLayout
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Box sx={{ maxWidth: 600 }}>
        <VerifyEmailStep
          email={authenticatedUser.emails[0]?.address ?? ""}
          onVerified={async () => {
            await refetch();
            void router.push("/");
          }}
        />
      </Box>
      <Button
        variant="secondary"
        onClick={logout}
        size="small"
        sx={{ position: "absolute", bottom: 24, right: 24 }}
      >
        Log out
      </Button>
    </AuthLayout>
  );
};

VerifyEmailPage.getLayout = getPlainLayout;

export default VerifyEmailPage;
