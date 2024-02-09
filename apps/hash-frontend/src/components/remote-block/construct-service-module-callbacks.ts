import { ServiceEmbedderMessageCallbacks } from "@blockprotocol/service";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

type ServiceFunction =
  ServiceEmbedderMessageCallbacks[keyof ServiceEmbedderMessageCallbacks];

const callExternalApiMethod = async (params: {
  providerName: string;
  methodName: string;
  payload: Parameters<ServiceFunction>[0]["data"];
}): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  errors?: Awaited<ReturnType<ServiceFunction>>["errors"];
}> => {
  const response = await fetch(`${apiOrigin}/api/external-service-method`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const data = await response.json();

  if (response.ok) {
    return { data: data.externalServiceMethodResponse };
  } else {
    const { status } = response;

    return {
      errors: [
        {
          message:
            typeof data === "object" && "errors" in data
              ? data.errors?.[0]?.message
              : "An unknown error occurred.",
          // @ts-expect-error –– @todo why is this an error
          code:
            status === 401
              ? "FORBIDDEN"
              : status === 403
                ? "UNAUTHORIZED"
                : status === 429
                  ? "TOO_MANY_REQUESTS"
                  : "INTERNAL_ERROR",
        },
      ],
    };
  }
};

export const serviceModuleCallbacks: ServiceEmbedderMessageCallbacks = {
  /** OpenAI */

  openaiCreateImage: async ({ data: payload }) =>
    callExternalApiMethod({
      providerName: "openai",
      methodName: "createImage",
      payload,
    }),

  openaiCompleteChat: async ({ data: payload }) =>
    callExternalApiMethod({
      providerName: "openai",
      methodName: "completeChat",
      payload,
    }),

  /** Mapbox Geocoding API */

  mapboxForwardGeocoding: async ({ data: payload }) =>
    callExternalApiMethod({
      providerName: "mapbox",
      methodName: "forwardGeocoding",
      payload,
    }),

  mapboxReverseGeocoding: async ({ data: payload }) =>
    callExternalApiMethod({
      providerName: "mapbox",
      methodName: "reverseGeocoding",
      payload,
    }),

  /** Mapbox Directions API */

  mapboxRetrieveDirections: async ({ data: payload }) =>
    callExternalApiMethod({
      providerName: "mapbox",
      methodName: "retrieveDirections",
      payload,
    }),

  /** Mapbox Isochrone API */

  mapboxRetrieveIsochrones: async ({ data: payload }) =>
    callExternalApiMethod({
      providerName: "mapbox",
      methodName: "retrieveIsochrones",
      payload,
    }),

  /** Mapbox Autofill API */

  mapboxSuggestAddress: async ({ data: payload }) =>
    callExternalApiMethod({
      providerName: "mapbox",
      methodName: "suggestAddress",
      payload,
    }),

  mapboxRetrieveAddress: async ({ data: payload }) =>
    callExternalApiMethod({
      providerName: "mapbox",
      methodName: "retrieveAddress",
      payload,
    }),

  mapboxCanRetrieveAddress: async ({ data: payload }) =>
    callExternalApiMethod({
      providerName: "mapbox",
      methodName: "canRetrieveAddress",
      payload,
    }),

  /** Mapbox Static Map API */

  mapboxRetrieveStaticMap: async ({ data: payload }) =>
    callExternalApiMethod({
      providerName: "mapbox",
      methodName: "retrieveStaticMap",
      payload,
    }),
};
