import { Configuration, V0alpha2Api, SelfServiceError } from "@ory/client";
import { AxiosError } from "axios";
import { NextRouter } from "next/router";
import { Dispatch, SetStateAction } from "react";

export const oryKratosClient = new V0alpha2Api(
  new Configuration({
    /**
     * Directly connecting to kratos (using "http://127.0.0.1:4433") would prevent the
     * CRSF token from being set as an HTTP-Cookie, because the browser cannot send or
     * receive cookies via the browser `fetch` method.
     *
     * Therefore requests to the ory kratos public endpoing are made on the server in a
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

    switch (err.response?.data.error?.id) {
      case "session_aal2_required":
        // 2FA is enabled and enforced, but user did not perform 2fa yet!
        window.location.href = err.response?.data.redirect_browser_to;
        return;
      case "session_already_available":
        // User is already signed in, let's redirect them home!
        await router.push("/");
        return;
      case "session_refresh_required":
        // We need to re-authenticate to perform this action
        window.location.href = err.response?.data.redirect_browser_to;
        return;
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
      case "browser_location_change_required":
        // Ory Kratos asked us to point the user to this URL.
        window.location.href = err.response.data.redirect_browser_to;
        return;
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
