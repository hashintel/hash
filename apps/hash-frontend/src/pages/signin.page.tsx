import type { WebId } from "@blockprotocol/type-system";
import { TextField } from "@hashintel/design-system";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { Box, buttonClasses, styled, Typography } from "@mui/material";
import type { LoginFlow } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import type { AxiosError } from "axios";
import { useRouter } from "next/router";
import type { FormEventHandler } from "react";
import { useContext, useEffect, useMemo, useState } from "react";

import { useHashInstance } from "../components/hooks/use-hash-instance";
import { ArrowRightToBracketRegularIcon } from "../shared/icons/arrow-right-to-bracket-regular-icon";
import { ArrowTurnDownLeftRegularIcon } from "../shared/icons/arrow-turn-down-left-regular-icon";
import type { NextPageWithLayout } from "../shared/layout";
import { getPlainLayout } from "../shared/layout";
import type { ButtonProps } from "../shared/ui";
import { Button, Link } from "../shared/ui";
import { AuthHeading } from "./shared/auth-heading";
import { useAuthInfo } from "./shared/auth-info-context";
import { AuthLayout } from "./shared/auth-layout";
import { AuthPaper } from "./shared/auth-paper";
import { mustGetCsrfTokenFromFlow, oryKratosClient } from "./shared/ory-kratos";
import { useKratosErrorHandler } from "./shared/use-kratos-flow-error-handler";
import { WorkspaceContext } from "./shared/workspace-context";

const SignupButton = styled((props: ButtonProps) => (
  <Button variant="secondary" size="small" {...props} />
))(({ theme }) => ({
  color: theme.palette.common.white,
  background: "#1F2933",
  transition: theme.transitions.create(["background", "box-shadow"]),
  borderColor: "#283644",
  boxShadow: theme.shadows[3],
  "&:hover": {
    background: "#283644",
    boxShadow: theme.shadows[4],
    "&:before": {
      opacity: 0,
    },
  },
}));

