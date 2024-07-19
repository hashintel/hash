import { TextField } from "@hashintel/design-system";
import type { OwnedById } from "@local/hash-graph-types/web";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { Box, buttonClasses, styled, Typography } from "@mui/material";
import type { LoginFlow } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import type { AxiosError } from "axios";
import { useRouter } from "next/router";
import type { FormEventHandler } from "react";
import { useContext, useEffect, useMemo, useState } from "react";

import { useHashInstance } from "../components/hooks/use-hash-instance";
import { ArrowRightToBracketRegularIcon } from "../shared/icons/arrow-right-to-bracket-regular-icon";
import { ArrowTurnDownLeftRegularIcon } from "../shared/icons/arrow-turn-down-left-regular-icon";
import type { NextPageWithLayout } from "../shared/layout";
import { getPlainLayout } from "../shared/layout";
import type { ButtonProps } from "../shared/ui";
import { Button } from "../shared/ui";
import { AuthHeading } from "./shared/auth-heading";
import { useAuthInfo } from "./shared/auth-info-context";
import { AuthLayout } from "./shared/auth-layout";
import { AuthPaper } from "./shared/auth-paper";
import { mustGetCsrfTokenFromFlow, oryKratosClient } from "./shared/ory-kratos";
import { useKratosErrorHandler } from "./shared/use-kratos-flow-error-handler";
import { WorkspaceContext } from "./shared/workspace-context";

