import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import type {
  LoginFlow,
  RecoveryFlow,
  RegistrationFlow,
  SettingsFlow,
  UiNodeInputAttributes,
  UpdateLoginFlowBody,
  UpdateRecoveryFlowBody,
  UpdateRegistrationFlowBody,
  UpdateSettingsFlowBody,
  UpdateSettingsFlowWithPasswordMethod,
  UpdateVerificationFlowBody,
  VerificationFlow,
} from "@ory/client";
import { Configuration, FrontendApi } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";

export const oryKratosClient = new FrontendApi(
  new Configuration({
    basePath: `${apiOrigin}/auth`,
    baseOptions: {
      withCredentials: true,
    },
  }),
);

/**
 * A helper type representing the traits defined by the kratos identity schema at `apps/hash-external-services/kratos/identity.schema.json`
 */
export type IdentityTraits = {
  emails: string[];
};

export type Flows = {
  login: [LoginFlow, UpdateLoginFlowBody];
  recovery: [RecoveryFlow, UpdateRecoveryFlowBody];
  registration: [RegistrationFlow, UpdateRegistrationFlowBody];
  settings: [SettingsFlow, UpdateSettingsFlowBody];
  settingsWithPassword: [SettingsFlow, UpdateSettingsFlowWithPasswordMethod];
  verification: [VerificationFlow, UpdateVerificationFlowBody];
};

export type FlowNames = keyof Flows;
export type FlowValues = Flows[FlowNames][0];

/**
 * Static metadata for each self-service flow:
 *
 * - `uiPath`: the frontend route that renders the flow. Pushing to this path
 *   when a flow expires, was intended for a different identity, etc. drops
 *   the user back into a fresh flow of the right type.
 * - `kratosBrowserPath`: the Kratos-native `/self-service/<flow>/browser`
 *   endpoint Kratos embeds in `redirect_browser_to` URLs (via the
 *   `SERVE_PUBLIC_BASE_URL` setting).
 *   Because that base URL points at the frontend origin but the frontend
 *   does not serve these paths, redirects need to be rewritten to the
 *   matching `uiPath` to avoid dead-ending on a 404.
 */
const _flowMetadata = {
  login: {
    uiPath: "/signin",
    kratosBrowserPath: "/self-service/login/browser",
  },
  recovery: {
    uiPath: "/recovery",
    kratosBrowserPath: "/self-service/recovery/browser",
  },
  registration: {
    uiPath: "/signup",
    kratosBrowserPath: "/self-service/registration/browser",
  },
  settings: {
    uiPath: "/settings/security",
    kratosBrowserPath: "/self-service/settings/browser",
  },
  verification: {
    uiPath: "/verification",
    kratosBrowserPath: "/self-service/verification/browser",
  },
} as const;

// `settingsWithPassword` shares routes with `settings` — the split is
// purely a TypeScript-level distinction over the submit-body shape.
export const flowMetadata = {
  ..._flowMetadata,
  settingsWithPassword: _flowMetadata.settings,
} as const satisfies Record<
  FlowNames,
  { uiPath: string; kratosBrowserPath: string }
>;

/**
 * Look up the UI route for a `redirect_browser_to` URL that points at a
 * Kratos self-service browser endpoint. Returns `undefined` if the URL is
 * not a known Kratos browser path, letting the caller fall through to
 * following the redirect as-is.
 *
 * Query parameters are forwarded to the UI route; URL fragments are not
 * (Kratos doesn't use them, and the frontend routes don't read them).
 */
export const uiPathForKratosBrowserRedirect = (
  redirectUrl: string,
): string | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(redirectUrl);
  } catch {
    // eslint-disable-next-line no-console
    console.warn("Malformed Kratos redirect URL:", redirectUrl);
    return undefined;
  }

  const match = Object.values(flowMetadata).find(
    ({ kratosBrowserPath }) => kratosBrowserPath === parsed.pathname,
  );

  return match ? `${match.uiPath}${parsed.search}` : undefined;
};

export const gatherUiNodeValuesFromFlow = <T extends FlowNames>(
  flow: Flows[T][0],
): Flows[T][1] =>
  flow.ui.nodes
    .map(({ attributes }) => attributes)
    .filter(
      (
        attrs,
      ): attrs is UiNodeInputAttributes & {
        node_type: "input";
      } => isUiNodeInputAttributes(attrs),
    )
    .reduce(
      (acc, attributes) => {
        const { name, value } = attributes;
        return { ...acc, [name]: value };
      },
      {} as Flows[T][1],
    );

const maybeGetCsrfTokenFromFlow = (flow: FlowValues) =>
  flow.ui.nodes
    .map(({ attributes }) => attributes)
    .filter(
      (
        attrs,
      ): attrs is UiNodeInputAttributes & {
        node_type: "input";
      } => isUiNodeInputAttributes(attrs),
    )
    .find(({ name }) => name === "csrf_token")?.value;

export const mustGetCsrfTokenFromFlow = (flow: FlowValues): string => {
  const csrf_token = maybeGetCsrfTokenFromFlow(flow);

  if (!csrf_token) {
    throw new Error("CSRF token not found in flow");
  }

  return csrf_token;
};
