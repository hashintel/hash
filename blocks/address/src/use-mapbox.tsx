import type { MapboxRetrieveStaticMapData } from "@blockprotocol/service";
import type {
  AutofillFeatureSuggestion,
  AutofillSuggestion,
} from "@blockprotocol/service/dist/mapbox-types";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import debounce from "lodash.debounce";
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import { useSessionstorageState } from "rooks";
import { v4 as uuid } from "uuid";

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
  blockRootRef: RefObject<HTMLDivElement | null>,
  zoomLevel: number,
  shouldFetchImage: boolean,
  onSelectAddress: (address: Address) => void,
  uploadMap: (mapFile: File, addressId: string) => Promise<void>,
  addressId?: string,
) => {
  const [selectedAddressLoading, setSelectedAddressLoading] = useState(false);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating */
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
  ] = useState<string | null>(addressId ?? null);
  const [address, setAddress] = useState<Address | null>(null);

  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!sessionToken) {
      const token = uuid();
      setSessionToken(token);
    }
  }, [sessionToken, setSessionToken]);

  const fetchSuggestions = debounce((query: string) => {
    setSuggestionsLoading(true);

    void serviceModule
      .mapboxSuggestAddress({
        data: {
          searchText: query,
          optionsArg: {
            sessionToken: sessionToken ?? uuid(),
          },
        },
      })
      .then(({ data, errors }) => {
        if (errors) {
          setSuggestionsError(true);
          return;
        }

        setSuggestionsError(false);
        if (data) {
          setSuggestions(data.suggestions);
        }
      })
      .finally(() => {
        setSuggestionsLoading(false);
      });
  }, 300);

  const selectAddress = useCallback(
    (suggestion?: AutofillSuggestion | string) => {
      if (suggestion) {
        const selectedAddressId =
          typeof suggestion === "string" ? suggestion : suggestion.action.id;

        setSelectedAddressLoading(true);

        void serviceModule
          .mapboxRetrieveAddress({
            data: {
              suggestion: {
                action: {
                  id: selectedAddressId,
                },
              } as AutofillSuggestion,
              optionsArg: {
                sessionToken: sessionToken ?? uuid(),
              },
            },
          })
          .then(({ data, errors }) => {
            if (errors) {
              setSuggestionsError(true);
              return;
            }

            setSuggestionsError(false);
            setMapError(false);
            if (data) {
              const selectedAddress = data.features[0];
              if (selectedAddress) {
                setSelectedMapboxSuggestionActionId(selectedAddressId);
                setSelectedMapboxSuggestion(selectedAddress);

                const addr = {
                  featureName: selectedAddress.properties.feature_name,
                  postalCode: selectedAddress.properties.postcode ?? "",
                  streetAddress: selectedAddress.properties.address_line1 ?? "",
                  addressRegion:
                    selectedAddress.properties.address_level1 ?? "",
                  addressCountry:
                    selectedAddress.properties.metadata.iso_3166_1.toUpperCase(),
                  fullAddress: selectedAddress.properties.full_address ?? "",
                  addressId: selectedAddressId,
                };

                setAddress(addr);
                onSelectAddress(addr);
              }
            }
          })
          .finally(() => {
            setSelectedAddressLoading(false);
          });
      } else {
        setSelectedAddressLoading(false);
        setSuggestionsError(false);
        setMapError(false);
        setSelectedMapboxSuggestionActionId(null);
        setSelectedMapboxSuggestion(null);
        setAddress(null);
      }
    },
    [onSelectAddress, serviceModule, sessionToken],
  );

  const [isFetchingImage, setIsFetchingImage] = useState(false);

  const [
    fetchedImageForSuggestionActionId,
    setFetchedImageForSuggestionActionId,
  ] = useState<string>();

  const fetchImage = useCallback(
    async (params: {
      longitude: number;
      latitude: number;
      mapboxSuggestionActionId: string;
      zoomLevel: number;
    }) => {
      setIsFetchingImage(true);
      const { data } = await serviceModule.mapboxRetrieveStaticMap({
        data: {
          username: "mapbox",
          style_id: "streets-v11",
          overlay: `pin-s+555555(${params.longitude},${params.latitude})`,
          width: 600,
          height: 400,
          lon: params.longitude,
          lat: params.latitude,
          zoom: params.zoomLevel,
          logo: false,
          attribution: false,
        } as MapboxRetrieveStaticMapData,
      });

      if (data) {
        setMapError(false);
        const blob = new Blob([toArrayBuffer(new Uint8Array(data.data))], {
          type: "arraybuffer",
        });
        const file = new File(
          [blob],
          `${params.mapboxSuggestionActionId}_${params.zoomLevel}x.png`,
        );
        await uploadMap(file, params.mapboxSuggestionActionId);
        setFetchedImageForSuggestionActionId(params.mapboxSuggestionActionId);
      } else {
        setMapError(true);
        setFetchedImageForSuggestionActionId(undefined);
      }
      setIsFetchingImage(false);
    },
    [serviceModule, uploadMap],
  );

  useEffect(() => {
    if (shouldFetchImage && selectedMapboxSuggestionActionId) {
      if (selectedMapboxSuggestion) {
        const [longitude, latitude] =
          selectedMapboxSuggestion.geometry.coordinates;

        if (
          longitude &&
          latitude &&
          // Ensure the image isn't currently being fetched
          !isFetchingImage &&
          // Ensure the image hasn't already been fetched
          (!fetchedImageForSuggestionActionId ||
            fetchedImageForSuggestionActionId !==
              selectedMapboxSuggestionActionId)
        ) {
          void fetchImage({
            longitude,
            latitude,
            mapboxSuggestionActionId: selectedMapboxSuggestionActionId,
            zoomLevel,
          });
        }
      } else {
        selectAddress(selectedMapboxSuggestionActionId);
      }
    }
  }, [
    isFetchingImage,
    shouldFetchImage,
    selectedMapboxSuggestion,
    selectedMapboxSuggestionActionId,
    zoomLevel,
    selectAddress,
    fetchedImageForSuggestionActionId,
    setFetchedImageForSuggestionActionId,
    fetchImage,
  ]);

  return {
    suggestions,
    fetchSuggestions,
    suggestionsLoading,
    suggestionsError,
    mapError,
    selectAddress,
    selectedAddress: address,
    selectedAddressLoading,
  };
};