const SignupButton = styled((props: ButtonProps) => (
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

const SigninPage: NextPageWithLayout = () => {
  // Get ?flow=... from the URL
  const router = useRouter();
  const { refetch } = useAuthInfo();
  const { updateActiveWorkspaceOwnedById } = useContext(WorkspaceContext);
  const { hashInstance } = useHashInstance();

  const {
    flow: flowId,
    // Refresh means we want to refresh the session. This is needed, for example, when we want to update the password
    // of a user.
    refresh,
    login_challenge: loginChallenge,
    // AAL = Authorization Assurance Level. This implies that we want to upgrade the AAL, meaning that we want
    // to perform two-factor authentication/verification.
    aal,
  } = router.query;

  const [flow, setFlow] = useState<LoginFlow>();

  const returnTo = useMemo(() => {
    if (typeof router.query.return_to !== "string") {
      return undefined;
    }

    const possiblyMaliciousRedirect =
      typeof router.query.return_to === "string"
        ? router.query.return_to
        : undefined;

    const redirectUrl = possiblyMaliciousRedirect
      ? new URL(possiblyMaliciousRedirect, frontendUrl)
      : undefined;

    const redirectPath = redirectUrl?.pathname;

    if (redirectUrl && redirectUrl.origin !== frontendUrl) {
      /**
       * This isn't strictly necessary since we're only going to take the pathname,
       * but useful to have the error reported
       */
      throw new Error(
        `Someone tried to pass an external URL as a redirect: ${possiblyMaliciousRedirect}`,
      );
    }

    if (
      redirectPath &&
      (redirectPath.includes("\\") || redirectPath.includes("//"))
    ) {
      /**
       * next/router will error if these are included in the URL, but this makes
       * the error more useful
       */
      throw new Error(
        `Someone tried to pass a malformed URL as a redirect: ${possiblyMaliciousRedirect}`,
      );
    }

    return redirectPath;
  }, [router]);

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>();

  const { handleFlowError } = useKratosErrorHandler({
    flowType: "login",
    setFlow,
    setErrorMessage,
  });

  useEffect(() => {
    // If the router is not ready yet, or we already have a flow, do nothing.
    if (!router.isReady || flow) {
      return;
    }

    // If ?flow=.. was in the URL, we fetch it
    if (flowId) {
      oryKratosClient
        .getLoginFlow({ id: String(flowId) })
        .then(({ data }) => setFlow(data))
        .catch(handleFlowError);
      return;
    }

    // Otherwise we initialize it
    oryKratosClient
      .createBrowserLoginFlow({
        refresh: Boolean(refresh),
        aal: aal ? String(aal) : undefined,
        loginChallenge:
          typeof loginChallenge === "string" ? loginChallenge : undefined,
      })
      .then(({ data }) => setFlow(data))
      .catch(handleFlowError);
  }, [
    flowId,
    loginChallenge,
    router,
    router.isReady,
    aal,
    refresh,
    flow,
    handleFlowError,
  ]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    if (!flow) {
      throw new Error(
        "No sign in flow available – please try clearing your cookies.",
      );
    }

    if (!email || !password) {
      return;
    }

    const csrf_token = mustGetCsrfTokenFromFlow(flow);

    void router
      // On submission, add the flow ID to the URL but do not navigate. This prevents the user losing
      // their data when they reload the page.
      .push(`/signin?flow=${flow.id}`, undefined, { shallow: true })
      .then(() =>
        oryKratosClient
          .updateLoginFlow({
            flow: String(flow.id),
            updateLoginFlowBody: {
              csrf_token,
              method: "password",
              identifier: email,
              password,
            },
          })
          // We logged in successfully! Let's redirect the user.
          .then(async () => {
            // Otherwise, redirect the user to their workspace.
            const { authenticatedUser } = await refetch();

            if (!authenticatedUser) {
              throw new Error(
                "Could not fetch authenticated user after logging in.",
              );
            }

            updateActiveWorkspaceOwnedById(
              authenticatedUser.accountId as OwnedById,
            );

            void router.push(returnTo ?? flow.return_to ?? "/");
          })
          .catch(handleFlowError)
          .catch((err: AxiosError<LoginFlow>) => {
            // If the previous handler did not catch the error it's most likely a form validation error
            if (err.response?.status === 400) {
              // Yup, it is!
              setFlow(err.response.data);
              return;
            }

            if (err.response?.status === 429) {
              // This is a rate limiting error
              setErrorMessage("Too many attempts, please try again shortly.");
              return;
            }

            // This is an unexpected error, throw it so that it's reported
            return Promise.reject(err);
          }),
      );
  };

  const emailInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) &&
      attributes.name === "traits.emails",
  );

  const passwordInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) && attributes.name === "password",
  );

  const { userSelfRegistrationIsEnabled } = hashInstance?.properties ?? {};

  return (
    <AuthLayout
      headerEndAdornment={
        <SignupButton
          endIcon={<ArrowRightToBracketRegularIcon />}
          href="/signup"
          disabled={!userSelfRegistrationIsEnabled}
        >
          Sign up
        </SignupButton>
      }
    >
      <Box
        sx={{
          width: "100%",
          display: "flex",
          gap: 5.75,
          justifyContent: "center",
          alignItems: "center",
          flexDirection: {
            xs: "column",
            md: "row",
          },
        }}
      >
        <AuthPaper
          sx={{
            flexGrow: 1,
            maxWidth: 600,
          }}
        >
          <AuthHeading>Sign in to your account</AuthHeading>
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              display: "flex",
              flexDirection: "column",
              maxWidth: 500,
              gap: 1,
            }}
          >
            <TextField
              label="Email address"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="Enter your email address"
              value={email}
              onChange={({ target }) => setEmail(target.value)}
              error={
                !!emailInputUiNode?.messages.find(
                  ({ type }) => type === "error",
                )
              }
              helperText={emailInputUiNode?.messages.map(({ id, text }) => (
                <Typography key={id}>{text}</Typography>
              ))}
              required
              inputProps={{ "data-1p-ignore": false }}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={({ target }) => setPassword(target.value)}
              error={
                !!passwordInputUiNode?.messages.find(
                  ({ type }) => type === "error",
                )
              }
              helperText={passwordInputUiNode?.messages.map(({ id, text }) => (
                <Typography key={id}>{text}</Typography>
              ))}
              required
              inputProps={{ "data-1p-ignore": false }}
              // eslint-disable-next-line react/jsx-no-duplicate-props
              InputProps={{
                endAdornment: (
                  <Button
                    type="submit"
                    variant="tertiary_quiet"
                    sx={{
                      /** @todo: replace this with a blue from the design system */
                      color: "#2482FF",
                      "&:hover": {
                        color: "#2482FF",
                      },
                      [` .${buttonClasses.endIcon} svg`]: {
                        color: "#2482FF",
                      },
                    }}
                    endIcon={<ArrowTurnDownLeftRegularIcon />}
                  >
                    Submit
                  </Button>
                ),
              }}
            />
            {errorMessage ? <Typography>{errorMessage}</Typography> : null}
            {flow?.ui.messages?.map(({ text, id }) => (
              <Typography key={id}>{text}</Typography>
            ))}
            {/* @todo: bring back recover account button */}
            {/* <Button
              variant="secondary"
              href={{ pathname: "/recovery", query: { email } }}
            >
              Recover your account
            </Button> */}
          </Box>
        </AuthPaper>
        <Box>
          <Typography gutterBottom>
            <strong>No account?</strong> No problem.
          </Typography>
          <Button href="/signup" disabled={!userSelfRegistrationIsEnabled}>
            Create a free account
          </Button>
        </Box>
      </Box>
    </AuthLayout>
  );
};

SigninPage.getLayout = getPlainLayout;

export default SigninPage;
