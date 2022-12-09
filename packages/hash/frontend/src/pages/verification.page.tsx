import { useRouter } from "next/router";
import { useEffect, FormEventHandler, useState, useMemo } from "react";
import { VerificationFlow } from "@ory/client";
import { Typography, Container, Box } from "@mui/material";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import {
  createFlowErrorHandler,
  gatherUiNodeValuesFromFlow,
  oryKratosClient,
} from "./shared/ory-kratos";
import { Button } from "../shared/ui";
import { useLogoutFlow } from "../components/hooks/useLogoutFlow";

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
      .push(`/verification?flow=${flow?.id}`, undefined, { shallow: true });

    oryKratosClient
      .updateVerificationFlow({
        flow: String(flow?.id),
        updateVerificationFlowBody:
          gatherUiNodeValuesFromFlow<"verification">(flow),
      })
      .then(({ data }) => {
        // Form submission was successful, show the message to the user!
        setFlow(data);
        void router.push("/");
      })
      .catch(handleFlowError);
  };

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
        <Button type="submit">Verify account</Button>
        {flow?.ui?.messages?.map(({ text, id }) => (
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
