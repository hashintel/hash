import { INTEGRATIONS } from "./INTEGRATIONS";

export async function performIntegration(
  state: IntegrationState,
): Promise<void> {
  console.error("Run integration: ", state);
}

export type IntegrationState = {
  integrationName: string;
  /** Just the fields which have been configured */
  configuredFields: Record<
    string,
    {
      currentValue: string | number | undefined;
      updatedAtISO: string;
    }
  >;
  /** This integration is enabled */
  enabled: boolean;
  // /** To indicate if there are any issues with authentication or configuration? */
  // setupIsOkay:
  //   | {
  //       isOkay: true;
  //     }
  //   | {
  //       isOkay: false;
  //       message: string;
  //     };
};

/** Signal to be submitted into the workflow */
export type IntegrationConfigAction =
  | {
      type: "configureFields";
      configureFields: {
        updateAtISO: string;
        fields: Record<string, string | number | undefined>;
      };
    }
  | {
      type: "enable";
      enable: boolean;
    };

/**
 * This is the first step in managing an integration, where we
 * try to look up the integration in our configurations.
 *
 * And set up our initial state.
 */
export async function getInitialIntegrationSetup(
  integrationName: string,
): Promise<IntegrationState> {
  const integrationConfig = INTEGRATIONS[integrationName];

  if (!integrationConfig) {
    return Promise.reject(
      new Error(`Integration not found for name "${integrationName}"`),
    );
  }

  return {
    integrationName: integrationName,
    enabled: false,
    configuredFields: {},
  };
}
