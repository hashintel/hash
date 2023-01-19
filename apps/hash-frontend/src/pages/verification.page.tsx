import { TextField } from "@local/design-system";
import { Box, Container, Typography } from "@mui/material";
import {
  UpdateVerificationFlowWithCodeMethodBody,
  VerificationFlow,
} from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import { useRouter } from "next/router";
import { FormEventHandler, useEffect, useMemo, useState } from "react";

import { useLogoutFlow } from "../components/hooks/use-logout-flow";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { Button } from "../shared/ui";
import {
  createFlowErrorHandler,
  gatherUiNodeValuesFromFlow,
  oryKratosClient,
} from "./shared/ory-kratos";

const VerificationPage: NextPageWithLayout = () => {
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

  const [flow, setFlow] = useState<VerificationFlow>();
  const [code, setCode] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleFlowError = useMemo(
    () =>
      createFlowErrorHandler({
        router,
        flowType: "verification",
        setFlow,
        setErrorMessage,
      }),
    [router, setFlow, setErrorMessage],
  );

  // This might be confusing, but we want to show the user an option
  // to sign out if they are performing two-factor authentication!
  const { logout } = useLogoutFlow([aal, refresh]);

  const extractFlowCodeValue = (flowToSearch: VerificationFlow | undefined) => {
    const uiCode = flowToSearch?.ui.nodes.find(
      ({ attributes }) =>
        isUiNodeInputAttributes(attributes) && attributes.name === "code",
    );
    if (uiCode?.attributes && "value" in uiCode.attributes) {
      setCode(String(uiCode.attributes.value));
    }
  };

  useEffect(() => {
    // If the router is not ready yet, or we already have a flow, do nothing.
    if (!router.isReady || flow) {
      return;
    }

    // If ?flow=.. was in the URL, we fetch it
    if (flowId) {
      oryKratosClient
        .getVerificationFlow({ id: String(flowId) })
        .then(({ data }) => {
          setFlow(data);
          extractFlowCodeValue(data);
        })
        .catch(handleFlowError);
      return;
    }

    // Otherwise we initialize it
    oryKratosClient
      .createBrowserVerificationFlow({
        returnTo: returnTo ? String(returnTo) : undefined,
      })
      .then(({ data }) => {
        setFlow(data);
        extractFlowCodeValue(data);
      })
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
    event.stopPropagation();

    if (!flow) {
      return;
    }

    void router
      // On submission, add the flow ID to the URL but do not navigate. This prevents the user loosing
      // their data when they reload the page.
      .push(`/verification`, { query: { flow: flow.id } }, { shallow: true });

    oryKratosClient
      .updateVerificationFlow({
        flow: String(flow.id),
        updateVerificationFlowBody: {
          ...gatherUiNodeValuesFromFlow<"verification">(flow),
          code,
          // @TODO remove this assertion when the UpdateVerificationFlowBody type is updated.
        } as UpdateVerificationFlowWithCodeMethodBody as any,
      })
      .then(({ data }) => {
        // Form submission was successful, show the message to the user!
        setFlow(data);
        void router.push("/");
      })
      .catch(handleFlowError);
  };

  const codeInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) && attributes.name === "code",
  );

  return (
    <Container sx={{ pt: 10 }}>
      <Typography variant="h1" gutterBottom>
        Account verification
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
        <Button type="submit">Verify account</Button>
        {flow?.ui.messages?.map(({ text, id }) => (
          <Typography key={id}>{text}</Typography>
        ))}
        {errorMessage ? <Typography>{errorMessage}</Typography> : null}

        <Button variant="secondary" onClick={logout}>
          Log out
        </Button>
      </Box>
    </Container>
  );
};

VerificationPage.getLayout = getPlainLayout;

export default VerificationPage;
