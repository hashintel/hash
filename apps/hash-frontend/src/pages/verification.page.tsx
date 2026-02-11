import { Box, CircularProgress, styled, Typography } from "@mui/material";
import type { VerificationFlow } from "@ory/client";
import type { AxiosError } from "axios";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

import { useLogoutFlow } from "../components/hooks/use-logout-flow";
import type { NextPageWithLayout } from "../shared/layout";
import { getPlainLayout } from "../shared/layout";
import type { ButtonProps } from "../shared/ui";
import { Button } from "../shared/ui";
import { useAuthInfo } from "./shared/auth-info-context";
import { AuthLayout } from "./shared/auth-layout";
import { mustGetCsrfTokenFromFlow, oryKratosClient } from "./shared/ory-kratos";
import { VerifyEmailStep } from "./shared/verify-email-step";

const LogoutButton = styled((props: ButtonProps) => (
  <Button variant="secondary" size="small" {...props} />
))(({ theme }) => ({
  color: theme.palette.common.white,
  background: "#1F2933",
  transition: theme.transitions.create(["background", "box-shadow"]),
  borderColor: "#283644",
  boxShadow: theme.shadows[3],
  "&:hover": {
    background: "#283644",
    boxShadow: theme.shadows[4],
    "&:before": {
      opacity: 0,
    },
  },
}));

const VerifyEmailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { logout } = useLogoutFlow();
  const { authenticatedUser, emailVerificationStatusKnown, refetch } =
    useAuthInfo();

  const primaryEmailVerified =
    authenticatedUser?.emails.find(({ primary }) => primary)?.verified ?? false;

  const urlCode =
    typeof router.query.code === "string" ? router.query.code : undefined;
  const urlFlowId =
    typeof router.query.flow === "string" ? router.query.flow : undefined;

  const [autoVerifying, setAutoVerifying] = useState(false);
  const [autoVerifyError, setAutoVerifyError] = useState<string>();
  const autoVerifyAttempted = useRef(false);

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

  /**
   * When the page is loaded with both `code` and `flow` query params (e.g.
   * from clicking the verification link in an email), attempt to verify the
   * email automatically without requiring the user to enter the code.
   */
  useEffect(() => {
    if (
      !urlCode ||
      !urlFlowId ||
      !authenticatedUser ||
      primaryEmailVerified ||
      autoVerifyAttempted.current
    ) {
      return;
    }

    autoVerifyAttempted.current = true;
    setAutoVerifying(true);

    void oryKratosClient
      .getVerificationFlow({ id: urlFlowId })
      .then(({ data: existingFlow }) =>
        oryKratosClient.updateVerificationFlow({
          flow: existingFlow.id,
          updateVerificationFlowBody: {
            method: "code",
            code: urlCode,
            csrf_token: mustGetCsrfTokenFromFlow(existingFlow),
          },
        }),
      )
      .then(async () => {
        await refetch();
        void router.replace("/");
      })
      .catch((error: AxiosError<VerificationFlow>) => {
        const errorMessages =
          error.response?.data.ui.messages
            ?.filter(({ type }) => type === "error")
            .map(({ text }) => text) ?? [];

        setAutoVerifyError(
          errorMessages.length > 0
            ? errorMessages.join(" ")
            : "The verification link may have expired. A new code has been sent to your email.",
        );
        setAutoVerifying(false);

        // Strip the code and flow params from the URL so we don't retry
        void router.replace("/verification", undefined, { shallow: true });
      });
  }, [
    urlCode,
    urlFlowId,
    authenticatedUser,
    primaryEmailVerified,
    refetch,
    router,
  ]);

  if (!authenticatedUser || primaryEmailVerified) {
    return null;
  }

  if (autoVerifying) {
    return (
      <AuthLayout
        headerEndAdornment={
          <LogoutButton onClick={logout}>Log out</LogoutButton>
        }
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <CircularProgress size={32} />
          <Typography
            sx={{ fontSize: 16, color: ({ palette }) => palette.gray[70] }}
          >
            Verifying your email...
          </Typography>
        </Box>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      headerEndAdornment={<LogoutButton onClick={logout}>Log out</LogoutButton>}
    >
      <Box sx={{ maxWidth: 600 }}>
        <VerifyEmailStep
          email={authenticatedUser.emails[0]?.address ?? ""}
          initialError={autoVerifyError}
          onVerified={async () => {
            await refetch();
            void router.push("/");
          }}
        />
      </Box>
    </AuthLayout>
  );
};

VerifyEmailPage.getLayout = getPlainLayout;

export default VerifyEmailPage;
