import {
  currentTimestamp,
  type ProvidedEntityEditionProvenance,
  type Url,
} from "@blockprotocol/type-system";

export const generateAeroApiProvenance: Pick<
  ProvidedEntityEditionProvenance,
  "sources"
> = {
  sources: [
    {
      type: "integration",
      location: {
        name: "FlightAware AeroAPI",
        uri: "https://aeroapi.flightaware.com/aeroapi/" as Url,
      },
      loadedAt: currentTimestamp(),
    },
  ],
};
