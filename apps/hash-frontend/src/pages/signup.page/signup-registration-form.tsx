import { useLazyQuery } from "@apollo/client";
import { TextField } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import { RegistrationFlow } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import { AxiosError } from "axios";
import { useRouter } from "next/router";
import {
  FormEventHandler,
  FunctionComponent,
  useEffect,
  useState,
} from "react";

import { useHashInstance } from "../../components/hooks/use-hash-instance";
import { HasAccessToHashQuery } from "../../graphql/api-types.gen";
import { hasAccessToHashQuery } from "../../graphql/queries/user.queries";
import { EnvelopeRegularIcon } from "../../shared/icons/envelope-regular-icon";
import { Button, Link } from "../../shared/ui";
import { AuthHeading } from "../shared/auth-heading";
import { useAuthInfo } from "../shared/auth-info-context";
import { AuthPaper } from "../shared/auth-paper";
import {
  IdentityTraits,
  mustGetCsrfTokenFromFlow,
  oryKratosClient,
} from "../shared/ory-kratos";
import { useKratosErrorHandler } from "../shared/use-kratos-flow-error-handler";

export const SignupRegistrationForm: FunctionComponent = () => {
  const router = useRouter();
  const { hashInstance } = useHashInstance();
  const { refetch } = useAuthInfo();

  useEffect(() => {
    // If user registration is disabled, redirect the user to the login page
    if (
      hashInstance &&
      !hashInstance.properties.userSelfRegistrationIsEnabled
    ) {
      void router.push("/signin");
    }
  }, [hashInstance, router]);

  // The "flow" represents a registration process and contains
  // information about the form we need to render (e.g. username + password)
  const [flow, setFlow] = useState<RegistrationFlow>();

  const { email: emailFromQuery, ...restOfQuery } = router.query;

  const initialEmail = typeof emailFromQuery === "string" ? emailFromQuery : "";

  useEffect(() => {
    if (emailFromQuery) {
      void router.push({ query: restOfQuery }, undefined, {
        shallow: true,
      });
    }
  }, [emailFromQuery, restOfQuery, router]);

  const [email, setEmail] = useState<string>(initialEmail);
  const [password, setPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { handleFlowError } = useKratosErrorHandler({
    flowType: "registration",
    setFlow,
    setErrorMessage,
  });

  const [checkUserAccess] =
    useLazyQuery<HasAccessToHashQuery>(hasAccessToHashQuery);

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
          .then(async () => {
            const hasAccessToHash = await checkUserAccess().then(
              ({ data }) => data?.hasAccessToHash,
            );
            if (!hasAccessToHash) {
              void router.push("/");
              return;
            }

            // If the user has successfully logged in and has access to complete signup,
            // refetch the authenticated user which should transition the user to the next step of the signup flow.
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
    <Box position="relative">
      <AuthPaper>
        <AuthHeading>Create an account</AuthHeading>
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            display: "flex",
            flexDirection: "column",
            rowGap: 1.5,
            width: "100%",
          }}
        >
          <TextField
            label="Your personal email"
            type="email"
            autoComplete="email"
            autoFocus={!initialEmail}
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
            inputProps={{ "data-1p-ignore": false }}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            autoFocus={!!initialEmail}
            value={password}
            placeholder="Enter a password"
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
          />
          <Button type="submit" startIcon={<EnvelopeRegularIcon />}>
            Sign up
          </Button>
          {flow?.ui.messages?.map(({ text, id }) => (
            <Typography key={id}>{text}</Typography>
          ))}
          {errorMessage ? <Typography>{errorMessage}</Typography> : null}
        </Box>
        <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
          <Typography
            sx={{
              marginTop: 3.5,
              fontSize: 14,
              color: ({ palette }) => palette.gray[70],
              maxWidth: 300,
              textAlign: "center",
              a: {
                color: ({ palette }) => palette.common.black,
                fontWeight: 600,
                transition: ({ transitions }) => transitions.create("color"),
                "&:hover": {
                  color: ({ palette }) => palette.blue[70],
                },
              },
            }}
          >
            By creating an account you agree to the{" "}
            <Link href="https://hash.ai/legal/terms" openInNew noLinkStyle>
              terms of use
            </Link>{" "}
            and{" "}
            <Link href="https://hash.ai/legal/privacy" openInNew noLinkStyle>
              privacy policy
            </Link>
          </Typography>
        </Box>
      </AuthPaper>
      <Box
        sx={{
          position: {
            xs: "relative",
            md: "absolute",
          },
          display: "flex",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <Typography
          sx={{
            marginTop: 3.75,
            textAlign: "center",
            fontWeight: 600,
            a: {
              color: ({ palette }) => palette.blue[70],
              transition: ({ transitions }) => transitions.create("color"),
              "&:hover": {
                color: ({ palette }) => palette.blue[90],
              },
            },
          }}
        >
          Already have an account?{" "}
          <Link href="/signin" noLinkStyle>
            Sign in
          </Link>
        </Typography>
      </Box>
    </Box>
  );
};
