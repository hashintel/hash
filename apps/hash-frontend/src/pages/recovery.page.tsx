import { TextField } from "@hashintel/design-system";
import { Box, Collapse, Container, Typography } from "@mui/material";
import { RecoveryFlow } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import { useRouter } from "next/router";
import { FormEventHandler, useEffect, useMemo, useState } from "react";

import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { Button } from "../shared/ui";
import {
  createFlowErrorHandler,
  gatherUiNodeValuesFromFlow,
  oryKratosClient,
} from "./shared/ory-kratos";

const extractFlowEmailValue = (flowToSearch: RecoveryFlow | undefined) => {
  const uiCode = flowToSearch?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) && attributes.name === "email",
  );
  if (uiCode?.attributes && "value" in uiCode.attributes) {
    return String(uiCode.attributes.value);
  }
};

const extractFlowCodeValue = (flowToSearch: RecoveryFlow | undefined) => {
  const uiCode = flowToSearch?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) && attributes.name === "code",
  );
  if (uiCode?.attributes && "value" in uiCode.attributes) {
    return String(uiCode.attributes.value);
  }
};

const RecoveryPage: NextPageWithLayout = () => {
  // Get ?flow=... from the URL
  const router = useRouter();

  const { return_to: returnTo, flow: flowId } = router.query;

  const [flow, setFlow] = useState<RecoveryFlow>();
  const [email, setEmail] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleFlowError = useMemo(
    () =>
      createFlowErrorHandler({
        router,
        flowType: "recovery",
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
        .getRecoveryFlow({ id: String(flowId) })
        .then(({ data }) => {
          const flowEmail = extractFlowEmailValue(data);
          const flowCode = extractFlowCodeValue(data);
          setFlow(data);
          setEmail(flowEmail ?? "");
          setCode(flowCode ?? "");
        })
        .catch(handleFlowError);
      return;
    }

    // Otherwise we initialize it
    oryKratosClient
      .createBrowserRecoveryFlow({
        returnTo: returnTo ? String(returnTo) : undefined,
      })
      .then(({ data }) => {
        setFlow(data);

        const initialEmail =
          typeof router.query.email === "string"
            ? router.query.email
            : undefined;

        setEmail(initialEmail ?? "");
        setCode("");
      })
      .catch(handleFlowError);
  }, [flowId, router, router.isReady, returnTo, flow, handleFlowError]);

  const handleSubmitEmail: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!flow) {
      return;
    }

    void router
      // On submission, add the flow ID to the URL but do not navigate. This prevents the user losing
      // their data when they reload the page.
      .replace(`/recovery`, { query: { flow: flow.id } }, { shallow: true });

    const { csrf_token } = gatherUiNodeValuesFromFlow<"recovery">(flow);

    oryKratosClient
      .updateRecoveryFlow({
        flow: String(flow.id),
        updateRecoveryFlowBody: { csrf_token, method: "code", email },
      })
      .then(({ data }) => setFlow(data))
      .catch(handleFlowError);
  };

  const handleSubmitCode: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!flow) {
      return;
    }

    void router
      // On submission, add the flow ID to the URL but do not navigate. This prevents the user losing
      // their data when they reload the page.
      .replace(`/recovery`, { query: { flow: flow.id } }, { shallow: true });

    const { csrf_token } = gatherUiNodeValuesFromFlow<"recovery">(flow);

    oryKratosClient
      .updateRecoveryFlow({
        flow: String(flow.id),
        updateRecoveryFlowBody: { csrf_token, method: "code", code },
      })
      // Note that the user is automatically redirected to the settings page
      // where they can update their password.
      .then(({ data }) => setFlow(data))
      .catch(handleFlowError);
  };

  const resetFlow = () => {
    // Remove the flow Id from the query params
    void router
      .replace(`/recovery`, { query: {} }, { shallow: true })
      .then(() => {
        setFlow(undefined);
        setEmail("");
        setCode("");
      });
  };

  const emailInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) && attributes.name === "email",
  );

  const codeInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) && attributes.name === "code",
  );

  const hasSubmittedEmail = flow && flow.state !== "choose_method";

  return (
    <Container sx={{ pt: 10 }}>
      <Typography variant="h1" gutterBottom>
        Account Recovery
      </Typography>
      <Box
        component="form"
        onSubmit={handleSubmitEmail}
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
          disabled={hasSubmittedEmail}
          required
        />
        <Collapse in={!hasSubmittedEmail} sx={{ width: "100%" }}>
          <Button
            type="submit"
            disabled={hasSubmittedEmail}
            sx={{ width: "100%" }}
          >
            Recover account
          </Button>
        </Collapse>
      </Box>
      <Collapse in={hasSubmittedEmail}>
        <Box
          component="form"
          onSubmit={handleSubmitCode}
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
            label="Verification code"
            type="text"
            autoComplete="off"
            placeholder="Enter your verification code"
            value={code}
            onChange={({ target }) => setCode(target.value)}
            error={
              !!codeInputUiNode?.messages.find(({ type }) => type === "error")
            }
            helperText={codeInputUiNode?.messages.map(({ id, text }) => (
              <Typography key={id}>{text}</Typography>
            ))}
            required
          />
          <Button type="submit" disabled={!code}>
            Submit Code
          </Button>
          <Button variant="secondary" onClick={resetFlow}>
            Change Email Address
          </Button>
        </Box>
      </Collapse>
      <Box maxWidth={500} mt={1}>
        {flow?.ui.messages?.map(({ text, id }) => (
          <Typography key={id}>{text}</Typography>
        ))}
        {errorMessage ? <Typography>{errorMessage}</Typography> : null}
      </Box>
    </Container>
  );
};

RecoveryPage.getLayout = getPlainLayout;

export default RecoveryPage;
