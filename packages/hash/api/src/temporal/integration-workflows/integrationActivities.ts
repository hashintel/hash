import { INTEGRATIONS } from "./INTEGRATIONS";

export async function performIntegration(state: IntegrationState): Promise<{
  durationMs: number;
  result:
    | {
        ok: true;
        updates: number;
        inserts: number;
        // etc
      }
    | {
        ok: false;
        message: string;
        /** e.g. console logs? */
        details?: string;
      };
}> {
  const WAIT_FICTICIOUSLY_MS = 4000;
  console.error("Run integration: ", state);
  // this is where we should actually do something like tap piping

  // tap config from here:
  // includes secrets
  const tapConfig = Object.fromEntries(
    Object.entries(state.configuredFields).map(([key, { currentValue }]) => [
      key,
      currentValue,
    ]),
  );

  // Next step: Use node child process and such to actually execute the piping between taps and targets

  await delay(WAIT_FICTICIOUSLY_MS);
  return {
    durationMs: WAIT_FICTICIOUSLY_MS,
    result: {
      ok: false,
      message: `Need to actually use tap for "${state.integrationName}"`,
    },
  };
}

/** This is its own activity, so we can check the date this started */
export async function createNewPerformance(): Promise<IntegrationPerformance> {
  return {
    startedAtISO: new Date().toISOString(),
    settled: undefined,
  };
}

export type IntegrationPerformance = {
  startedAtISO: string;
  // eh... settled is Promise terminology for finally
  settled?: {
    /**
     * In milliseconds.
     * When null, the integration is in progress that started at this date.
     */
    durationMs: number;
    ok: boolean;
    message: string;
    details?: string;
  };
};

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
  /** Catalog of performances (the last performance, here, might actually be in progress)  */
  performances: Array<IntegrationPerformance>;
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
    performances: [],
  };
}

/** helper */
function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
