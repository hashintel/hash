import { frontendDomain } from "@local/hash-isomorphic-utils/environment";
import RudderAnalytics from "@rudderstack/rudder-sdk-node";

const RUDDERSTACK_KEY =
  process.env.HASH_API_RUDDERSTACK_KEY || "2SKw8Q5jz5g08LNKpk0Ag82N7HL";

export class Telemetry {
  private static rudder_client: RudderAnalytics | undefined | null = undefined;

  private static client(): RudderAnalytics | null {
    if (Telemetry.rudder_client === undefined) {
      if (frontendDomain === "localhost") {
        Telemetry.rudder_client = null;
        return null;
      }
      Telemetry.rudder_client = new RudderAnalytics(RUDDERSTACK_KEY, {
        dataPlaneUrl: "https://hashdjsn.dataplane.rudderstack.com",
      });
    }
    return Telemetry.rudder_client;
  }

  public static userRegister(params: {
    shortname: string;
    displayName: string;
    email: string;
  }): void {
    Telemetry.client()?.track({
      userId: params.email,
      event: "user_register",
      properties: {
        domain: frontendDomain,
        name: params.displayName,
        shortname: params.shortname,
        email: params.email,
      },
    });
  }
}
