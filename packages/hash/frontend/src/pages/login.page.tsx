import { TextField } from "@hashintel/hash-design-system";
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
import {
  createFlowErrorHandler,
  mustGetCsrfTokenFromFlow,
  oryKratosClient,
} from "./shared/ory-kratos";
import { WorkspaceContext } from "./shared/workspace-context";

const LoginPage: NextPageWithLayout = () => {
  // Get ?flow=... from the URL
  const router = useRouter();
  const { refetch } = useAuthInfo();
  const { updateActiveWorkspaceAccountId } = useContext(WorkspaceContext);
  const { hashInstance } = useHashInstance();

  const {
    return_to: returnTo,
    flow: flowId,
    // Refresh means we want to refresh the session. This is needed, for example, when we want to update the password
    // of a user.
    refresh,
    // AAL = Authorization Assurance Level. This implies that we want to upgrade the AAL, meaning that we want
    // to perform two-factor authentication/verification.
    aal,
  } = router.query;

  const [flow, setFlow] = useState<LoginFlow>();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleFlowError = useMemo(
    () =>
      createFlowErrorHandler({
        router,
        flowType: "login",
        setFlow,
        setErrorMessage,
      }),
    [router, setFlow, setErrorMessage],
  );

  // This might be confusing, but we want to show the user an option
  // to sign out if they are performing two-factor authentication!
  const { logout } = useLogoutFlow([aal, refresh]);

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
        returnTo: returnTo ? String(returnTo) : undefined,
      })
      .then(({ data }) => setFlow(data))
      .catch(handleFlowError);
  }, [
    flowId,
    router,
    router.isReady,
    aal,
    refresh,
    returnTo,
    flow,
    handleFlowError,
  ]);

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
            // If the flow specifies a redirect, use it.
            if (flow.return_to) {
              window.location.href = flow.return_to;
              return;
            }

            // Otherwise, redirect the user to their workspace.
            const { authenticatedUser } = await refetch();

            if (!authenticatedUser) {
              throw new Error(
                "Could not fetch authenticated user after logging in.",
              );
            }

            updateActiveWorkspaceAccountId(authenticatedUser.accountId);

            void router.push("/");
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
          "> *:not(:first-child)": {
            marginTop: 1,
          },
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
            {hashInstance && hashInstance.userSelfRegistrationIsEnabled ? (
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
