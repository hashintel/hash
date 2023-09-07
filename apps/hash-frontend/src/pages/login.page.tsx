import { TextField } from "@hashintel/design-system";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { Box, Container, Typography } from "@mui/material";
import { LoginFlow } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import { AxiosError } from "axios";
import { useRouter } from "next/router";
import {
  FormEventHandler,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useHashInstance } from "../components/hooks/use-hash-instance";
import { useLogoutFlow } from "../components/hooks/use-logout-flow";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { Button } from "../shared/ui";
import { useAuthInfo } from "./shared/auth-info-context";
import { mustGetCsrfTokenFromFlow, oryKratosClient } from "./shared/ory-kratos";
import { useKratosErrorHandler } from "./shared/use-kratos-flow-error-handler";
import { WorkspaceContext } from "./shared/workspace-context";

const LoginPage: NextPageWithLayout = () => {
  // Get ?flow=... from the URL
  const router = useRouter();
  const { refetch } = useAuthInfo();
  const { updateActiveWorkspaceAccountId } = useContext(WorkspaceContext);
  const { hashInstance } = useHashInstance();

  const {
    flow: flowId,
    // Refresh means we want to refresh the session. This is needed, for example, when we want to update the password
    // of a user.
    refresh,
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

  // This might be confusing, but we want to show the user an option
  // to sign out if they are performing two-factor authentication!
  const { logout } = useLogoutFlow();

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
      })
      .then(({ data }) => setFlow(data))
      .catch(handleFlowError);
  }, [flowId, router, router.isReady, aal, refresh, flow, handleFlowError]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    if (!flow || !email || !password) {
      return;
    }

    const csrf_token = mustGetCsrfTokenFromFlow(flow);

    void router
      // On submission, add the flow ID to the URL but do not navigate. This prevents the user losing
      // their data when they reload the page.
      .push(`/login?flow=${flow.id}`, undefined, { shallow: true })
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

            updateActiveWorkspaceAccountId(authenticatedUser.accountId);

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

  return (
    <Container sx={{ pt: 10 }}>
      <Typography variant="h1" gutterBottom>
        Log In
      </Typography>
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
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="Enter your email address"
          value={email}
          onChange={({ target }) => setEmail(target.value)}
          error={
            !!emailInputUiNode?.messages.find(({ type }) => type === "error")
          }
          helperText={emailInputUiNode?.messages.map(({ id, text }) => (
            <Typography key={id}>{text}</Typography>
          ))}
          required
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={({ target }) => setPassword(target.value)}
          error={
            !!passwordInputUiNode?.messages.find(({ type }) => type === "error")
          }
          helperText={passwordInputUiNode?.messages.map(({ id, text }) => (
            <Typography key={id}>{text}</Typography>
          ))}
          required
        />
        <Button type="submit">Log in to your account</Button>
        {flow?.ui.messages?.map(({ text, id }) => (
          <Typography key={id}>{text}</Typography>
        ))}
        {errorMessage ? <Typography>{errorMessage}</Typography> : null}
        {aal || refresh ? (
          <Button variant="secondary" onClick={logout}>
            Log out
          </Button>
        ) : (
          <>
            {hashInstance?.properties.userSelfRegistrationIsEnabled ? (
              <Button variant="secondary" href="/signup">
                Create account
              </Button>
            ) : null}
            <Button
              variant="secondary"
              href={{ pathname: "/recovery", query: { email } }}
            >
              Recover your account
            </Button>
          </>
        )}
      </Box>
    </Container>
  );
};

LoginPage.getLayout = getPlainLayout;

export default LoginPage;
