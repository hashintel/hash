import debounce from "lodash.debounce";
import { RefObject, useEffect, useMemo, useState } from "react";
import { useSessionstorageState } from "rooks";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import {
  AutofillFeatureSuggestion,
  AutofillSuggestion,
} from "@blockprotocol/service/dist/mapbox-types";
import { v4 as uuid } from "uuid";
import {
  MapboxRetrieveAddressData,
  MapboxRetrieveStaticMapData,
} from "@blockprotocol/service/.";

const toArrayBuffer = (buffer: Uint8Array) => {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    const bufferElem = buffer[i];
    if (bufferElem) {
      view[i] = bufferElem;
    }
  }
  return arrayBuffer;
};

export type Address = {
  addressId: string;
  postalCode: string;
  streetAddress: string;
  addressRegion: string;
  addressCountry: string;
  fullAddress: string;
  featureName: string;
};

export const useMapbox = (
  blockRootRef: RefObject<HTMLDivElement>,
  zoomLevel: number,
  shouldFetchImage: boolean,
  onSelectAddress: (address: Address) => void,
  uploadMap: (mapFile: File, addressId: string) => Promise<void>,
  addressId?: string,
) => {
  const { serviceModule } = useServiceBlockModule(blockRootRef);
  const [sessionToken, setSessionToken] = useSessionstorageState<string | null>(
    "mapboxSessionToken",
    null,
  );
  const [suggestions, setSuggestions] = useState<AutofillSuggestion[]>([]);
  const [selectedMapboxSuggestion, setSelectedMapboxSuggestion] =
    useState<AutofillFeatureSuggestion | null>(null);
  const [
    selectedMapboxSuggestionActionId,
    setSelectedMapboxSuggestionActionId,
  ] = useState<string | null>(addressId ? addressId : null);
  const [address, setAddress] = useState<Address | null>(null);

  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);

  useEffect(() => {
    if (!sessionToken) {
      const token = uuid();
      setSessionToken(token);
    }
  }, []);

  const fetchSuggestions = debounce((query: string) => {
    setSuggestionsLoading(true);

    serviceModule
      .mapboxSuggestAddress({
        data: {
          searchText: query,
          optionsArg: {
            sessionToken: sessionToken ?? uuid(),
          },
        },
      })
      .then(({ data }) => {
        setSuggestionsError(false);
        if (data) {
          setSuggestions(data.suggestions);
        }
      })
      .catch(() => {
        setSuggestionsError(true);
      })
      .finally(() => {
        setSuggestionsLoading(false);
      });
  }, 300);

  const selectAddress = (suggestion?: AutofillSuggestion | string) => {
    if (suggestion) {
      const addressId =
        typeof suggestion === "string" ? suggestion : suggestion?.action.id;
      serviceModule
        .mapboxRetrieveAddress({
          data: {
            suggestion: {
              action: {
                id: addressId,
              },
            } as AutofillSuggestion,
            optionsArg: {
              sessionToken: sessionToken ?? uuid(),
            },
          },
        })
        .then(async ({ data }) => {
          if (data) {
            const address = data.features[0];
            if (address) {
              setSelectedMapboxSuggestionActionId(addressId);
              setSelectedMapboxSuggestion(address);

              const addr = {
                featureName: address.properties.feature_name,
                postalCode: address.properties.postcode ?? "",
                streetAddress: address.properties.address_line1 ?? "",
                addressRegion: address.properties.address_level1 ?? "",
                addressCountry:
                  address.properties.metadata.iso_3166_1.toUpperCase() ?? "",
                fullAddress: address.properties.full_address ?? "",
                addressId,
              };

              setAddress(addr);
              onSelectAddress(addr);
            }
          }
        });
    } else {
      setSelectedMapboxSuggestionActionId(null);
      setSelectedMapboxSuggestion(null);
      setAddress(null);
    }
  };

  useEffect(() => {
    if (shouldFetchImage && selectedMapboxSuggestionActionId) {
      if (selectedMapboxSuggestion) {
        const coords = selectedMapboxSuggestion?.geometry.coordinates;

        if (coords?.[0] && coords?.[1]) {
          serviceModule
            .mapboxRetrieveStaticMap({
              data: {
                username: "mapbox",
                style_id: "streets-v11",
                overlay: `pin-s+555555(${coords[0]},${coords[1]})`,
                width: 600,
                height: 400,
                lon: coords[0],
                lat: coords[1],
                zoom: zoomLevel,
                logo: false,
                attribution: false,
              } as MapboxRetrieveStaticMapData,
            })
            .then(async (res) => {
              if (res.data) {
                let blob = new Blob(
                  [toArrayBuffer(new Uint8Array(res.data.data))],
                  {
                    type: "arraybuffer",
                  },
                );

                const file = new File(
                  [blob],
                  `${selectedMapboxSuggestionActionId}_${zoomLevel}x.png`,
                );

                await uploadMap(file, selectedMapboxSuggestionActionId);
              }
            });
        }
      } else {
        selectAddress(selectedMapboxSuggestionActionId);
      }
    }
  }, [
    shouldFetchImage,
    selectedMapboxSuggestion,
    selectedMapboxSuggestionActionId,
    zoomLevel,
  ]);

  return {
    suggestions,
    fetchSuggestions,
    suggestionsLoading,
    suggestionsError,
    selectAddress,
    selectedAddress: address,
  };
};
