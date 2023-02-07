import { useEffect, useMemo, useState } from "react";
import {
  SessionToken,
  AutofillSuggestion,
  AutofillSuggestionResponse,
  AutofillRetrieveResponse,
  AutofillFeatureSuggestion,
} from "@mapbox/search-js-core";
import axios from "axios";
import debounce from "lodash.debounce";
import { useSessionstorageState } from "rooks";
import { Address } from "./types.gen";

const MAPBOX_API_URL = "https://api.mapbox.com";

export const useMapbox = (accessToken: string) => {
  const [sessionToken, setSessionToken] =
    useSessionstorageState<SessionToken | null>("mapboxSessionToken", null);
  const [suggestions, setSuggestions] = useState<AutofillSuggestion[]>([]);
  const [selectedAddress, setSelectedAddress] =
    useState<AutofillFeatureSuggestion | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [mapFile, setMapFile] = useState<File | null>(null);

  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);

  const [mapLoading, setMapLoading] = useState("");

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
        setSuggestions(data.suggestions);
      })
      .catch(({ response }) => {
        setSuggestionsError(response.data.message);
      })
      .finally(() => {
        setSuggestionsLoading(false);
      });
  }, 300);

  const selectAddress = (addressId?: string) => {
    if (addressId) {
      axios
        .get<AutofillRetrieveResponse>(
          `${MAPBOX_API_URL}/autofill/v1/retrieve/${addressId}?access_token=${accessToken}&session_token=${sessionToken?.id}`,
        )
        .then(({ data }) => {
          setSelectedAddress(data.features[0]);
        });
    } else {
      setSelectedAddress(null);
      setMapUrl(null);
    }
  };

  useEffect(() => {
    const coords = selectedAddress?.geometry.coordinates;

    if (coords) {
      axios
        .get<any>(
          `${MAPBOX_API_URL}/styles/v1/mapbox/streets-v11/static/pin-s+555555(${coords[0]},${coords[1]})/${coords[0]},${coords[1]},16,0/600x400?access_token=${accessToken}&attribution=false&logo=false&sku=20d0104e2f29c-6abd-4991-8861-20cc6100bb5e`,
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
  }, [selectedAddress]);

  const address: Address | null = useMemo(
    () =>
      selectedAddress
        ? {
            label: selectedAddress.properties.feature_name,
            fullAddress: selectedAddress.properties.full_address!,
            description: "Enter your description here",
            mapUrl,
            file: mapFile,
            coordinates: selectedAddress.geometry.coordinates,
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
  };
};
