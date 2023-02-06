import { TextField } from "@hashintel/design-system";
import { Box, Container, Typography } from "@mui/material";
import { RegistrationFlow } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import { AxiosError } from "axios";
import { useRouter } from "next/router";
import {
  FormEventHandler,
  FunctionComponent,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useHashInstance } from "../components/hooks/use-hash-instance";
import { useUpdateAuthenticatedUser } from "../components/hooks/use-update-authenticated-user";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { Button } from "../shared/ui";
import { useAuthInfo } from "./shared/auth-info-context";
import { parseGraphQLError } from "./shared/auth-utils";
import {
  createFlowErrorHandler,
  IdentityTraits,
  mustGetCsrfTokenFromFlow,
  oryKratosClient,
} from "./shared/ory-kratos";
import { AccountSetupForm } from "./signup.page/account-setup-form";

const KratosRegistrationFlowForm: FunctionComponent = () => {
  const router = useRouter();
  const { hashInstance } = useHashInstance();
  const { refetch } = useAuthInfo();

  useEffect(() => {
    // If user registration is disabled, redirect the user to the login page
    if (hashInstance && !hashInstance.userSelfRegistrationIsEnabled) {
      void router.push("/login");
    }
  }, [hashInstance, router]);

  // The "flow" represents a registration process and contains
  // information about the form we need to render (e.g. username + password)
  const [flow, setFlow] = useState<RegistrationFlow>();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const handleFlowError = useMemo(
    () =>
      createFlowErrorHandler({
        router,
        flowType: "registration",
        setFlow,
        setErrorMessage,
      }),
    [router, setFlow, setErrorMessage],
  );

  // Get ?flow=... from the URL
  const { flow: flowId, return_to: returnTo } = router.query;

  // In this effect we either initiate a new registration flow, or we fetch an existing registration flow.
  useEffect(() => {
    // If the router is not ready yet, or we already have a flow, do nothing.
    if (!router.isReady || flow) {
      return;
    }

    // If ?flow=.. was in the URL, we fetch it
    if (flowId) {
      oryKratosClient
        .getRegistrationFlow({ id: String(flowId) })
        // We received the flow - let's use its data and render the form!
        .then(({ data }) => setFlow(data))
        .catch(handleFlowError);
      return;
    }

    // Otherwise we initialize it
    oryKratosClient
      .createBrowserRegistrationFlow({
        returnTo: returnTo ? String(returnTo) : undefined,
      })
      .then(({ data }) => setFlow(data))
      .catch(handleFlowError);
  }, [flowId, router, router.isReady, returnTo, flow, handleFlowError]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    if (!flow || !email || !password) {
      return;
    }

    const csrf_token = mustGetCsrfTokenFromFlow(flow);

    const traits: IdentityTraits = {
      emails: [email],
    };

    void router
      // On submission, add the flow ID to the URL but do not navigate. This prevents the user losing
      // their data when they reload the page.
      .push(`/signup?flow=${flow.id}`, undefined, { shallow: true })
      .then(() =>
        oryKratosClient
          .updateRegistrationFlow({
            flow: flow.id,
            updateRegistrationFlowBody: {
              csrf_token,
              traits,
              password,
              method: "password",
            },
          })
          .then(() => {
            // If the user has successfully logged in, refetch the authenticated user which should transition
            // the user to the next step of the signup flow.
            void refetch();
          })
          .catch(handleFlowError)
          .catch((err: AxiosError<RegistrationFlow>) => {
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
      attributes.name.startsWith("traits.emails"),
  );

  const passwordInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) && attributes.name === "password",
  );

  return (
    <>
      <Typography variant="h1" gutterBottom>
        Create an account
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
          autoComplete="new-password"
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
        <Button type="submit">Sign up with email</Button>
        {flow?.ui.messages?.map(({ text, id }) => (
          <Typography key={id}>{text}</Typography>
        ))}
        {errorMessage ? <Typography>{errorMessage}</Typography> : null}
        <Button variant="secondary" href="/login">
          Already have an account? Log in
        </Button>
      </Box>
    </>
  );
};

const KratosVerificationFlowForm: FunctionComponent = () => {
  return null;
};

const SignupPage: NextPageWithLayout = () => {
  const router = useRouter();

  const { authenticatedUser } = useAuthInfo();

  const [updateAuthenticatedUser, { loading: updateUserLoading }] =
    useUpdateAuthenticatedUser();

  useEffect(() => {
    if (authenticatedUser && authenticatedUser.accountSignupComplete) {
      void router.push("/");
    }
  }, [authenticatedUser, router]);

  const [invitationInfo] = useState<null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleAccountSetupSubmit = async (params: {
    shortname: string;
    preferredName: string;
    responsibility?: string;
  }) => {
    const { shortname, preferredName } = params;

    const { updatedAuthenticatedUser, errors } = await updateAuthenticatedUser({
      shortname,
      preferredName,
    });

    if (errors && errors.length > 0) {
      const { message } = parseGraphQLError([...errors]);
      setErrorMessage(message);
    }

    if (updatedAuthenticatedUser) {
      if (updatedAuthenticatedUser.accountSignupComplete) {
        void router.push("/");
      }

      /** @todo: set responsibility at org if in org invitation flow */
    }
  };

  /** @todo: un-comment this to actually check whether the email is verified */
  // const userHasVerifiedEmail =
  //   authenticatedUser?.emails.find(({ verified }) => verified) !== undefined;
  const userHasVerifiedEmail = true;

  return (
    <Container sx={{ pt: 10 }}>
      {authenticatedUser ? (
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
        userHasVerifiedEmail ? (
          <AccountSetupForm
            onSubmit={handleAccountSetupSubmit}
            loading={updateUserLoading}
            errorMessage={errorMessage}
            email={authenticatedUser.emails[0]!.address}
            invitationInfo={invitationInfo}
          />
        ) : (
          <KratosVerificationFlowForm />
        )
      ) : (
        <KratosRegistrationFlowForm />
      )}
    </Container>
  );
};

SignupPage.getLayout = getPlainLayout;

export default SignupPage;
