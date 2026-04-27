import type {
  ErrorAuthenticatorAssuranceLevelNotSatisfied,
  ErrorBrowserLocationChangeRequired,
  NeedsPrivilegedSessionError,
} from "@ory/client";
import type { AxiosError } from "axios";
import { useRouter } from "next/router";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";

import { useAuthInfo } from "./auth-info-context";
import type { Flows } from "./ory-kratos";
import { flowMetadata, uiPathForKratosBrowserRedirect } from "./ory-kratos";

export const useKratosErrorHandler = <K extends keyof Flows>(props: {
  flowType: K;
  setFlow: Dispatch<SetStateAction<Flows[K][0] | undefined>>;
  setErrorMessage: Dispatch<SetStateAction<string | undefined>>;
}) => {
  const { flowType, setFlow, setErrorMessage } = props;

  const { authenticatedUser } = useAuthInfo();
  const router = useRouter();

  const handleFlowError = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (err: AxiosError<any>) => {
      const kratosError = err.response?.data;

      // Kratos embeds `redirect_browser_to` URLs using `SERVE_PUBLIC_BASE_URL`,
      // which points at the frontend origin in our deployments — but the
      // frontend does not serve Kratos's `*/browser` paths. Following the
      // redirect as-is dead-ends on a 404, so rewrite to the matching UI
      // route when we recognise the path; otherwise fall through and follow
      // whatever Kratos asked for.
      const followKratosRedirect = async (redirectUrl: string) => {
        const uiPath = uiPathForKratosBrowserRedirect(redirectUrl);
        await router.replace(uiPath ?? redirectUrl);
      };

      const flowUiPath = flowMetadata[flowType].uiPath;

      if (kratosError) {
        switch (kratosError.error?.id) {
          case "session_aal2_required": {
            // 2FA is enabled and enforced, but user did not perform 2FA yet!
            const { redirect_browser_to } =
              kratosError as ErrorAuthenticatorAssuranceLevelNotSatisfied;

            if (redirect_browser_to) {
              await followKratosRedirect(redirect_browser_to);
            }
            return;
          }
          case "session_already_available":
            // If user is already signed in, redirect them home
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
              await followKratosRedirect(redirect_browser_to);
            }
            return;
          }
          case "self_service_flow_return_to_forbidden":
            // If flow has expired, request a new one
            setErrorMessage("The return_to address is not allowed.");
            setFlow(undefined);
            await router.push(flowUiPath);
            return;
          case "self_service_flow_expired":
            // If flow has expired, request a new one
            setErrorMessage(
              "Your interaction expired, please fill out the form again.",
            );
            setFlow(undefined);
            await router.push(flowUiPath);
            return;
          case "security_csrf_violation":
            // A CSRF violation occurred. Best to just refresh the flow!
            setErrorMessage(
              "A security violation was detected, please fill out the form again.",
            );
            setFlow(undefined);
            await router.push(flowUiPath);
            return;
          case "security_identity_mismatch":
            // The requested item was intended for someone else. Let's request a new flow...
            setFlow(undefined);
            await router.push(flowUiPath);
            return;
          case "browser_location_change_required": {
            // Ory Kratos asked us to point the user to this URL
            const { redirect_browser_to } =
              kratosError as ErrorBrowserLocationChangeRequired;

            if (redirect_browser_to) {
              await followKratosRedirect(redirect_browser_to);
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
            await router.push(flowUiPath);
            return;
          }
          break;
        case 410:
          // The flow expired, let's request a new one.
          setFlow(undefined);
          await router.push(flowUiPath);
          return;
      }

      // We are not able to handle the error? Return it.
      return Promise.reject(err);
    },
    [router, flowType, setErrorMessage, setFlow, authenticatedUser],
  );

  return { handleFlowError };
};
