import { useRouter } from "next/router";
import React, { useEffect, FormEventHandler, useState, useMemo } from "react";
import { SelfServiceLoginFlow } from "@ory/client";
import { Typography, Container, Box, TextField } from "@mui/material";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import { AxiosError } from "axios";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import {
  createFlowErrorHandler,
  mustGetCsrfTokenFromFlow,
  oryKratosClient,
} from "./shared/ory-kratos";
import { Button } from "../shared/ui";
import { useLogoutFlow } from "../components/hooks/useLogoutFlow";

const LoginPage: NextPageWithLayout = () => {
  // Get ?flow=... from the URL
  const router = useRouter();

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

  const [flow, setFlow] = useState<SelfServiceLoginFlow>();

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
        .getSelfServiceLoginFlow(String(flowId))
        .then(({ data }) => setFlow(data))
        .catch(handleFlowError);
      return;
    }

    // Otherwise we initialize it
    oryKratosClient
      .initializeSelfServiceLoginFlowForBrowsers(
        Boolean(refresh),
        aal ? String(aal) : undefined,
        returnTo ? String(returnTo) : undefined,
      )
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
      .push(`/login?flow=${flow?.id}`, undefined, { shallow: true })
      .then(() =>
        oryKratosClient
          .submitSelfServiceLoginFlow(String(flow?.id), {
            csrf_token,
            method: "password",
            identifier: email,
            password,
          })
          // We logged in successfully! Let's bring the user home.
          .then(() => {
            if (flow?.return_to) {
              window.location.href = flow?.return_to;
              return;
            }
            void router.push("/");
          })
          .catch(handleFlowError)
          .catch((err: AxiosError<SelfServiceLoginFlow>) => {
            // If the previous handler did not catch the error it's most likely a form validation error
            if (err.response?.status === 400) {
              // Yup, it is!
              setFlow(err.response?.data);
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
          "> *": {
            marginTop: 1,
          },
        }}
      >
        <TextField
          label="Email"
          type="email"
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
            <Button variant="secondary" href="/signup">
              Create account
            </Button>
            {/* @todo: implement kratos recovery flow, and add button here */}
            {/* <Button variant="secondary" href="/recovery">
              Recover your account
            </Button> */}
          </>
        )}
      </Box>
    </Container>
  );
};

LoginPage.getLayout = getPlainLayout;

export default LoginPage;
