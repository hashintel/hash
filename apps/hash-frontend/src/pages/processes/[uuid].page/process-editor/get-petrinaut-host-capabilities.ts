import {
  type PetrinautHostCapabilities,
  petrinautHostCapabilitiesSchema,
} from "../../shared/messages";

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

const failOpenCapabilities: PetrinautHostCapabilities = {
  optimization: true,
};

/**
 * Ask the authenticated NodeAPI whether optimizer support is deliberately
 * configured for this HASH deployment.
 *
 * Only an explicit, valid `{ optimization: false }` response hides the UI.
 * HTTP failures, malformed responses, and network errors all fail open so a
 * transient service outage cannot make the feature disappear.
 */
export const getPetrinautHostCapabilities = async ({
  endpoint,
  fetchImpl = fetch,
  signal,
}: {
  endpoint: string;
  fetchImpl?: Fetch;
  signal?: AbortSignal;
}): Promise<PetrinautHostCapabilities> => {
  try {
    const response = await fetchImpl(endpoint, {
      credentials: "include",
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      return failOpenCapabilities;
    }

    const payload: unknown = await response.json();
    const parsed = petrinautHostCapabilitiesSchema.safeParse(payload);
    return parsed.success ? parsed.data : failOpenCapabilities;
  } catch {
    return failOpenCapabilities;
  }
};
