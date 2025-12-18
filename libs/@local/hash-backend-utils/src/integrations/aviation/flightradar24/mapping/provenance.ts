import {
  currentTimestamp,
  type ProvidedEntityEditionProvenance,
  type Url,
} from "@blockprotocol/type-system";

export const generateFlightradar24Provenance: Pick<
  ProvidedEntityEditionProvenance,
  "sources"
> = {
  sources: [
    {
      type: "integration",
      location: {
        name: "Flightradar24 API",
        uri: "https://fr24api.flightradar24.com/api/" as Url,
      },
      loadedAt: currentTimestamp(),
    },
  ],
};
