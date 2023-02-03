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

const MAPBOX_API_URL = "https://api.mapbox.com";

export const useMapbox = (accessToken: string) => {
  const [sessionToken, setSessionToken] =
    useSessionstorageState<SessionToken | null>("mapboxSessionToken", null);
  const [suggestions, setSuggestions] = useState<AutofillSuggestion[]>([]);
  const [selectedAddress, setSelectedAddress] =
    useState<AutofillFeatureSuggestion | null>();
  const [mapUrl, setMapUrl] = useState<string | null>(null);

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
    axios
      .get<AutofillRetrieveResponse>(
        `${MAPBOX_API_URL}/autofill/v1/retrieve/${addressId}?access_token=${accessToken}&session_token=${sessionToken?.id}`,
      )
      .then(({ data }) => {
        setSelectedAddress(data.features[0]);
      });
  };

  useEffect(() => {
    const coords = selectedAddress?.geometry.coordinates;

    if (coords) {
      axios
        .get<any>(
          `${MAPBOX_API_URL}/styles/v1/mapbox/streets-v11/static/${coords[0]},${coords[1]},16,0/600x400?access_token=${accessToken}&attribution=false&logo=false&sku=20d0104e2f29c-6abd-4991-8861-20cc6100bb5e`,
          {
            responseType: "arraybuffer",
          },
        )
        .then(({ data, headers }) => {
          let blob = new Blob([data], {
            type: headers["content-type"],
          });
          setMapUrl(URL.createObjectURL(blob));
        });
    }
  }, [selectedAddress]);

  return {
    suggestions,
    fetchSuggestions,
    suggestionsLoading,
    suggestionsError,
    selectAddress,
    mapUrl,
  };
};
