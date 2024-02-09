import {
  ErrorAuthenticatorAssuranceLevelNotSatisfied,
  ErrorBrowserLocationChangeRequired,
  NeedsPrivilegedSessionError,
} from "@ory/client";
import { AxiosError } from "axios";
import { useRouter } from "next/router";
import { Dispatch, SetStateAction, useCallback } from "react";

import { useAuthInfo } from "./auth-info-context";
import { Flows } from "./ory-kratos";

export const useKratosErrorHandler = <S>(props: {
  flowType: keyof Flows;
  setFlow: Dispatch<SetStateAction<S | undefined>>;
  setErrorMessage: Dispatch<SetStateAction<string | undefined>>;
}) => {
  const { flowType, setFlow, setErrorMessage } = props;

  const { authenticatedUser } = useAuthInfo();
  const router = useRouter();

  const handleFlowError = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (err: AxiosError<any>) => {
      const kratosError = err.response?.data;

      if (kratosError) {
        switch (kratosError.error?.id) {
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
            // User is already signed in, if we're in the login flow let's redirect them home!
            if (flowType === "login") {
              if (!authenticatedUser) {
                throw new Error(
                  "The user is authenticated, but the user entity could not be fetched. Check your connection to the backend API, and ensure it is running.",
                );
              }
              await router.push("/");
            }
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
              kratosError as ErrorBrowserLocationChangeRequired;

            if (redirect_browser_to) {
              await router.replace(redirect_browser_to);
            }
            return;
          }
        }
      }

      switch (err.response?.status) {
        case 404:
          if (process.env.NODE_ENV === "development") {
            /**
             * In development a flow may have disappeared because we re-seeded
             * the database. Let's handle this gracefully by resetting the flow.
             */
            setFlow(undefined);
            await router.push(`/${flowType}`);
            return;
          }
          break;
        case 410:
          // The flow expired, let's request a new one.
          setFlow(undefined);
          await router.push(`/${flowType}`);
          return;
      }

      // We are not able to handle the error? Return it.
      return Promise.reject(err);
    },
    [router, flowType, setErrorMessage, setFlow, authenticatedUser],
  );

  return { handleFlowError };
};
