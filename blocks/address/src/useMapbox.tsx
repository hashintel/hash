import debounce from "lodash.debounce";
import { RefObject, useEffect, useMemo, useState } from "react";
import { useSessionstorageState } from "rooks";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import {
  AutofillFeatureSuggestion,
  AutofillSuggestion,
} from "@blockprotocol/service/dist/mapbox-types";
import { v4 as uuid } from "uuid";
import { MapboxRetrieveStaticMapData } from "@blockprotocol/service/.";

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
) => {
  const { serviceModule } = useServiceBlockModule(blockRootRef);
  const [sessionToken, setSessionToken] = useSessionstorageState<string | null>(
    "mapboxSessionToken",
    null,
  );
  const [suggestions, setSuggestions] = useState<AutofillSuggestion[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );
  const [selectedAddress, setSelectedAddress] =
    useState<AutofillFeatureSuggestion | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [mapFile, setMapFile] = useState<File | null>(null);

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

  const selectAddress = (suggestion?: AutofillSuggestion) => {
    if (suggestion) {
      setSelectedAddressId(suggestion?.action.id);
      serviceModule
        .mapboxRetrieveAddress({
          data: {
            suggestion,
            optionsArg: {
              sessionToken: sessionToken ?? uuid(),
            },
          },
        })
        .then(({ data }) => {
          if (data) {
            const address = data.features[0];
            if (address) {
              setSelectedAddress(address);
            }
          }
        });
    } else {
      setSelectedAddressId(null);
      setSelectedAddress(null);
      setMapUrl(null);
    }
  };

  useEffect(() => {
    if (shouldFetchImage) {
      const coords = selectedAddress?.geometry.coordinates;
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
            } as MapboxRetrieveStaticMapData,
          })
          .then((res) => {
            if (res.data) {
              let blob = new Blob(
                [toArrayBuffer(new Uint8Array(res.data.data))],
                {
                  type: "arraybuffer",
                },
              );

              setMapUrl(URL.createObjectURL(blob));
              setMapFile(new File([blob], "map"));
            }
          });
      }
    }
  }, [shouldFetchImage, selectedAddress, zoomLevel]);

  const address: Address | null = useMemo(
    () =>
      selectedAddress
        ? {
            featureName: selectedAddress.properties.feature_name,
            postalCode: selectedAddress.properties.postcode ?? "",
            streetAddress: selectedAddress.properties.address_line1 ?? "",
            addressRegion: selectedAddress.properties.address_level1 ?? "",
            addressCountry:
              selectedAddress.properties.metadata.iso_3166_1 ?? "",
            fullAddress: selectedAddress.properties.full_address ?? "",
            addressId: selectedAddressId!,
          }
        : null,
    [selectedAddress, mapUrl],
  );

  return {
    suggestions,
    fetchSuggestions,
    suggestionsLoading,
    suggestionsError,
    selectAddress,
    selectedAddress: address,
    mapFile,
  };
};
