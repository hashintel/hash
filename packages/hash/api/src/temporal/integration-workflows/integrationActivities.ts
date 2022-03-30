export async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

const INTEGRATIONS = defineIntegrations({
  asana: {
    setupFields: {
      personalAccessToken: {
        label: "Personal Access Token",
        defaultValue: undefined,
        type: "string",
        required: true,
        secret: true,
      },
    },
  },
  github: {
    setupFields: {
      personalAccessToken: {
        label: "Personal Access Token",
        defaultValue: undefined,
        type: "string",
        required: true,
        secret: true,
      },
      githubRepos: {
        label: "Github Repositories (separated by commas)",
        defaultValue: undefined,
        type: "string",
        required: true,
        secret: false,
      },
    },
  },
});

type AnyIntegrationDefinition = {
  setupFields: Record<
    string,
    {
      label: string;
      type: "string" | "number" | "date";
      defaultValue: string | number | Date | undefined;
      required: boolean;
      /** if secret = true, we shouldn't allow the user to see this value again after configured */
      secret: boolean;
    }
  >;
  // OAuth2 specific configuration info ?
  // when configured, this could very well be looking into the env vars to get
  // application id / application secret, as well as callback url and such.
  oauth2?: {};
};

function defineIntegrations<T extends Record<string, AnyIntegrationDefinition>>(
  x: T,
): T {
  return x;
}

export type IntegrationSetupState =
  | {
      type: "error";
      name: string;
      error: {
        message: string;
      };
    }
  | {
      type: "init";
      name: string;
      init: {};
    }
  | {
      type: "found";
      name: string;
      setupConfig: {
        fields: Record<
          string,
          // Parallel to some integration setup info
          {
            type: "string" | "number" | "date";
            currentValue: string | number | Date | undefined;
            required: boolean;
            secret: boolean;
          }
        >;
      };
      // /** To indicate if there are any issues with authentication or configuration */
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
export type IntegrationConfigAction = {
  type: "setConfig";
  setConfig: {
    fields: Record<string, any>;
  };
};

/**
 * This is the first step in managing an integration, where we
 * try to look up the integration in our configurations.
 *
 * And set up our initial state.
 */
export async function startIntegrationSetup(
  integrationName: string,
): Promise<IntegrationSetupState> {
  const integrationConfig = INTEGRATIONS[integrationName];

  if (!integrationConfig) {
    return {
      type: "error",
      name: integrationName,
      error: {
        message: `Integration for "${integrationName}" not found`,
      },
    };
  }

  return {
    type: "found",
    setupConfig: {},
  };
}
