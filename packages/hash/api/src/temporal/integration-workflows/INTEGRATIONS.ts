/** Constant integration definitions */
export const INTEGRATIONS = defineIntegrations({
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

export type AnyIntegrationDefinition = {
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

// helper
function defineIntegrations(
  x: Record<string, AnyIntegrationDefinition>,
): Record<string, AnyIntegrationDefinition> {
  return x;
}
