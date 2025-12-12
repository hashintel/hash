import {
  currentTimestamp,
  type ProvidedEntityEditionProvenance,
  type Url,
} from "@blockprotocol/type-system";

export const generateAviationstackProvenance: Pick<
  ProvidedEntityEditionProvenance,
  "sources"
> = {
  sources: [
    {
      type: "integration" /** @todo make this a valid option in @blockprotocol/type-system */,
      location: {
        name: "Aviationstack API",
        uri: "https://api.aviationstack.com/v1/" as Url,
      },
      loadedAt: currentTimestamp(),
    },
  ],
};
