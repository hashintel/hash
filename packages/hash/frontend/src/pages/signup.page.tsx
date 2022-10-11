import {
  useEffect,
  FormEventHandler,
  useState,
  useMemo,
  FunctionComponent,
} from "react";
import { useRouter } from "next/router";
import { SelfServiceRegistrationFlow } from "@ory/client";
import { useMutation } from "@apollo/client";
import { Typography, Container, Box } from "@mui/material";
import { TextField } from "@hashintel/hash-design-system";
import { AxiosError } from "axios";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import {
  createFlowErrorHandler,
  mustGetCsrfTokenFromFlow,
  IdentityTraits,
  oryKratosClient,
} from "./shared/ory-kratos";
import { Button } from "../shared/ui";
import { useUser } from "../components/hooks/useUser";
import { AccountSetupForm } from "./signup.page/account-setup-form";

import {
  UpdateUserMutation,
  UpdateUserMutationVariables,
} from "../graphql/apiTypes.gen";
import { updateUser as updateUserMutation } from "../graphql/queries/user.queries";
import { parseGraphQLError } from "./shared/auth-utils";

const KratosRegistrationFlowForm: FunctionComponent = () => {
  const router = useRouter();

  // The "flow" represents a registration process and contains
  // information about the form we need to render (e.g. username + password)
  const [flow, setFlow] = useState<SelfServiceRegistrationFlow>();

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
        .getSelfServiceRegistrationFlow(String(flowId))
        // We received the flow - let's use its data and render the form!
        .then(({ data }) => setFlow(data))
        .catch(handleFlowError);
      return;
    }

    // Otherwise we initialize it
    oryKratosClient
      .initializeSelfServiceRegistrationFlowForBrowsers(
        returnTo ? String(returnTo) : undefined,
      )
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
          .submitSelfServiceRegistrationFlow(String(flow?.id), {
            csrf_token,
            traits,
            password,
            method: "password",
          })
          .then(({ data }) => {
            // If we ended up here, it means we are successfully signed up!
            //
            // You can do cool stuff here, like having access to the identity which just signed up:
            const { identity: _kratosIdentity } = data;

            // For now however we just want to redirect home!
            return router.push(flow?.return_to ?? "/");
          })
          .catch(handleFlowError)
          .catch((err: AxiosError<SelfServiceRegistrationFlow>) => {
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

  const { user, kratosSession: _kratosSession, refetch } = useUser();

  const [invitationInfo] = useState<null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  const [updateUser, { loading: updateUserLoading }] = useMutation<
    UpdateUserMutation,
    UpdateUserMutationVariables
  >(updateUserMutation, {
    onCompleted: async ({ updateUser: updatedUser }) => {
      await refetch();

      if (updatedUser.accountSignupComplete) {
        void router.push("/");
      }
    },
    onError: ({ graphQLErrors }) => {
      if (!graphQLErrors.length) {
        return;
      }
      const { message } = parseGraphQLError([...graphQLErrors]);
      setErrorMessage(message);
    },
  });

  const handleAccountSetupSubmit =
    (userEntityId: string) =>
    async (params: {
      shortname: string;
      preferredName: string;
      responsibility?: string;
    }) => {
      const { shortname, preferredName } = params;

      await updateUser({
        variables: {
          userEntityId,
          properties: { shortname, preferredName },
        },
      });

      /** @todo: set responsibility at org if in org invitation flow */
    };

  /** @todo: un-comment this to actually check whether the email is verified */
  // const userHasVerifiedEmail =
  //   kratosSession?.identity.verifiable_addresses?.find(
  //     ({ verified }) => verified,
  //   ) !== undefined;
  const userHasVerifiedEmail = true;

  return (
    <Container sx={{ pt: 10 }}>
      {user ? (
        userHasVerifiedEmail ? (
          <AccountSetupForm
            onSubmit={handleAccountSetupSubmit(user.entityId)}
            loading={updateUserLoading}
            errorMessage={errorMessage}
            email={user.emails[0]!.address}
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
