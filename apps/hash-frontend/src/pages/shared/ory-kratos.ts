import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import type {
  Configuration,
  FrontendApi,
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
 * A helper type representing the traits defined by the kratos identity schema at `apps/hash-external-services/kratos/identity.schema.json`.
 */
export interface IdentityTraits {
  emails: string[];
}

export interface Flows {
  login: [LoginFlow, UpdateLoginFlowBody];
  recovery: [RecoveryFlow, UpdateRecoveryFlowBody];
  registration: [RegistrationFlow, UpdateRegistrationFlowBody];
  settings: [SettingsFlow, UpdateSettingsFlowBody];
  settingsWithPassword: [SettingsFlow, UpdateSettingsFlowWithPasswordMethod];
  verification: [VerificationFlow, UpdateVerificationFlowBody];
}

export type FlowNames = keyof Flows;
export type FlowValues = Flows[FlowNames][0];

export const gatherUiNodeValuesFromFlow = <T extends FlowNames>(
  flow: FlowValues,
): Flows[T][1] =>
  flow.ui.nodes
    .map(({ attributes }) => attributes)
    .filter((attributes): attributes is UiNodeInputAttributes =>
      isUiNodeInputAttributes(attributes),
    )
    .reduce<Flows[T][1]>((accumulator, attributes) => {
      const { name, value } = attributes;

      return { ...accumulator, [name]: value };
    }, {});

const maybeGetCsrfTokenFromFlow = (flow: FlowValues) =>
  flow.ui.nodes
    .map(({ attributes }) => attributes)
    .filter((attributes): attributes is UiNodeInputAttributes =>
      isUiNodeInputAttributes(attributes),
    )
    .find(({ name }) => name === "csrf_token")?.value;

export const mustGetCsrfTokenFromFlow = (flow: FlowValues): string => {
  const csrf_token = maybeGetCsrfTokenFromFlow(flow);

  if (!csrf_token) {
    throw new Error("CSRF token not found in flow");
  }

  return csrf_token;
};