const SigninPage: NextPageWithLayout = () => {
  // Get ?flow=... from the URL
  const router = useRouter();
  const { aal2Required, refetch } = useAuthInfo();
  const { updateActiveWorkspaceWebId } = useContext(WorkspaceContext);
  const { hashInstance } = useHashInstance();

  const {
    flow: flowId,
    // Refresh means we want to refresh the session. This is needed, for example, when we want to update the password
    // of a user.
    refresh,
    login_challenge: loginChallenge,
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
  const [totpCode, setTotpCode] = useState<string>("");
  const [lookupSecret, setLookupSecret] = useState<string>("");
  const [useLookupSecretInput, setUseLookupSecretInput] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const { handleFlowError } = useKratosErrorHandler({
    flowType: "login",
    setFlow,
    setErrorMessage,
  });

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
        loginChallenge:
          typeof loginChallenge === "string" ? loginChallenge : undefined,
      })
      .then(({ data }) => setFlow(data))
      .catch(handleFlowError);
  }, [
    flowId,
    loginChallenge,
    router,
    router.isReady,
    aal,
    refresh,
    flow,
    handleFlowError,
  ]);

  const isAal2Flow = useMemo(
    () =>
      flow?.requested_aal === "aal2" ||
      flow?.ui.nodes.some(({ group }) =>
        ["totp", "lookup_secret"].includes(group),
      ) === true,
    [flow],
  );

  const emailInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) &&
      attributes.name === "traits.emails",
  );

  const passwordInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) && attributes.name === "password",
  );

  const totpInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) && attributes.name === "totp_code",
  );

  const lookupSecretInputUiNode = flow?.ui.nodes.find(
    ({ attributes }) =>
      isUiNodeInputAttributes(attributes) &&
      attributes.name === "lookup_secret",
  );

  const handleValidationError = (err: AxiosError<LoginFlow>) => {
    if (err.response?.status === 400) {
      setFlow(err.response.data);
      return;
    }

    if (err.response?.status === 429) {
      setErrorMessage("Too many attempts, please try again shortly.");
      return;
    }

    return Promise.reject(err);
  };

  const completeSignin = async (activeFlow: LoginFlow) => {
    const { authenticatedUser } = await refetch();

    if (!authenticatedUser) {
      if (aal2Required) {
        void router.push("/signin?aal=aal2");
        return;
      }

      throw new Error("Could not fetch authenticated user after logging in.");
    }

    updateActiveWorkspaceWebId(authenticatedUser.accountId as WebId);
    void router.push(returnTo ?? activeFlow.return_to ?? "/");
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    if (!flow) {
      throw new Error(
        "No sign in flow available – please try clearing your cookies.",
      );
    }

    if (!isAal2Flow && (!email || !password)) {
      return;
    }

    if (isAal2Flow && !useLookupSecretInput && !totpCode) {
      return;
    }

    if (isAal2Flow && useLookupSecretInput && !lookupSecret) {
      return;
    }

    const csrf_token = mustGetCsrfTokenFromFlow(flow);

    const updateLoginFlowBody = isAal2Flow
      ? useLookupSecretInput
        ? {
            csrf_token,
            method: "lookup_secret" as const,
            lookup_secret: lookupSecret,
          }
        : {
            csrf_token,
            method: "totp" as const,
            totp_code: totpCode,
          }
      : {
          csrf_token,
          method: "password" as const,
          identifier: email,
          password,
        };

    setErrorMessage(undefined);

    void router
      // On submission, add the flow ID to the URL but do not navigate. This prevents the user losing
      // their data when they reload the page.
      .push(`/signin?flow=${flow.id}`, undefined, { shallow: true })
      .then(() =>
        oryKratosClient
          .updateLoginFlow({
            flow: String(flow.id),
            updateLoginFlowBody,
          })
          // We logged in successfully! Let's redirect the user.
          .then(async ({ data: loginResponse }) => {
            if (!isAal2Flow) {
              const redirectAction = loginResponse.continue_with?.find(
                (
                  action,
                ): action is {
                  action: "redirect_browser_to";
                  redirect_browser_to: string;
                } =>
                  action.action === "redirect_browser_to" &&
                  "redirect_browser_to" in action &&
                  typeof action.redirect_browser_to === "string",
              );

              if (redirectAction?.redirect_browser_to) {
                void router.push(redirectAction.redirect_browser_to);
                return;
              }

              try {
                await oryKratosClient.toSession();
              } catch (error) {
                const maybeAal2Error = error as AxiosError<{
                  redirect_browser_to?: string;
                }>;

                if (maybeAal2Error.response?.status === 403) {
                  const redirectTo =
                    maybeAal2Error.response.data.redirect_browser_to ??
                    "/signin?aal=aal2";

                  void router.push(redirectTo);
                  return;
                }

                throw error;
              }
            }

            await completeSignin(flow);
          })
          .catch(handleFlowError)
          .catch(handleValidationError),
      );
  };

  const { userSelfRegistrationIsEnabled } = hashInstance?.properties ?? {};

  return (
    <AuthLayout
      headerEndAdornment={
        <SignupButton
          endIcon={<ArrowRightToBracketRegularIcon />}
          href="/signup"
          disabled={!userSelfRegistrationIsEnabled}
        >
          Sign up
        </SignupButton>
      }
    >
      <Box
        sx={{
          width: "100%",
          display: "flex",
          gap: 5.75,
          justifyContent: "center",
          alignItems: "center",
          flexDirection: {
            xs: "column",
            md: "row",
          },
        }}
      >
        <AuthPaper
          sx={{
            flexGrow: 1,
            maxWidth: 600,
          }}
        >
          <AuthHeading>
            {isAal2Flow
              ? "Enter your authentication code"
              : "Sign in to your account"}
          </AuthHeading>
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
            {isAal2Flow ? (
              <>
                <Typography sx={{ color: ({ palette }) => palette.gray[70] }}>
                  Open your authenticator app and enter the code to continue.
                </Typography>
                <TextField
                  label={
                    useLookupSecretInput ? "Backup code" : "Authenticator code"
                  }
                  type="text"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder={
                    useLookupSecretInput
                      ? "Enter your backup code"
                      : "Enter your authentication code"
                  }
                  value={useLookupSecretInput ? lookupSecret : totpCode}
                  inputProps={{
                    "data-1p-ignore": false,
                    "data-testid": "signin-aal2-code-input",
                  }}
                  onChange={({ target }) => {
                    if (useLookupSecretInput) {
                      setLookupSecret(target.value);
                    } else {
                      setTotpCode(target.value);
                    }
                  }}
                  error={
                    !!(useLookupSecretInput
                      ? lookupSecretInputUiNode?.messages.find(
                          ({ type }) => type === "error",
                        )
                      : totpInputUiNode?.messages.find(
                          ({ type }) => type === "error",
                        ))
                  }
                  helperText={
                    useLookupSecretInput
                      ? lookupSecretInputUiNode?.messages.map(
                          ({ id, text }) => (
                            <Typography key={id}>{text}</Typography>
                          ),
                        )
                      : totpInputUiNode?.messages.map(({ id, text }) => (
                          <Typography key={id}>{text}</Typography>
                        ))
                  }
                  required
                />
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                  <Button type="submit" data-testid="signin-aal2-submit-button">
                    Verify and continue
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    data-testid="signin-aal2-toggle-method-button"
                    onClick={() => {
                      setUseLookupSecretInput((currentValue) => !currentValue);
                      setErrorMessage(undefined);
                    }}
                  >
                    {useLookupSecretInput
                      ? "Use an authenticator code instead"
                      : "Use a backup code instead"}
                  </Button>
                </Box>
              </>
            ) : (
              <>
                <TextField
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="Enter your email address"
                  value={email}
                  onChange={({ target }) => setEmail(target.value)}
                  error={
                    !!emailInputUiNode?.messages.find(
                      ({ type }) => type === "error",
                    )
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
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={({ target }) => setPassword(target.value)}
                  error={
                    !!passwordInputUiNode?.messages.find(
                      ({ type }) => type === "error",
                    )
                  }
                  helperText={passwordInputUiNode?.messages.map(
                    ({ id, text }) => <Typography key={id}>{text}</Typography>,
                  )}
                  required
                  inputProps={{ "data-1p-ignore": false }}
                  // eslint-disable-next-line react/jsx-no-duplicate-props
                  InputProps={{
                    endAdornment: (
                      <Button
                        type="submit"
                        variant="tertiary_quiet"
                        sx={{
                          /** @todo: replace this with a blue from the design system */
                          color: "#2482FF",
                          "&:hover": {
                            color: "#2482FF",
                          },
                          [` .${buttonClasses.endIcon} svg`]: {
                            color: "#2482FF",
                          },
                        }}
                        endIcon={<ArrowTurnDownLeftRegularIcon />}
                      >
                        Submit
                      </Button>
                    ),
                  }}
                />
                <Link
                  href={`/recovery${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                  sx={{
                    color: ({ palette }) => palette.gray[70],
                    fontSize: 14,
                    textDecorationColor: "currentcolor",
                    "&:hover": {
                      color: ({ palette }) => palette.gray[90],
                    },
                  }}
                >
                  Forgot your password?
                </Link>
              </>
            )}
            {errorMessage ? (
              <Typography
                sx={{ color: ({ palette }) => palette.red[70] }}
                variant="smallTextParagraphs"
              >
                {errorMessage}
              </Typography>
            ) : null}
            {flow?.ui.messages?.map(({ text, id }) => (
              <Typography key={id}>{text}</Typography>
            ))}
          </Box>
        </AuthPaper>
        <Box>
          <Typography gutterBottom>
            <strong>No account?</strong> No problem.
          </Typography>
          <Button href="/signup" disabled={!userSelfRegistrationIsEnabled}>
            Create a free account
          </Button>
        </Box>
      </Box>
    </AuthLayout>
  );
};

SigninPage.getLayout = getPlainLayout;

export default SigninPage;
