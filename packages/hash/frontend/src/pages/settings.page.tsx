import { TextField } from "@local/design-system";
import { Box, Container, Typography } from "@mui/material";
import { SettingsFlow } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import { AxiosError } from "axios";
import { useRouter } from "next/router";
import { FormEventHandler, useEffect, useMemo, useState } from "react";

import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { Button } from "../shared/ui";
import {
  createFlowErrorHandler,
  gatherUiNodeValuesFromFlow,
  oryKratosClient,
} from "./shared/ory-kratos";

const SettingsPage: NextPageWithLayout = () => {
  // Get ?flow=... from the URL
  const router = useRouter();

  const { return_to: returnTo, flow: flowId } = router.query;

  const [flow, setFlow] = useState<SettingsFlow>();
  const [updatedPassword, setUpdatedPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleFlowError = useMemo(
    () =>
      createFlowErrorHandler({
        router,
        flowType: "settings",
        setFlow,
        setErrorMessage,
      }),
    [router, setFlow, setErrorMessage],
  );

  useEffect(() => {
    // If the router is not ready yet, or we already have a flow, do nothing.
    if (!router.isReady || flow) {
      return;
    }

    // If ?flow=.. was in the URL, we fetch it
    if (flowId) {
      oryKratosClient
        .getSettingsFlow({ id: String(flowId) })
        .then(({ data }) => setFlow(data))
        .catch(handleFlowError);
      return;
    }

    // Otherwise we initialize it
    oryKratosClient
      .createBrowserSettingsFlow({
        returnTo: returnTo ? String(returnTo) : undefined,
      })
      .then(({ data }) => setFlow(data))
      .catch(handleFlowError);
  }, [flowId, router, router.isReady, returnTo, flow, handleFlowError]);

  const handlePasswordSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!flow) {
      return;
    }

    void router
      // On submission, add the flow ID to the URL but do not navigate. This prevents the user loosing
      // their data when they reload the page.
      .push(`/settings`, { query: { flow: flow.id } }, { shallow: true });

    const { csrf_token } =
      gatherUiNodeValuesFromFlow<"settingsWithPassword">(flow);

    oryKratosClient
      .updateSettingsFlow({
        flow: String(flow.id),
        updateSettingsFlowBody: {
          csrf_token,
          method: "password",
          password: updatedPassword,
        },
      })
      .then(({ data }) => {
        setFlow(data);
        // Redirect the user to the homepage once their password has been updated.
        void router.push("/");
      })
      .catch(handleFlowError)
      .catch((error: AxiosError<SettingsFlow>) => {
        // If the previous handler did not catch the error it's most likely a form validation error
        if (error.response?.status === 400) {
          // Yup, it is!
          setFlow(error.response.data);
          return;
        }

        return Promise.reject(error);
      });
  };

  const passwordInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) && attributes.name === "password",
  );

  return (
    <Container sx={{ pt: 10 }}>
      <Typography variant="h1" gutterBottom>
        Change your password
      </Typography>
      <Box
        component="form"
        onSubmit={handlePasswordSubmit}
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
          label="Password"
          type="password"
          autoComplete="off"
          placeholder="Enter your new password"
          value={updatedPassword}
          onChange={({ target }) => setUpdatedPassword(target.value)}
          error={
            !!passwordInputUiNode?.messages.find(({ type }) => type === "error")
          }
          helperText={passwordInputUiNode?.messages.map(({ id, text }) => (
            <Typography key={id}>{text}</Typography>
          ))}
          required
        />
        <Button type="submit" disabled={!updatedPassword}>
          Change Password
        </Button>
        {flow?.ui.messages?.map(({ text, id }) => (
          <Typography key={id}>{text}</Typography>
        ))}
        {errorMessage ? <Typography>{errorMessage}</Typography> : null}
      </Box>
    </Container>
  );
};

SettingsPage.getLayout = getPlainLayout;

export default SettingsPage;
