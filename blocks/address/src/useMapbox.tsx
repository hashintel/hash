import {
  AutofillFeatureSuggestion,
  AutofillRetrieveResponse,
  AutofillSuggestion,
  AutofillSuggestionResponse,
  SessionToken,
} from "@mapbox/search-js-core";
import axios from "axios";
import debounce from "lodash.debounce";
import { useEffect, useMemo, useState } from "react";
import { useSessionstorageState } from "rooks";

const MAPBOX_API_URL = "https://api.mapbox.com";

export type Address = {
  addressId: string;
  postalCode: string;
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  addressCountry: string;
  fullAddress: string;
  featureName: string;
};

export const useMapbox = (
  zoomLevel: number,
  shouldFetchImage: boolean,
  accessToken: string,
) => {
  const [sessionToken, setSessionToken] =
    useSessionstorageState<SessionToken | null>("mapboxSessionToken", null);
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
      const token = new SessionToken();
      setSessionToken(token);
    }
  }, []);

  const fetchSuggestions = debounce((query: string) => {
    setSuggestionsLoading(true);
    axios
      .get<AutofillSuggestionResponse>(
        `${MAPBOX_API_URL}/autofill/v1/suggest/${query}?types=country,region,place,district,locality,postcode,address,poi,poi.landmark&access_token=${accessToken}&session_token=${sessionToken?.id}&language=en&proximity=ip&streets=true`,
      )
      .then(({ data }) => {
        setSuggestionsError(false);
        setSuggestions(data.suggestions);
      })
      .catch(() => {
        setSuggestionsError(true);
      })
      .finally(() => {
        setSuggestionsLoading(false);
      });
  }, 300);

  const selectAddress = (addressId?: string) => {
    if (addressId) {
      setSelectedAddressId(addressId);
      axios
        .get<AutofillRetrieveResponse>(
          `${MAPBOX_API_URL}/autofill/v1/retrieve/${addressId}?access_token=${accessToken}&session_token=${sessionToken?.id}`,
        )
        .then(({ data }) => {
          const address = data.features[0];
          if (address) {
            setSelectedAddress(address);
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

      if (coords) {
        axios
          .get<any>(
            `${MAPBOX_API_URL}/styles/v1/mapbox/streets-v11/static/pin-s+555555(${coords[0]},${coords[1]})/${coords[0]},${coords[1]},${zoomLevel},0/600x400?access_token=${accessToken}&attribution=false&logo=false&sku=20d0104e2f29c-6abd-4991-8861-20cc6100bb5e`,
            {
              responseType: "arraybuffer",
            },
          )
          .then(({ data, headers }) => {
            let blob = new Blob([data], {
              type: headers["content-type"],
            });
            setMapUrl(URL.createObjectURL(blob));
            setMapFile(new File([blob], "map"));
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
            addressLocality: selectedAddress.properties.address_level2 ?? "",
            addressRegion: selectedAddress.properties.address_level1 ?? "",
            addressCountry: selectedAddress.properties.country ?? "",
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
