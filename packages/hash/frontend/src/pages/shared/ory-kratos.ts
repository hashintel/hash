import {
  Configuration,
  V0alpha2Api,
  SelfServiceError,
  SelfServiceLoginFlow,
  SelfServiceRegistrationFlow,
  SelfServiceBrowserLocationChangeRequiredError,
  ErrorAuthenticatorAssuranceLevelNotSatisfied,
  NeedsPrivilegedSessionError,
} from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import { AxiosError } from "axios";
import { NextRouter } from "next/router";
import { Dispatch, SetStateAction } from "react";

type SelfServiceFlow = SelfServiceLoginFlow | SelfServiceRegistrationFlow;

export const oryKratosClient = new V0alpha2Api(
  new Configuration({
    /**
     * Directly connecting to kratos (using "http://127.0.0.1:4433") would prevent the
     * CRSF token from being set as an HTTP-Cookie, because the browser cannot send or
     * receive cookies via the browser `fetch` method unless:
     *  1. `credentials: "include"` is set in the HTTP request header
     *  2. the correct CORS origin is configured in the kratos server
     *
     * Therefore requests to the ory kratos public endpoint are made on the server in a
     * Next.js API handler.
     */
    basePath: "/api/ory",
  }),
);

/**
 * A helper type representing the traits defined by the kratos identity schema at `packages/hash/external-services/kratos/identity.schema.json`
 */
export type IdentityTraits = {
  emails: string[];
};

/**
 * A helper function that creates an error handling function for some common errors
 * that may occur when fetching a flow.
 */
export const createFlowErrorHandler =
  <S>(params: {
    router: NextRouter;
    flowType:
      | "login"
      | "registration"
      | "settings"
      | "recovery"
      | "verification";
    setFlow: Dispatch<SetStateAction<S | undefined>>;
    setErrorMessage: Dispatch<SetStateAction<string | undefined>>;
  }) =>
  async (err: AxiosError<SelfServiceError>) => {
    const { setErrorMessage, setFlow, router, flowType } = params;

    const kratosError = err.response?.data;

    if (kratosError) {
      switch ((kratosError.error as any | undefined)?.id) {
        case "session_aal2_required": {
          // 2FA is enabled and enforced, but user did not perform 2FA yet!
          const { redirect_browser_to } =
            kratosError as ErrorAuthenticatorAssuranceLevelNotSatisfied;

          if (redirect_browser_to) {
            await router.replace(redirect_browser_to);
          }
          return;
        }
        case "session_already_available":
          // User is already signed in, let's redirect them home!
          await router.push("/");
          return;
        case "session_refresh_required": {
          // We need to re-authenticate to perform this action
          const { redirect_browser_to } =
            kratosError as NeedsPrivilegedSessionError;

          if (redirect_browser_to) {
            await router.replace(redirect_browser_to);
          }
          return;
        }
        case "self_service_flow_return_to_forbidden":
          // The flow expired, let's request a new one.
          setErrorMessage("The return_to address is not allowed.");
          setFlow(undefined);
          await router.push(`/${flowType}`);
          return;
        case "self_service_flow_expired":
          // The flow expired, let's request a new one.
          setErrorMessage(
            "Your interaction expired, please fill out the form again.",
          );
          setFlow(undefined);
          await router.push(`/${flowType}`);
          return;
        case "security_csrf_violation":
          // A CSRF violation occurred. Best to just refresh the flow!
          setErrorMessage(
            "A security violation was detected, please fill out the form again.",
          );
          setFlow(undefined);
          await router.push(`/${flowType}`);
          return;
        case "security_identity_mismatch":
          // The requested item was intended for someone else. Let's request a new flow...
          setFlow(undefined);
          await router.push(`/${flowType}`);
          return;
        case "browser_location_change_required": {
          // Ory Kratos asked us to point the user to this URL.
          const { redirect_browser_to } =
            kratosError as SelfServiceBrowserLocationChangeRequiredError;

          if (redirect_browser_to) {
            await router.replace(redirect_browser_to);
          }
          return;
        }
      }
    }

    switch (err.response?.status) {
      case 410:
        // The flow expired, let's request a new one.
        setFlow(undefined);
        await router.push(`/${flowType}`);
        return;
    }

    // We are not able to handle the error? Return it.
    return Promise.reject(err);
  };

const maybeGetCsrfTokenFromFlow = (flow: SelfServiceFlow) =>
  flow.ui.nodes
    .map(({ attributes }) => attributes)
    .filter(isUiNodeInputAttributes)
    .find(({ name }) => name === "csrf_token")?.value;

export const mustGetCsrfTokenFromFlow = (flow: SelfServiceFlow): string => {
  const csrf_token = maybeGetCsrfTokenFromFlow(flow);

  if (!csrf_token) {
    throw new Error("CSRF token not found in flow");
  }

  return csrf_token;
};
